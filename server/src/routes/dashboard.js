import { Router } from 'express';
import { Attendance, Batch, Exam, Inquiry, Payment, Student } from '../models/index.js';
import { examStats } from '../services/results.js';
import { dueList } from '../services/fees.js';
import { lastBackupInfo } from '../services/backup.js';
import { localDate, localMonth, monthRange } from '../utils/helpers.js';

const router = Router();

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

router.get('/', async (req, res) => {
  const today = localDate();
  const month = localMonth();
  const [from, to] = monthRange(month);
  const weekday = DAY_NAMES[new Date(`${today}T12:00:00Z`).getUTCDay()];

  const [activeStudents, totalStudents, batches, examCounts, recent, todaySheets, monthPayments, dues, lastBackup] = await Promise.all([
    Student.countDocuments({ status: 'active' }),
    Student.countDocuments(),
    Batch.find({ isActive: true }).select('name days startTime').sort({ startTime: 1, name: 1 }).lean(),
    Exam.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Exam.find().sort({ date: -1 }).limit(5).select('title date status totalMarks passMarks').lean(),
    Attendance.find({ date: today }).select('batch records').lean(),
    Payment.find({ paidAt: { $gte: new Date(`${from}T00:00:00+06:00`), $lte: new Date(`${to}T23:59:59.999+06:00`) } })
      .select('amount')
      .lean(),
    dueList({ month }),
    lastBackupInfo(),
  ]);
  const stats = await examStats(
    recent.map((e) => e._id),
    new Map(recent.map((e) => [String(e._id), e.passMarks])),
  );
  const byStatus = Object.fromEntries(examCounts.map((c) => [c._id, c.count]));
  const sheetBy = new Map(todaySheets.map((s) => [String(s.batch), s.records]));

  const isAdmin = req.user.role === 'admin';
  res.json({
    today,
    role: req.user.role,
    lastBackupAt: lastBackup?.at || null,
    newInquiries: isAdmin ? await Inquiry.countDocuments({ status: 'new' }) : 0,
    students: { active: activeStudents, total: totalStudents },
    batches: { active: batches.length },
    exams: { draft: byStatus.draft || 0, imported: byStatus.imported || 0, published: byStatus.published || 0 },
    recentExams: recent.map((e) => ({ ...e, stats: stats.get(String(e._id)) })),
    // Batches that have class today, and whether attendance is done
    classesToday: batches
      .filter((b) => b.days.includes(weekday) || sheetBy.has(String(b._id)))
      .map((b) => {
        const records = sheetBy.get(String(b._id));
        return {
          _id: b._id,
          name: b.name,
          startTime: b.startTime,
          taken: Boolean(records),
          present: records ? records.filter((r) => r.status !== 'absent').length : 0,
          absent: records ? records.filter((r) => r.status === 'absent').length : 0,
        };
      }),
    // Teachers don't see money
    fees: isAdmin && {
      month,
      collected: monthPayments.reduce((sum, p) => sum + p.amount, 0),
      payments: monthPayments.length,
      studentsWithDue: dues.length,
      totalDue: dues.reduce((sum, d) => sum + d.total, 0),
    },
  });
});

export default router;
