import { Attempt, Result, Student } from '../models/index.js';

/** Online MCQ exams: scoring and turning attempts into results. */

export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
// A little extra time for slow networks when the timer runs out
export const GRACE_MS = 60 * 1000;

const round2 = (n) => Math.round(n * 100) / 100;

export function marksPerQuestion(exam) {
  return exam.mcq?.length ? exam.totalMarks / exam.mcq.length : 0;
}

export function scoreAnswers(exam, answers = []) {
  let correct = 0;
  let wrong = 0;
  exam.mcq.forEach((q, i) => {
    const a = answers[i];
    if (a === null || a === undefined) return;
    if (a === q.answer) correct += 1;
    else wrong += 1;
  });
  const marks = round2(correct * marksPerQuestion(exam) - wrong * (exam.negativeMark || 0));
  return { correct, wrong, marks };
}

/** Is the exam open for starting right now? */
export function examWindow(exam, now = new Date()) {
  if (exam.opensAt && now < exam.opensAt) return 'upcoming';
  if (exam.closesAt && now > exam.closesAt) return 'closed';
  if (exam.status === 'published') return 'closed';
  return 'open';
}

/** Keep the Google-Form style analysis fields in step with the MCQ list, so question analysis just works. */
export function syncAnalysisFields(exam) {
  exam.sheetHeaders = exam.mcq.map((q, i) => `Q${i + 1}. ${q.text}`.slice(0, 300));
  exam.questions = exam.mcq.map((q, i) => ({ column: i, text: q.text, answer: LETTERS[q.answer] ?? '', chapter: q.chapter || '' }));
}

async function saveResult(exam, attempt) {
  const row = exam.mcq.map((_, i) => (attempt.answers[i] === null || attempt.answers[i] === undefined ? '' : LETTERS[attempt.answers[i]] ?? ''));
  await Result.updateOne(
    { exam: exam._id, student: attempt.student },
    { $set: { marks: attempt.marks, isAbsent: false, source: 'online', row }, $setOnInsert: { rank: null } },
    { upsert: true },
  );
}

/** Score and close one attempt (on submit, or when its time ran out). */
export async function finishAttempt(exam, attempt, at = new Date()) {
  Object.assign(attempt, scoreAnswers(exam, attempt.answers));
  attempt.submittedAt = attempt.submittedAt || (at > attempt.deadline ? attempt.deadline : at);
  await attempt.save();
  await saveResult(exam, attempt);
  if (exam.status === 'draft') {
    exam.status = 'imported';
    await exam.save();
  }
  return attempt;
}

/** Close every attempt whose time is over (or all of them, e.g. before publishing). */
export async function finishExpired(exam, all = false) {
  const filter = { exam: exam._id, submittedAt: null };
  if (!all) filter.deadline = { $lt: new Date(Date.now() - GRACE_MS) };
  const open = await Attempt.find(filter);
  for (const attempt of open) await finishAttempt(exam, attempt);
  return open.length;
}

/** The answer key changed: score every finished attempt again. */
export async function rescoreAll(exam) {
  const attempts = await Attempt.find({ exam: exam._id, submittedAt: { $ne: null } });
  for (const attempt of attempts) {
    Object.assign(attempt, scoreAnswers(exam, attempt.answers));
    await attempt.save();
    await saveResult(exam, attempt);
  }
  return attempts.length;
}

/** Active students of the exam's batches who never sat it are marked absent when the result is published. */
export async function markNonAttemptersAbsent(exam) {
  const students = await Student.find({ batch: { $in: exam.batches }, status: 'active' }).select('_id').lean();
  const have = new Set((await Result.find({ exam: exam._id }).select('student').lean()).map((r) => String(r.student)));
  const ops = students
    .filter((s) => !have.has(String(s._id)))
    .map((s) => ({ insertOne: { document: { exam: exam._id, student: s._id, marks: null, isAbsent: true, source: 'online' } } }));
  if (ops.length) await Result.bulkWrite(ops, { ordered: false });
  return ops.length;
}

/** What a student sees while sitting the exam: no answers, no explanations. */
export function paperFor(exam, attempt) {
  return {
    _id: exam._id,
    title: exam.title,
    totalMarks: exam.totalMarks,
    negativeMark: exam.negativeMark || 0,
    marksPerQuestion: round2(marksPerQuestion(exam)),
    durationMinutes: exam.durationMinutes,
    questions: exam.mcq.map((q) => ({ text: q.text, options: q.options })),
    answers: exam.mcq.map((_, i) => attempt.answers[i] ?? null),
    deadline: attempt.deadline,
    serverNow: new Date(),
    submittedAt: attempt.submittedAt || null,
  };
}
