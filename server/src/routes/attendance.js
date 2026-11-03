import { Router } from 'express';
import { z } from 'zod';
import { Attendance, Batch, Student } from '../models/index.js';
import { HttpError, assertObjectId, parse } from '../utils/http.js';
import { DATE_RE, MONTH_RE, localDate, localMonth, monthRange } from '../utils/helpers.js';

const router = Router();

/** One day of one batch: every active student with their mark (null if not taken yet). */
router.get('/', async (req, res) => {
  const batchId = req.query.batch;
  assertObjectId(batchId, 'batch');
  const date = req.query.date || localDate();
  if (!DATE_RE.test(date)) throw new HttpError(400, 'Date must look like 2026-11-03');
  const batch = await Batch.findById(batchId).select('name days').lean();
  if (!batch) throw new HttpError(404, 'Batch not found');

  const sheet = await Attendance.findOne({ batch: batchId, date }).lean();
  const marked = new Map((sheet?.records || []).map((r) => [String(r.student), r.status]));
  const students = await Student.find({
    $or: [{ batch: batchId, status: 'active' }, { _id: { $in: [...marked.keys()] } }],
  })
    .select('studentId name')
    .sort({ studentId: 1 })
    .lean();

  res.json({
    batch,
    date,
    taken: Boolean(sheet),
    updatedAt: sheet?.updatedAt,
    records: students.map((s) => ({
      student: s._id,
      studentId: s.studentId,
      name: s.name,
      status: marked.get(String(s._id)) || null,
    })),
  });
});

router.put('/', async (req, res) => {
  const body = parse(
    z.object({
      batch: z.string().refine((v) => /^[a-f\d]{24}$/i.test(v), 'Pick a batch'),
      date: z.string().regex(DATE_RE, 'Date must look like 2026-11-03'),
      records: z
        .array(
          z.object({
            student: z.string().refine((v) => /^[a-f\d]{24}$/i.test(v), 'Invalid student'),
            status: z.enum(['present', 'absent', 'late']),
          }),
        )
        .min(1, 'Mark at least one student')
        .max(500),
    }),
    req.body,
  );
  if (body.date > localDate()) throw new HttpError(400, 'Attendance cannot be taken for a future date');
  if (!(await Batch.exists({ _id: body.batch }))) throw new HttpError(404, 'Batch not found');

  const existing = await Attendance.findOne({ batch: body.batch, date: body.date }).lean();
  const allowed = new Set((existing?.records || []).map((r) => String(r.student)));
  const inBatch = await Student.find({ batch: body.batch }).select('_id').lean();
  inBatch.forEach((s) => allowed.add(String(s._id)));
  const unique = new Map(body.records.map((r) => [r.student, r.status]));
  for (const id of unique.keys()) {
    if (!allowed.has(id)) throw new HttpError(400, 'Some students are not in this batch');
  }

  const sheet = await Attendance.findOneAndUpdate(
    { batch: body.batch, date: body.date },
    {
      $set: {
        records: [...unique].map(([student, status]) => ({ student, status })),
        takenBy: req.user.id,
      },
    },
    { upsert: true, returnDocument: 'after', runValidators: true },
  );
  const counts = { present: 0, absent: 0, late: 0 };
  sheet.records.forEach((r) => (counts[r.status] += 1));
  res.json({ ok: true, date: sheet.date, counts });
});

/** Month view of a batch: days taken, and each student's present/absent/late counts. */
router.get('/summary', async (req, res) => {
  const batchId = req.query.batch;
  assertObjectId(batchId, 'batch');
  const month = req.query.month || localMonth();
  if (!MONTH_RE.test(month)) throw new HttpError(400, 'Month must look like 2026-11');
  const [from, to] = monthRange(month);

  const sheets = await Attendance.find({ batch: batchId, date: { $gte: from, $lte: to } })
    .sort({ date: 1 })
    .lean();
  const students = await Student.find({
    $or: [{ batch: batchId, status: 'active' }, { _id: { $in: sheets.flatMap((s) => s.records.map((r) => r.student)) } }],
  })
    .select('studentId name')
    .sort({ studentId: 1 })
    .lean();

  const byStudent = new Map(students.map((s) => [String(s._id), { present: 0, absent: 0, late: 0 }]));
  for (const sheet of sheets) {
    for (const r of sheet.records) {
      const c = byStudent.get(String(r.student));
      if (c) c[r.status] += 1;
    }
  }

  res.json({
    month,
    days: sheets.map((s) => {
      const c = { present: 0, absent: 0, late: 0 };
      s.records.forEach((r) => (c[r.status] += 1));
      return { date: s.date, ...c };
    }),
    students: students.map((s) => {
      const c = byStudent.get(String(s._id));
      const total = c.present + c.absent + c.late;
      return {
        _id: s._id,
        studentId: s.studentId,
        name: s.name,
        ...c,
        total,
        percent: total ? Math.round(((c.present + c.late) / total) * 100) : null,
      };
    }),
  });
});

/** Which batches have attendance taken today (for the dashboard / quick links). */
router.get('/today', async (req, res) => {
  const date = localDate();
  const batches = await Batch.find({ isActive: true }).select('name days').sort({ name: 1 }).lean();
  const sheets = await Attendance.find({ date }).select('batch records').lean();
  const byBatch = new Map(sheets.map((s) => [String(s.batch), s.records]));
  res.json({
    date,
    batches: batches.map((b) => {
      const records = byBatch.get(String(b._id));
      return {
        ...b,
        taken: Boolean(records),
        present: records ? records.filter((r) => r.status !== 'absent').length : 0,
        absent: records ? records.filter((r) => r.status === 'absent').length : 0,
      };
    }),
  });
});

export default router;
