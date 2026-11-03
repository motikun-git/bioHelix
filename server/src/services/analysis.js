import { Exam, Result } from '../models/index.js';

const norm = (v) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Google Forms writes checkbox answers as "A, B". Order shouldn't matter. */
export function isCorrect(given, answer) {
  const g = norm(given);
  const a = norm(answer);
  if (!g || !a) return false;
  if (g === a) return true;
  const set = (x) => x.split(/,\s*/).filter(Boolean).sort().join('|');
  return set(g) === set(a);
}

const SKIP_HEADER = /^(timestamp|email|email address|score|total score|name|full name|student name)$/i;

/** Columns that look like questions, with the answers students gave (most common first). */
export async function questionCandidates(exam) {
  const headers = exam.sheetHeaders || [];
  const skip = new Set([exam.columnMap?.studentId, exam.columnMap?.score]);
  const results = await Result.find({ exam: exam._id, 'row.0': { $exists: true } }).select('row').lean();
  const candidates = [];
  headers.forEach((text, column) => {
    if (skip.has(column) || SKIP_HEADER.test(text.trim())) return;
    const counts = new Map();
    for (const r of results) {
      const value = String(r.row[column] ?? '').trim();
      if (value) counts.set(value, (counts.get(value) || 0) + 1);
    }
    const options = [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count).slice(0, 12);
    candidates.push({ column, text, options });
  });
  return { responses: results.length, candidates };
}

/** Per-question and per-chapter stats for one exam. */
export async function examAnalysis(exam) {
  const questions = exam.questions || [];
  if (!questions.length) return { questions: [], chapters: [], responses: 0 };
  const results = await Result.find({ exam: exam._id, isAbsent: false, 'row.0': { $exists: true } }).select('row').lean();

  const qStats = questions.map((q, index) => {
    let correct = 0;
    let skipped = 0;
    const wrong = new Map();
    for (const r of results) {
      const given = String(r.row[q.column] ?? '').trim();
      if (!given) skipped += 1;
      else if (isCorrect(given, q.answer)) correct += 1;
      else wrong.set(given, (wrong.get(given) || 0) + 1);
    }
    const answered = results.length;
    const topWrong = [...wrong].sort((a, b) => b[1] - a[1])[0];
    return {
      number: index + 1,
      column: q.column,
      text: q.text,
      chapter: q.chapter || 'Untagged',
      answer: q.answer,
      correct,
      wrong: answered - correct - skipped,
      skipped,
      percent: answered ? Math.round((correct / answered) * 100) : null,
      commonWrong: topWrong ? { value: topWrong[0], count: topWrong[1] } : null,
    };
  });

  const chapterMap = new Map();
  for (const q of qStats) {
    const c = chapterMap.get(q.chapter) || { chapter: q.chapter, questions: 0, correct: 0, total: 0 };
    c.questions += 1;
    c.correct += q.correct;
    c.total += results.length;
    chapterMap.set(q.chapter, c);
  }
  const chapters = [...chapterMap.values()]
    .map((c) => ({ ...c, percent: c.total ? Math.round((c.correct / c.total) * 100) : null }))
    .sort((a, b) => (a.percent ?? 101) - (b.percent ?? 101));

  return { responses: results.length, questions: qStats, chapters };
}

/**
 * A student's chapter-wise accuracy across published exams that have
 * question analysis set up, next to the average of everyone who sat them.
 */
export async function studentChapters(studentId, examFilter = {}) {
  const exams = await Exam.find({ status: 'published', 'questions.0': { $exists: true }, ...examFilter })
    .select('questions title date')
    .lean();
  if (!exams.length) return [];
  const results = await Result.find({ exam: { $in: exams.map((e) => e._id) }, isAbsent: false, 'row.0': { $exists: true } })
    .select('exam student row')
    .lean();
  const examById = new Map(exams.map((e) => [String(e._id), e]));
  const chapters = new Map();
  const bump = (chapter, key, correct) => {
    const c = chapters.get(chapter) || { chapter, mine: 0, mineTotal: 0, all: 0, allTotal: 0 };
    c[key] += correct ? 1 : 0;
    c[`${key}Total`] += 1;
    chapters.set(chapter, c);
  };
  for (const r of results) {
    const exam = examById.get(String(r.exam));
    const isMine = String(r.student) === String(studentId);
    for (const q of exam.questions) {
      const ok = isCorrect(r.row[q.column], q.answer);
      const chapter = q.chapter || 'Untagged';
      bump(chapter, 'all', ok);
      if (isMine) bump(chapter, 'mine', ok);
    }
  }
  return [...chapters.values()]
    .filter((c) => c.mineTotal > 0)
    .map((c) => ({
      chapter: c.chapter,
      questions: c.mineTotal,
      correct: c.mine,
      percent: Math.round((c.mine / c.mineTotal) * 100),
      batchPercent: Math.round((c.all / c.allTotal) * 100),
    }))
    .sort((a, b) => a.percent - b.percent);
}
