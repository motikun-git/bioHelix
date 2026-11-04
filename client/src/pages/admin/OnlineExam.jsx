import { useEffect, useMemo, useState } from 'react';
import { get, put } from '../../lib/api.js';
import { Alert, Button, Loading, Panel, Textarea, cx, useLoad } from '../../components/ui.jsx';
import { AnalysisView } from './QuestionAnalysis.jsx';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const BN_LETTERS = ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ'];

const START = /^\s*(?:Q\s*)?(\d+)\s*[.)।:]\s*(.*)$/i;
const OPTION = /^\s*\(?([A-Fa-fকখগঘঙচ])\s*[.)।:]\s*(.*)$/;
const ANSWER = /^\s*(?:answer|ans|correct|উত্তর|সঠিক উত্তর)\s*[:：-]\s*(.+)$/i;
const CHAPTER = /^\s*(?:chapter|ch|অধ্যায়)\s*[:：-]\s*(.*)$/i;
const EXPLAIN = /^\s*(?:explanation|exp|ব্যাখ্যা)\s*[:：-]\s*(.*)$/i;

function letterIndex(ch) {
  const up = ch.toUpperCase();
  if (LETTERS.includes(up)) return LETTERS.indexOf(up);
  return BN_LETTERS.indexOf(ch);
}

/**
 * Turn pasted text into questions. One question looks like:
 *   1. Question text
 *   A) option   B) option ...   (or ক) খ) ...)
 *   Answer: B
 *   Chapter: Cell        (optional)
 *   Explanation: ...     (optional)
 */
export function parseQuestions(text) {
  const questions = [];
  const errors = [];
  let q = null;
  let field = null; // where loose lines go: text | option | explanation
  let blankSince = false;
  const finish = () => {
    if (!q) return;
    const n = questions.length + 1;
    if (!q.text.trim()) errors.push(`Question ${n}: no question text`);
    if (q.options.length < 2) errors.push(`Question ${n}: needs at least 2 options`);
    if (q.answer === null) errors.push(`Question ${n}: no "Answer:" line`);
    else if (q.answer >= q.options.length) errors.push(`Question ${n}: answer is not one of the options`);
    questions.push({ ...q, text: q.text.trim(), explanation: q.explanation.trim(), options: q.options.map((o) => o.trim()) });
    q = null;
  };
  const begin = (first) => {
    finish();
    q = { text: first, options: [], answer: null, chapter: '', explanation: '' };
    field = 'text';
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      blankSince = true;
      continue;
    }
    let m;
    if ((m = line.match(ANSWER)) && q) {
      const value = m[1].trim();
      const byLetter = value.length <= 3 ? letterIndex(value.replace(/[().\s]/g, '')) : -1;
      q.answer = byLetter >= 0 ? byLetter : q.options.findIndex((o) => o.trim().toLowerCase() === value.toLowerCase());
      if (q.answer < 0) q.answer = null;
      field = null;
    } else if ((m = line.match(CHAPTER)) && q) {
      q.chapter = m[1].trim();
      field = null;
    } else if ((m = line.match(EXPLAIN)) && q) {
      q.explanation = m[1];
      field = 'explanation';
    } else if ((m = line.match(OPTION)) && q && letterIndex(m[1]) === q.options.length && (q.text.trim() || q.options.length)) {
      q.options.push(m[2]);
      field = 'option';
    } else if ((m = line.match(START)) && (!q || q.options.length || q.answer !== null)) {
      begin(m[2]);
    } else if (!q || (blankSince && q.answer !== null)) {
      begin(line.trim());
    } else if (field === 'explanation') {
      q.explanation += `\n${line.trim()}`;
    } else if (field === 'option') {
      q.options[q.options.length - 1] += ` ${line.trim()}`;
    } else {
      q.text += `${q.text ? '\n' : ''}${line.trim()}`;
      field = 'text';
    }
    blankSince = false;
  }
  finish();
  return { questions, errors };
}

export function questionsToText(questions) {
  return questions
    .map((q, i) =>
      [
        `${i + 1}. ${q.text}`,
        ...q.options.map((o, j) => `${LETTERS[j]}) ${o}`),
        `Answer: ${LETTERS[q.answer] ?? ''}`,
        q.chapter && `Chapter: ${q.chapter}`,
        q.explanation && `Explanation: ${q.explanation}`,
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n');
}

const SAMPLE = `1. Which organelle makes most of the cell's ATP?
A) Nucleus
B) Mitochondria
C) Ribosome
D) Golgi body
Answer: B
Chapter: Cell
Explanation: Aerobic respiration happens in the mitochondria.

2. কোষ বিভাজনের কোন ধাপে ক্রোমোসোম সবচেয়ে স্পষ্ট দেখা যায়?
ক) প্রোফেজ
খ) মেটাফেজ
গ) অ্যানাফেজ
ঘ) টেলোফেজ
উত্তর: খ
অধ্যায়: কোষ বিভাজন`;

function Editor({ exam, initial, started, onSaved }) {
  const [text, setText] = useState(initial.length ? questionsToText(initial) : '');
  const [msg, setMsg] = useState({ tone: 'error', text: '' });
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => parseQuestions(text), [text]);
  const perQ = parsed.questions.length ? Math.round((exam.totalMarks / parsed.questions.length) * 100) / 100 : 0;

  const save = async () => {
    setBusy(true);
    setMsg({ text: '' });
    try {
      const res = await put(`/exams/${exam._id}/mcq`, { questions: parsed.questions });
      onSaved(`Saved ${res.questions.length} questions.${res.rescored ? ` ${res.rescored} answer sheets marked again with the new key.` : ''}`);
    } catch (err) {
      setMsg({ tone: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">
        Type or paste the questions (from Word, Google Docs...). Each question: a number, the options as A) B) C) D) or ক) খ) গ) ঘ), then <b>Answer:</b>. <b>Chapter:</b> and{' '}
        <b>Explanation:</b> lines are optional. Leave an empty line between questions.
      </p>
      {started && <Alert tone="warn">Students have started. You can fix text, answers and explanations (everyone is marked again), but not add or remove questions.</Alert>}
      <Textarea rows={16} value={text} onChange={(e) => setText(e.target.value)} placeholder={SAMPLE} className="font-mono text-sm" spellCheck={false} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={cx('text-sm font-semibold', parsed.errors.length ? 'text-fail' : 'text-pass')}>
          {parsed.questions.length} questions found
          {parsed.questions.length > 0 && `, ${perQ} marks each`}
          {exam.negativeMark > 0 && `, −${exam.negativeMark} per wrong answer`}
        </p>
        <div className="flex gap-2">
          {!text && (
            <Button variant="ghost" onClick={() => setText(SAMPLE)}>
              Show an example
            </Button>
          )}
          <Button onClick={save} loading={busy} disabled={!parsed.questions.length || parsed.errors.length > 0}>
            Save questions
          </Button>
        </div>
      </div>
      {parsed.errors.length > 0 && (
        <Alert>
          <ul className="list-disc pl-5">
            {parsed.errors.slice(0, 8).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Alert>
      )}
      <Alert tone={msg.tone}>{msg.text}</Alert>
      {parsed.questions.length > 0 && !parsed.errors.length && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-helix-dark">Preview as students see it</summary>
          <ol className="mt-3 space-y-3">
            {parsed.questions.map((q, i) => (
              <li key={i} className="rounded-lg border border-line p-3">
                <p className="whitespace-pre-line font-semibold">
                  {i + 1}. {q.text}
                </p>
                <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                  {q.options.map((o, j) => (
                    <li key={j} className={cx('rounded px-2 py-1', j === q.answer && 'bg-pass-tint font-semibold text-pass')}>
                      {LETTERS[j]}) {o}
                    </li>
                  ))}
                </ul>
                {(q.chapter || q.explanation) && (
                  <p className="mt-2 text-sm text-ink-soft">
                    {q.chapter && <b>{q.chapter}. </b>}
                    {q.explanation}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

const dt = (v) => (v ? new Date(v).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Dhaka' }) : '');

export default function OnlineExam({ exam, onChanged, version }) {
  const state = useLoad(() => get(`/exams/${exam._id}/mcq`), [exam._id, version]);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState('');
  useEffect(() => {
    if (state.data && !state.data.questions.length) setEditing(true);
  }, [state.data]);

  const now = Date.now();
  const status = !exam.opensAt
    ? { tone: 'bg-draft-tint text-draft', text: 'Hidden from students: set “Opens at” (Edit) when the questions are ready.' }
    : now < new Date(exam.opensAt)
      ? { tone: 'bg-helix-tint text-helix-dark', text: `Scheduled: opens ${dt(exam.opensAt)}${exam.closesAt ? `, closes ${dt(exam.closesAt)}` : ''}.` }
      : exam.closesAt && now > new Date(exam.closesAt)
        ? { tone: 'bg-paper text-ink-soft', text: `Closed ${dt(exam.closesAt)}. Publish the result when you are ready.` }
        : { tone: 'bg-pass-tint text-pass', text: `Open now${exam.closesAt ? ` until ${dt(exam.closesAt)}` : ' (no closing time)'}.` };

  return (
    <>
      <Panel
        title="Online exam"
        action={
          state.data?.questions.length > 0 &&
          !editing && (
            <button className="text-sm font-semibold text-helix-dark" onClick={() => setEditing(true)}>
              Edit questions
            </button>
          )
        }
      >
        <p className={cx('mb-3 rounded-lg px-3 py-2 text-sm font-semibold', status.tone)}>{status.text}</p>
        <Loading state={state}>
          {(d) => (
            <>
              <p className="mb-3 text-sm text-ink-soft">
                {d.questions.length} questions, {exam.durationMinutes} minutes each student
                {exam.negativeMark > 0 && `, −${exam.negativeMark} per wrong answer`}. Started: <b className="text-ink">{d.attempts.started}</b>, submitted:{' '}
                <b className="text-ink">{d.attempts.submitted}</b>
                {d.attempts.inProgress > 0 && `, still answering: ${d.attempts.inProgress}`}.
              </p>
              {editing ? (
                <Editor
                  exam={exam}
                  initial={d.questions}
                  started={d.attempts.started > 0}
                  onSaved={(text) => {
                    setSaved(text);
                    setEditing(false);
                    state.reload();
                    onChanged();
                  }}
                />
              ) : (
                <>
                  <Alert tone="success" className="mb-2">
                    {saved}
                  </Alert>
                  <p className="text-sm text-ink-soft">Results appear in the table above as students submit. Publishing marks anyone who never started as absent.</p>
                </>
              )}
            </>
          )}
        </Loading>
      </Panel>
      {exam.questions?.length > 0 && exam.status !== 'draft' && (
        <Panel title="Question analysis">
          <AnalysisView exam={exam} version={version} />
        </Panel>
      )}
    </>
  );
}
