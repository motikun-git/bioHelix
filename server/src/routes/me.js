import { Router } from 'express';
import { Exam, Notice, Result, Student } from '../models/index.js';
import { HttpError, assertObjectId } from '../utils/http.js';
import { MONTH_RE, localDate, localMonth, monthRange } from '../utils/helpers.js';
import { examStats } from '../services/results.js';
import { photoUrl } from '../services/photos.js';
import { attendanceCounts } from '../services/attendance.js';
import { feeAccount } from '../services/fees.js';
import { studentChapters } from '../services/analysis.js';
import { calendarItems } from './notices.js';

// Every route here reads the student ID from the login token, never from the URL,
// so a student cannot see anyone else's data by editing a link.
const router = Router();

router.get('/', async (req, res) => {
  const s = await Student.findById(req.user.id)
    .select('-passwordHash')
    .populate('program', 'name')
    .populate('batch', 'name days startTime endTime')
    .lean();
  if (!s) throw new HttpError(404, 'Student not found');
  res.json({
    studentId: s.studentId,
    name: s.name,
    phone: s.phone,
    guardianName: s.guardianName,
    college: s.college,
    session: s.session,
    program: s.program?.name,
    batch: s.batch,
    status: s.status,
    photoUrl: photoUrl(s.photo),
  });
});

async function publishedResults(studentId, examFilter = {}) {
  const exams = await Exam.find({ status: 'published', ...examFilter })
    .select('title date totalMarks passMarks mode')
    .lean();
  if (!exams.length) return [];
  const examById = new Map(exams.map((e) => [String(e._id), e]));
  const mine = await Result.find({ student: studentId, exam: { $in: exams.map((e) => e._id) } }).lean();
  const stats = await examStats(
    mine.map((r) => r.exam),
    new Map(exams.map((e) => [String(e._id), e.passMarks])),
  );
  return mine
    .map((r) => {
      const exam = examById.get(String(r.exam));
      const s = stats.get(String(r.exam));
      return {
        exam,
        marks: r.marks,
        isAbsent: r.isAbsent,
        rank: r.rank,
        passed: !r.isAbsent && r.marks !== null && r.marks >= exam.passMarks,
        percent: r.marks === null ? null : Math.round((r.marks / exam.totalMarks) * 1000) / 10,
        participants: s.present,
        highest: s.highest,
        average: s.average,
      };
    })
    .sort((a, b) => new Date(b.exam.date) - new Date(a.exam.date));
}

router.get('/results', async (req, res) => {
  res.json(await publishedResults(req.user.id));
});

router.get('/results/:examId', async (req, res) => {
  assertObjectId(req.params.examId, 'exam');
  const [result] = await publishedResults(req.user.id, { _id: req.params.examId });
  if (!result) throw new HttpError(404, 'Result not found');
  const chapters = result.isAbsent ? [] : await studentChapters(req.user.id, { _id: result.exam._id });
  res.json({ ...result, chapters });
});

/** Chapter-wise accuracy across all published exams with question analysis. */
router.get('/chapters', async (req, res) => {
  res.json(await studentChapters(req.user.id));
});

router.get('/attendance', async (req, res) => {
  const month = req.query.month || localMonth();
  if (!MONTH_RE.test(month)) throw new HttpError(400, 'Month must look like 2026-11');
  const [from, to] = monthRange(month);
  const [monthData, overall] = await Promise.all([
    attendanceCounts(req.user.id, { from, to }),
    attendanceCounts(req.user.id),
  ]);
  res.json({
    month,
    ...monthData,
    overall: { present: overall.present, absent: overall.absent, late: overall.late, total: overall.total, percent: overall.percent },
  });
});

async function myBatch(userId) {
  const s = await Student.findById(userId).select('batch program').populate('batch', 'name days startTime endTime').lean();
  if (!s) throw new HttpError(404, 'Student not found');
  return s;
}

router.get('/notices', async (req, res) => {
  const s = await myBatch(req.user.id);
  const notices = await Notice.find({
    $or: [{ audience: 'all' }, { audience: 'program', programs: s.program }, { audience: 'batch', batches: s.batch._id }],
  })
    .select('title body pinned createdAt')
    .sort({ pinned: -1, createdAt: -1 })
    .limit(30)
    .lean();
  res.json(notices);
});

/** Weekly routine plus everything on the calendar for the next 45 days. */
router.get('/schedule', async (req, res) => {
  const s = await myBatch(req.user.id);
  const from = localDate();
  const to = localDate(new Date(Date.now() + 45 * 24 * 60 * 60 * 1000));
  const items = await calendarItems({ from, to, batchIds: [s.batch._id] });
  res.json({
    routine: { batch: s.batch.name, days: s.batch.days, startTime: s.batch.startTime, endTime: s.batch.endTime },
    upcoming: items.map((i) => ({ _id: i._id, kind: i.kind, type: i.type, title: i.title, date: i.date, startTime: i.startTime, endTime: i.endTime, note: i.note })),
  });
});

router.get('/fees', async (req, res) => {
  const account = await feeAccount(req.user.id);
  res.json({
    ...account,
    payments: account.payments.map((p) => ({
      _id: p._id,
      receiptNo: p.receiptNo,
      kind: p.kind,
      month: p.month,
      amount: p.amount,
      discount: p.discount,
      method: p.method,
      paidAt: p.paidAt,
    })),
  });
});

export default router;
