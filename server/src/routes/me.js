import { Router } from 'express';
import { z } from 'zod';
import { Attempt, Exam, Material, Notice, Result, Student } from '../models/index.js';
import { GRACE_MS, examWindow, finishAttempt, finishExpired, paperFor, scoreAnswers, LETTERS } from '../services/online.js';
import { getSite } from './site.js';
import { parse } from '../utils/http.js';
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
  // Merit list: the top 10 (ties included), like the printed list on the notice board
  let top = [];
  if ((await getSite()).showMeritList) {
    const rows = await Result.find({ exam: result.exam._id, isAbsent: false, rank: { $ne: null, $lte: 10 } })
      .sort({ rank: 1, marks: -1 })
      .limit(30)
      .populate('student', 'name college')
      .lean();
    top = rows.map((r) => ({ rank: r.rank, marks: r.marks, name: r.student?.name || '', college: r.student?.college || '', me: String(r.student?._id) === String(req.user.id) }));
  }
  res.json({ ...result, chapters, top, online: result.exam.mode === 'online' });
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

// ---------- Study materials ----------
router.get('/materials', async (req, res) => {
  const s = await myBatch(req.user.id);
  const items = await Material.find({ program: s.program, $or: [{ batches: { $size: 0 } }, { batches: s.batch._id }] })
    .select('title kind url note chapter createdAt')
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();
  res.json(items);
});

// ---------- Online exams ----------
async function myOnlineExam(req) {
  assertObjectId(req.params.examId, 'exam');
  const s = await myBatch(req.user.id);
  const exam = await Exam.findOne({ _id: req.params.examId, mode: 'online', batches: s.batch._id, opensAt: { $ne: null } });
  if (!exam || !exam.mcq.length) throw new HttpError(404, 'Exam not found');
  return exam;
}

/** Online exams for my batch: upcoming, open now, and past ones. */
router.get('/exams', async (req, res) => {
  const s = await myBatch(req.user.id);
  // Only exams with an opening time are shown (admins set it when the questions are ready)
  const exams = await Exam.find({ mode: 'online', batches: s.batch._id, 'mcq.0': { $exists: true }, opensAt: { $ne: null } })
    .select('title date opensAt closesAt durationMinutes totalMarks negativeMark status mcq')
    .sort({ date: -1 })
    .limit(100);
  const attempts = await Attempt.find({ student: req.user.id, exam: { $in: exams.map((e) => e._id) } }).lean();
  const byExam = new Map(attempts.map((a) => [String(a.exam), a]));
  const now = new Date();
  res.json(
    exams.map((e) => {
      const a = byExam.get(String(e._id));
      const timeUp = a && !a.submittedAt && now > new Date(a.deadline.getTime() + GRACE_MS);
      return {
        _id: e._id,
        title: e.title,
        date: e.date,
        opensAt: e.opensAt,
        closesAt: e.closesAt,
        durationMinutes: e.durationMinutes,
        questions: e.mcq.length,
        totalMarks: e.totalMarks,
        negativeMark: e.negativeMark,
        window: examWindow(e, now),
        published: e.status === 'published',
        attempt: a ? { state: a.submittedAt || timeUp ? 'submitted' : 'running', marks: a.submittedAt ? a.marks : null, deadline: a.deadline } : null,
      };
    }),
  );
});

/** Start (or continue) the exam. The clock starts on the first call. */
router.post('/exams/:examId/start', async (req, res) => {
  const exam = await myOnlineExam(req);
  let attempt = await Attempt.findOne({ exam: exam._id, student: req.user.id });
  if (!attempt) {
    if (examWindow(exam) !== 'open') throw new HttpError(400, 'This exam is not open now. / পরীক্ষাটি এখন চালু নেই।');
    const now = new Date();
    let deadline = new Date(now.getTime() + exam.durationMinutes * 60 * 1000);
    if (exam.closesAt && exam.closesAt < deadline) deadline = exam.closesAt;
    try {
      attempt = await Attempt.create({ exam: exam._id, student: req.user.id, startedAt: now, deadline, answers: exam.mcq.map(() => null) });
    } catch (err) {
      if (err.code !== 11000) throw err;
      attempt = await Attempt.findOne({ exam: exam._id, student: req.user.id }); // double tap
    }
  }
  if (!attempt.submittedAt && Date.now() > attempt.deadline.getTime() + GRACE_MS) await finishAttempt(exam, attempt);
  res.json(paperFor(exam, attempt));
});

const answersSchema = z.object({ answers: z.array(z.number().int().min(0).max(LETTERS.length - 1).nullable()).max(300) });

function cleanAnswers(exam, answers) {
  return exam.mcq.map((q, i) => {
    const a = answers[i];
    return a === null || a === undefined || a >= q.options.length ? null : a;
  });
}

/** Autosave while answering. */
router.put('/exams/:examId/answers', async (req, res) => {
  const exam = await myOnlineExam(req);
  const { answers } = parse(answersSchema, req.body);
  const attempt = await Attempt.findOne({ exam: exam._id, student: req.user.id });
  if (!attempt) throw new HttpError(400, 'Start the exam first');
  if (attempt.submittedAt) throw new HttpError(409, 'Already submitted. / জমা দেওয়া হয়ে গেছে।');
  if (Date.now() > attempt.deadline.getTime() + GRACE_MS) {
    await finishAttempt(exam, attempt);
    throw new HttpError(409, 'Time is up. Your saved answers were submitted. / সময় শেষ, সেভ করা উত্তর জমা হয়েছে।');
  }
  attempt.answers = cleanAnswers(exam, answers);
  await attempt.save();
  res.json({ ok: true, savedAt: new Date() });
});

router.post('/exams/:examId/submit', async (req, res) => {
  const exam = await myOnlineExam(req);
  const { answers } = parse(answersSchema, req.body);
  const attempt = await Attempt.findOne({ exam: exam._id, student: req.user.id });
  if (!attempt) throw new HttpError(400, 'Start the exam first');
  if (!attempt.submittedAt) {
    // Answers sent after the time (plus a minute of grace) are ignored; the last autosave counts
    if (Date.now() <= attempt.deadline.getTime() + GRACE_MS) attempt.answers = cleanAnswers(exam, answers);
    await finishAttempt(exam, attempt);
  }
  res.json({ marks: attempt.marks, correct: attempt.correct, wrong: attempt.wrong, totalMarks: exam.totalMarks, published: exam.status === 'published' });
});

/** After the result is published: every question with the right answer and explanation. */
router.get('/exams/:examId/review', async (req, res) => {
  const exam = await myOnlineExam(req);
  if (exam.status !== 'published') throw new HttpError(403, 'Answers are shown after the result is published. / রেজাল্ট প্রকাশের পর উত্তর দেখা যাবে।');
  await finishExpired(exam);
  const attempt = await Attempt.findOne({ exam: exam._id, student: req.user.id }).lean();
  const answers = attempt?.answers || [];
  res.json({
    title: exam.title,
    totalMarks: exam.totalMarks,
    negativeMark: exam.negativeMark,
    sat: Boolean(attempt),
    ...(attempt ? scoreAnswers(exam, answers) : {}),
    questions: exam.mcq.map((q, i) => ({ text: q.text, options: q.options, answer: q.answer, explanation: q.explanation, chapter: q.chapter, mine: answers[i] ?? null })),
  });
});

export default router;
