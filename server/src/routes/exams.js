import { Router } from 'express';
import { notifyResult } from '../services/sms.js';
import { z } from 'zod';
import { Attempt, Batch, Exam, Program, Result, Student } from '../models/index.js';
import { LETTERS, finishExpired, markNonAttemptersAbsent, rescoreAll, syncAnalysisFields } from '../services/online.js';
import { HttpError, assertObjectId, parse, parsePatch } from '../utils/http.js';
import { csvUpload } from '../middleware/upload.js';
import { describeRows, extractSheetId, readCsv, readSheet } from '../services/sheets.js';
import { examStats, importExamRows, rankExam, saveManualMarks } from '../services/results.js';
import { examAnalysis, questionCandidates } from '../services/analysis.js';
import { photoUrl } from '../services/photos.js';

const router = Router();

const objectId = (msg) => z.string().refine((v) => /^[a-f\d]{24}$/i.test(v), msg);

const examFields = z.object({
  title: z.string().trim().min(2).max(120),
  program: objectId('Pick a program'),
  batches: z.array(objectId('Invalid batch')).min(1, 'Pick at least one batch'),
  date: z.coerce.date(),
  mode: z.enum(['google_form', 'offline', 'online']),
  totalMarks: z.coerce.number().positive().max(1000),
  passMarks: z.coerce.number().min(0).default(0),
  negativeMark: z.coerce.number().min(0).max(10).default(0),
  // Online exams: when it can be taken and how long each student gets
  opensAt: z.coerce.date().nullable().optional(),
  closesAt: z.coerce.date().nullable().optional(),
  durationMinutes: z.coerce.number().int().min(1).max(600).optional(),
});
const examSchema = examFields.refine((e) => e.passMarks <= e.totalMarks, {
  message: 'Pass marks cannot be more than total marks',
  path: ['passMarks'],
});

async function loadExam(id) {
  assertObjectId(id);
  const exam = await Exam.findById(id);
  if (!exam) throw new HttpError(404, 'Exam not found');
  return exam;
}

function notOnline(exam) {
  if (exam.mode === 'online') throw new HttpError(400, 'Online exams get their marks from the website itself');
}

async function checkBatches(programId, batchIds) {
  if (!(await Program.exists({ _id: programId }))) throw new HttpError(400, 'Program not found');
  const count = await Batch.countDocuments({ _id: { $in: batchIds }, program: programId });
  if (count !== new Set(batchIds).size) throw new HttpError(400, 'All batches must belong to the chosen program');
}

router.get('/', async (req, res) => {
  const filter = {};
  if (req.query.program) {
    assertObjectId(req.query.program, 'program');
    filter.program = req.query.program;
  }
  if (['draft', 'imported', 'published'].includes(req.query.status)) filter.status = req.query.status;
  const exams = await Exam.find(filter)
    .select('-lastImport -sheetHeaders -questions')
    .populate('program', 'name code')
    .populate('batches', 'name')
    .sort({ date: -1 })
    .limit(200)
    .lean();
  const stats = await examStats(
    exams.map((e) => e._id),
    new Map(exams.map((e) => [String(e._id), e.passMarks])),
  );
  res.json(exams.map((e) => ({ ...e, stats: stats.get(String(e._id)) })));
});

function checkWindow(opensAt, closesAt) {
  if (opensAt && closesAt && closesAt <= opensAt) throw new HttpError(400, 'Closing time must be after opening time');
}

router.post('/', async (req, res) => {
  const data = parse(examSchema, req.body);
  checkWindow(data.opensAt, data.closesAt);
  await checkBatches(data.program, data.batches);
  res.status(201).json(await Exam.create(data));
});

router.get('/:id', async (req, res) => {
  const exam = await loadExam(req.params.id);
  await exam.populate([
    { path: 'program', select: 'name code' },
    { path: 'batches', select: 'name' },
  ]);
  const stats = await examStats([exam._id], new Map([[String(exam._id), exam.passMarks]]));
  res.json({ ...exam.toObject(), stats: stats.get(String(exam._id)) });
});

router.patch('/:id', async (req, res) => {
  const exam = await loadExam(req.params.id);
  const data = parsePatch(examFields, req.body);
  if (data.program && String(data.program) !== String(exam.program) && exam.status !== 'draft') {
    throw new HttpError(400, 'Results already exist, so the program cannot change');
  }
  if (data.mode && data.mode !== exam.mode && exam.status !== 'draft') {
    throw new HttpError(400, 'Results already exist, so the exam type cannot change');
  }
  checkWindow(data.opensAt === undefined ? exam.opensAt : data.opensAt, data.closesAt === undefined ? exam.closesAt : data.closesAt);
  const program = data.program || exam.program;
  if (data.batches || data.program) await checkBatches(program, data.batches || exam.batches.map(String));
  const total = data.totalMarks ?? exam.totalMarks;
  if ((data.passMarks ?? exam.passMarks) > total) throw new HttpError(400, 'Pass marks cannot be more than total marks');
  if (data.totalMarks && (await Result.exists({ exam: exam._id, marks: { $gt: data.totalMarks } }))) {
    throw new HttpError(400, 'Some students already have more marks than this total');
  }
  const totalChanged = data.totalMarks !== undefined && data.totalMarks !== exam.totalMarks;
  const negativeChanged = data.negativeMark !== undefined && data.negativeMark !== exam.negativeMark;
  Object.assign(exam, data);
  await exam.save();
  if (exam.mode === 'online' && (totalChanged || negativeChanged)) {
    await rescoreAll(exam);
    if (exam.status === 'published') await rankExam(exam._id);
  }
  res.json(exam);
});

router.delete('/:id', async (req, res) => {
  const exam = await loadExam(req.params.id);
  if (exam.status === 'published') throw new HttpError(400, 'Unpublish the exam before deleting it');
  await Result.deleteMany({ exam: exam._id });
  await Attempt.deleteMany({ exam: exam._id });
  await exam.deleteOne();
  res.json({ ok: true });
});

// ---------- Google Sheet / CSV import ----------
function previewPayload(rows) {
  const { headers, body, guess } = describeRows(rows);
  return { headers, sample: body.slice(0, 5), totalRows: body.length, guess };
}

const columnMapSchema = z.object({
  studentId: z.coerce.number().int().min(0),
  score: z.coerce.number().int().min(0),
});

router.post('/:id/sheet/preview', async (req, res) => {
  const exam = await loadExam(req.params.id);
  notOnline(exam);
  const { sheetUrl, sheetRange } = parse(
    z.object({ sheetUrl: z.string().min(1, 'Paste the Google Sheet link'), sheetRange: z.string().trim().max(100).optional() }),
    req.body,
  );
  const sheetId = extractSheetId(sheetUrl);
  const { rows, range } = await readSheet(sheetId, sheetRange || undefined);
  exam.sheetId = sheetId;
  exam.sheetRange = range;
  await exam.save();
  res.json({ ...previewPayload(rows), sheetRange: range });
});

router.post('/:id/sheet/import', async (req, res) => {
  const exam = await loadExam(req.params.id);
  notOnline(exam);
  if (!exam.sheetId) throw new HttpError(400, 'Preview the sheet first');
  const columnMap = parse(columnMapSchema, req.body.columnMap);
  const { rows } = await readSheet(exam.sheetId, exam.sheetRange || undefined);
  const { headers, body } = describeRows(rows);
  exam.columnMap = columnMap;
  const report = await importExamRows(exam, headers, body, columnMap, 'sheet');
  res.json(report);
});

router.post('/:id/csv/preview', csvUpload, async (req, res) => {
  await loadExam(req.params.id);
  if (!req.file) throw new HttpError(400, 'Choose a CSV file');
  res.json(previewPayload(readCsv(req.file.buffer)));
});

router.post('/:id/csv/import', csvUpload, async (req, res) => {
  const exam = await loadExam(req.params.id);
  notOnline(exam);
  if (!req.file) throw new HttpError(400, 'Choose a CSV file');
  const columnMap = parse(columnMapSchema, {
    studentId: req.body.studentIdColumn,
    score: req.body.scoreColumn,
  });
  const { headers, body } = describeRows(readCsv(req.file.buffer));
  exam.columnMap = columnMap;
  res.json(await importExamRows(exam, headers, body, columnMap, 'csv'));
});

// ---------- Offline marks ----------
/** Students of the exam's batches plus anyone who already has a result, with their marks. */
router.get('/:id/roster', async (req, res) => {
  const exam = await loadExam(req.params.id);
  const results = await Result.find({ exam: exam._id }).lean();
  const resultBy = new Map(results.map((r) => [String(r.student), r]));
  const students = await Student.find({
    $or: [{ batch: { $in: exam.batches }, status: 'active' }, { _id: { $in: results.map((r) => r.student) } }],
  })
    .select('studentId name batch')
    .populate('batch', 'name')
    .sort({ studentId: 1 })
    .lean();
  res.json(
    students.map((s) => {
      const r = resultBy.get(String(s._id));
      return {
        student: s._id,
        studentId: s.studentId,
        name: s.name,
        batch: s.batch?.name,
        marks: r?.marks ?? null,
        isAbsent: r?.isAbsent ?? false,
        hasResult: Boolean(r),
      };
    }),
  );
});

router.put('/:id/marks', async (req, res) => {
  const exam = await loadExam(req.params.id);
  notOnline(exam);
  const { entries } = parse(
    z.object({
      entries: z
        .array(
          z.object({
            student: objectId('Invalid student'),
            marks: z.number().min(0).nullable(),
            isAbsent: z.boolean().default(false),
          }),
        )
        .max(1000),
    }),
    req.body,
  );
  await saveManualMarks(exam, entries);
  res.json({ ok: true, saved: entries.length });
});

// ---------- Online MCQ exam: questions ----------
const mcqSchema = z.object({
  questions: z
    .array(
      z.object({
        text: z.string().trim().min(1, 'A question has no text').max(2000),
        options: z.array(z.string().trim().min(1, 'An option is empty').max(500)).min(2, 'Each question needs at least 2 options').max(LETTERS.length),
        answer: z.number().int().min(0),
        chapter: z.string().trim().max(80).default(''),
        explanation: z.string().trim().max(2000).default(''),
      }),
    )
    .max(300, '300 questions at most'),
});

router.get('/:id/mcq', async (req, res) => {
  const exam = await loadExam(req.params.id);
  if (exam.mode !== 'online') throw new HttpError(400, 'Not an online exam');
  await finishExpired(exam);
  const [started, submitted] = await Promise.all([
    Attempt.countDocuments({ exam: exam._id }),
    Attempt.countDocuments({ exam: exam._id, submittedAt: { $ne: null } }),
  ]);
  res.json({ questions: exam.mcq, attempts: { started, submitted, inProgress: started - submitted } });
});

router.put('/:id/mcq', async (req, res) => {
  const exam = await loadExam(req.params.id);
  if (exam.mode !== 'online') throw new HttpError(400, 'Not an online exam');
  const { questions } = parse(mcqSchema, req.body);
  questions.forEach((q, i) => {
    if (q.answer >= q.options.length) throw new HttpError(400, `Question ${i + 1}: the answer is not one of the options`);
  });
  const started = await Attempt.exists({ exam: exam._id });
  if (started && questions.length !== exam.mcq.length) {
    throw new HttpError(400, 'Students have started this exam, so questions cannot be added or removed. You can still fix text, answers and explanations.');
  }
  exam.mcq = questions;
  syncAnalysisFields(exam);
  await exam.save();
  const rescored = started ? await rescoreAll(exam) : 0;
  if (rescored && exam.status === 'published') await rankExam(exam._id);
  res.json({ questions: exam.mcq, rescored });
});

// ---------- Question-wise analysis (Google Form exams) ----------
router.get('/:id/questions', async (req, res) => {
  const exam = await loadExam(req.params.id);
  const { responses, candidates } = await questionCandidates(exam);
  res.json({ responses, candidates, questions: exam.questions || [] });
});

router.put('/:id/questions', async (req, res) => {
  const exam = await loadExam(req.params.id);
  notOnline(exam);
  if (!exam.sheetHeaders?.length) throw new HttpError(400, 'Import the Google Form responses first');
  const { questions } = parse(
    z.object({
      questions: z
        .array(
          z.object({
            column: z.number().int().min(0),
            answer: z.string().trim().min(1, 'Every question needs a correct answer').max(500),
            chapter: z.string().trim().max(80).default(''),
          }),
        )
        .max(300),
    }),
    req.body,
  );
  const columns = new Set();
  exam.questions = questions.map((q) => {
    if (q.column >= exam.sheetHeaders.length) throw new HttpError(400, 'Unknown question column');
    if (columns.has(q.column)) throw new HttpError(400, 'A question was added twice');
    if ([exam.columnMap?.studentId, exam.columnMap?.score].includes(q.column)) {
      throw new HttpError(400, 'The Student ID or Score column cannot be a question');
    }
    columns.add(q.column);
    return { column: q.column, text: exam.sheetHeaders[q.column], answer: q.answer, chapter: q.chapter };
  });
  await exam.save();
  res.json({ ok: true, questions: exam.questions });
});

router.get('/:id/analysis', async (req, res) => {
  const exam = await loadExam(req.params.id);
  res.json(await examAnalysis(exam));
});

// ---------- Results & publishing ----------
router.get('/:id/results', async (req, res) => {
  const exam = await loadExam(req.params.id);
  const results = await Result.find({ exam: exam._id })
    .select('-row')
    .populate({ path: 'student', select: 'studentId name batch photo', populate: { path: 'batch', select: 'name' } })
    .lean();
  results.sort((a, b) => {
    if (a.isAbsent !== b.isAbsent) return a.isAbsent ? 1 : -1;
    return (b.marks ?? -1) - (a.marks ?? -1);
  });
  res.json(
    results.map((r) => ({
      _id: r._id,
      marks: r.marks,
      isAbsent: r.isAbsent,
      rank: r.rank,
      source: r.source,
      passed: !r.isAbsent && r.marks !== null && r.marks >= exam.passMarks,
      student: r.student && {
        _id: r.student._id,
        studentId: r.student.studentId,
        name: r.student.name,
        batch: r.student.batch?.name,
        photoUrl: photoUrl(r.student.photo),
      },
    })),
  );
});

router.post('/:id/publish', async (req, res) => {
  const exam = await loadExam(req.params.id);
  if (exam.mode === 'online') {
    if (exam.closesAt && exam.closesAt > new Date() && !req.body?.force) {
      throw new HttpError(400, 'The exam is still open. Publish after it closes.', { code: 'STILL_OPEN' });
    }
    await finishExpired(exam, true);
    await markNonAttemptersAbsent(exam);
  }
  const present = await Result.countDocuments({ exam: exam._id, isAbsent: false, marks: { $ne: null } });
  if (!present) throw new HttpError(400, 'No marks yet. Import results or enter marks first.');
  await rankExam(exam._id);
  exam.status = 'published';
  exam.publishedAt = new Date();
  await exam.save();
  notifyResult(exam._id);
  res.json({ ok: true, status: exam.status });
});

router.post('/:id/unpublish', async (req, res) => {
  const exam = await loadExam(req.params.id);
  exam.status = 'imported';
  exam.publishedAt = undefined;
  await exam.save();
  res.json({ ok: true, status: exam.status });
});

export default router;
