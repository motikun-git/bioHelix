import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { get, post, put } from '../../lib/api.js';
import { useT } from '../../lib/i18n.jsx';
import { formatDate, num } from '../../lib/format.js';
import { Alert, Button, Empty, Loading, Panel, Spinner, cx, useLoad } from '../../components/ui.jsx';

const LETTERS = { en: ['A', 'B', 'C', 'D', 'E', 'F'], bn: ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ'] };

const dtFmts = {};
/** "5 Nov, 4:30 pm" in Dhaka time. */
function dateTime(value, locale) {
  if (!value) return '';
  dtFmts[locale] ||= new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Dhaka' });
  return dtFmts[locale].format(new Date(value));
}

// ================= Exam list =================

export function PortalExams() {
  const { t, n, locale } = useT();
  const navigate = useNavigate();
  const state = useLoad(() => get('/me/exams'));

  const start = (exam) => {
    if (!exam.attempt && !window.confirm(t('ex.startConfirm'))) return;
    navigate(`/portal/exams/${exam._id}/take`);
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t('ex.title')}</h1>
      <Loading state={state}>
        {(list) =>
          list.length === 0 ? (
            <Empty title={t('ex.none')} />
          ) : (
            <ul className="space-y-3">
              {list.map((e) => {
                const running = e.attempt?.state === 'running';
                const done = e.attempt?.state === 'submitted';
                return (
                  <li key={e._id} className={cx('rounded-xl border bg-white p-4', e.window === 'open' && !done ? 'border-helix' : 'border-line')}>
                    <p className="text-lg font-semibold">{e.title}</p>
                    <p className="text-sm text-ink-soft">
                      {t('ex.info', { q: n(e.questions), m: n(e.totalMarks), d: n(e.durationMinutes) })}
                      {e.negativeMark > 0 && `. ${t('ex.negative', { n: n(e.negativeMark) })}`}
                    </p>
                    <p className="mt-1 text-sm">
                      {e.window === 'upcoming' && t('ex.opens', { time: dateTime(e.opensAt, locale) })}
                      {e.window === 'open' && e.closesAt && t('ex.closes', { time: dateTime(e.closesAt, locale) })}
                      {e.window === 'closed' && !e.attempt && <span className="text-ink-soft">{e.published ? t('ex.missed') : t('ex.closed')}</span>}
                    </p>
                    {done && e.attempt.marks !== null && (
                      <p className="mt-2 font-semibold">
                        {t('ex.yourMarks', { m: n(num(e.attempt.marks)) })} / {n(e.totalMarks)}
                      </p>
                    )}
                    {done && !e.published && <p className="text-sm text-ink-soft">{t('ex.waitResult')}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(running || (e.window === 'open' && !e.attempt)) && <Button onClick={() => start(e)}>{running ? t('ex.continue') : t('ex.start')}</Button>}
                      {e.published && e.attempt && (
                        <>
                          <Link to={`/portal/results/${e._id}`} className="inline-flex min-h-11 items-center rounded-lg bg-helix px-4 font-semibold text-white">
                            {t('ex.result')}
                          </Link>
                          <Link to={`/portal/exams/${e._id}/review`} className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 font-semibold">
                            {t('ex.review')}
                          </Link>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        }
      </Loading>
    </div>
  );
}

// ================= Taking the exam =================

function Clock({ deadline, offset, onTimeUp }) {
  const { n } = useT();
  const [left, setLeft] = useState(() => deadline - (Date.now() + offset));
  const fired = useRef(false);
  useEffect(() => {
    const id = setInterval(() => {
      const ms = deadline - (Date.now() + offset);
      setLeft(ms);
      if (ms <= 0 && !fired.current) {
        fired.current = true;
        onTimeUp();
      }
    }, 500);
    return () => clearInterval(id);
  }, [deadline, offset, onTimeUp]);
  const secs = Math.max(0, Math.ceil(left / 1000));
  const text = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  return <span className={cx('font-mono text-2xl font-bold tabular-nums', secs <= 60 ? 'text-fail' : secs <= 300 ? 'text-draft' : 'text-ink')}>{n(text)}</span>;
}

export function TakeExam() {
  const { id } = useParams();
  const { t, n, lang } = useT();
  const letters = LETTERS[lang];
  const storeKey = `bh-exam-${id}`;
  const [paper, setPaper] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const [save, setSave] = useState('saved'); // saved | saving | offline
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const answersRef = useRef([]);
  const timer = useRef(null);

  useEffect(() => {
    post(`/me/exams/${id}/start`)
      .then((p) => {
        let local = null;
        try {
          local = JSON.parse(localStorage.getItem(storeKey) || 'null');
        } catch {
          /* ignore */
        }
        // Answers kept on the phone (e.g. saved while offline) win over the server copy
        const merged = p.answers.map((a, i) => (local && local[i] !== undefined && local[i] !== null ? local[i] : a));
        answersRef.current = merged;
        setAnswers(merged);
        setOffset(new Date(p.serverNow).getTime() - Date.now());
        setPaper(p);
      })
      .catch((err) => setError(err.message));
  }, [id, storeKey]);

  const persist = useCallback(
    (next) => {
      try {
        localStorage.setItem(storeKey, JSON.stringify(next));
      } catch {
        /* private mode */
      }
      clearTimeout(timer.current);
      setSave('saving');
      timer.current = setTimeout(() => {
        put(`/me/exams/${id}/answers`, { answers: answersRef.current })
          .then(() => setSave('saved'))
          .catch((err) => {
            if (err.status === 409) setError(err.message);
            else setSave('offline');
          });
      }, 1200);
    },
    [id, storeKey],
  );

  const choose = (q, option) => {
    const next = [...answersRef.current];
    next[q] = option;
    answersRef.current = next;
    setAnswers(next);
    persist(next);
  };

  const submit = useCallback(
    async (auto = false) => {
      const unanswered = answersRef.current.filter((a) => a === null).length;
      if (!auto && !window.confirm(unanswered ? t('ex.submitConfirm', { n: n(unanswered) }) : t('ex.submitSure'))) return;
      clearTimeout(timer.current);
      setSubmitting(true);
      setError('');
      for (let tries = 0; tries < 5; tries += 1) {
        try {
          const res = await post(`/me/exams/${id}/submit`, { answers: answersRef.current });
          try {
            localStorage.removeItem(storeKey);
          } catch {
            /* ignore */
          }
          setResult(res);
          setSubmitting(false);
          return;
        } catch (err) {
          if (err.status && err.status < 500) {
            setError(err.message);
            break;
          }
          setSave('offline');
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
      setSubmitting(false);
    },
    [id, n, storeKey, t],
  );

  const timeUp = useCallback(() => submit(true), [submit]);

  // Warn before leaving the page in the middle of the exam
  useEffect(() => {
    if (!paper || paper.submittedAt || result) return undefined;
    const warn = (e) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [paper, result]);

  if (error && !paper) return <Alert>{error}</Alert>;
  if (!paper) return <div className="grid place-items-center py-16"><Spinner /></div>;

  if (result || paper.submittedAt) {
    return (
      <Panel title={paper.title}>
        <p className="text-lg font-semibold text-pass">{t('ex.done')}</p>
        {result && (
          <>
            <p className="mt-3 text-4xl font-bold">
              {n(num(result.marks))} <span className="text-xl text-ink-soft">/ {n(result.totalMarks)}</span>
            </p>
            <p className="text-ink-soft">{t('ex.score', { c: n(result.correct), w: n(result.wrong) })}</p>
          </>
        )}
        <p className="mt-3 text-sm text-ink-soft">{t('ex.waitResult')}</p>
        <Link to="/portal/exams" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-helix px-4 font-semibold text-white">
          {t('ex.back')}
        </Link>
      </Panel>
    );
  }

  const answered = answers.filter((a) => a !== null).length;
  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-3 border-b border-line bg-paper/95 px-4 py-2 backdrop-blur">
        <div className="min-w-0">
          <p className="truncate font-semibold">{paper.title}</p>
          <p className="text-xs text-ink-soft">
            {t('ex.answered', { a: n(answered), q: n(paper.questions.length) })} ·{' '}
            {save === 'saving' ? t('ex.saving') : save === 'offline' ? '⚠' : t('ex.saved')}
          </p>
        </div>
        <Clock deadline={new Date(paper.deadline).getTime()} offset={offset} onTimeUp={timeUp} />
      </div>
      {save === 'offline' && <Alert tone="warn">{t('ex.offline')}</Alert>}
      {submitting && <Alert tone="info">{t('ex.timeUp')}</Alert>}
      <Alert>{error}</Alert>
      <p className="text-sm text-ink-soft">
        {t('ex.info', { q: n(paper.questions.length), m: n(paper.totalMarks), d: n(paper.durationMinutes) })}
        {paper.negativeMark > 0 && `. ${t('ex.negative', { n: n(paper.negativeMark) })}`}
      </p>
      <ol className="space-y-4">
        {paper.questions.map((q, i) => (
          <li key={i} className="rounded-xl border border-line bg-white p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <p className="whitespace-pre-line font-semibold">
                {n(i + 1)}. {q.text}
              </p>
              {answers[i] !== null && (
                <button type="button" onClick={() => choose(i, null)} className="shrink-0 text-sm text-ink-soft underline">
                  {t('ex.clear')}
                </button>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {q.options.map((o, j) => {
                const on = answers[i] === j;
                return (
                  <button
                    key={j}
                    type="button"
                    aria-pressed={on}
                    onClick={() => choose(i, j)}
                    className={cx('flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 text-left', on ? 'border-helix bg-helix-tint font-semibold' : 'border-line hover:border-ink-soft')}
                  >
                    <span className={cx('grid size-7 shrink-0 place-items-center rounded-full border text-sm font-bold', on ? 'border-helix bg-helix text-white' : 'border-line')}>{letters[j]}</span>
                    <span>{o}</span>
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
      <Button onClick={() => submit(false)} loading={submitting} className="w-full">
        {t('ex.submit')}
      </Button>
    </div>
  );
}

// ================= Answers after the result =================

export function ExamReview() {
  const { id } = useParams();
  const { t, n, lang } = useT();
  const letters = LETTERS[lang];
  const state = useLoad(() => get(`/me/exams/${id}/review`), [id]);
  return (
    <div className="space-y-4">
      <Link to="/portal/exams" className="text-sm font-semibold text-helix-dark">
        {t('ex.back')}
      </Link>
      <Loading state={state}>
        {(r) => (
          <>
            <div>
              <h1 className="text-2xl font-bold">{r.title}</h1>
              {r.sat ? (
                <p className="text-ink-soft">
                  {t('ex.yourMarks', { m: n(num(r.marks)) })} / {n(r.totalMarks)}, {t('ex.score', { c: n(r.correct), w: n(r.wrong) })}
                </p>
              ) : (
                <p className="text-ink-soft">{t('ex.missed')}</p>
              )}
            </div>
            <ol className="space-y-4">
              {r.questions.map((q, i) => {
                const right = q.mine === q.answer;
                return (
                  <li key={i} className={cx('rounded-xl border bg-white p-4', q.mine === null ? 'border-line' : right ? 'border-pass/40' : 'border-fail/40')}>
                    <p className="mb-3 whitespace-pre-line font-semibold">
                      {n(i + 1)}. {q.text}
                    </p>
                    <ul className="space-y-1.5">
                      {q.options.map((o, j) => (
                        <li
                          key={j}
                          className={cx(
                            'flex items-center gap-3 rounded-lg px-3 py-2',
                            j === q.answer ? 'bg-pass-tint font-semibold text-pass' : j === q.mine ? 'bg-fail-tint text-fail' : '',
                          )}
                        >
                          <span className="w-5 shrink-0 font-bold">{letters[j]}</span>
                          <span className="flex-1">{o}</span>
                          {j === q.answer && <span className="text-xs">{t('ex.correct')}</span>}
                          {j === q.mine && j !== q.answer && <span className="text-xs">{t('ex.yours')}</span>}
                        </li>
                      ))}
                    </ul>
                    {q.mine === null && r.sat && <p className="mt-2 text-sm text-ink-soft">{t('ex.skipped')}</p>}
                    {q.explanation && (
                      <p className="mt-3 whitespace-pre-line rounded-lg bg-paper px-3 py-2 text-sm">
                        <b>{t('ex.explanation')}:</b> {q.explanation}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </Loading>
    </div>
  );
}

// ================= Study materials =================

const KIND_ICON = { sheet: '📄', video: '▶', link: '🔗' };

export function PortalMaterials() {
  const { t, locale } = useT();
  const state = useLoad(() => get('/me/materials'));
  const [kind, setKind] = useState('');
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t('mat.title')}</h1>
      <Loading state={state}>
        {(list) =>
          list.length === 0 ? (
            <Empty title={t('mat.none')} />
          ) : (
            <>
              <div className="flex gap-2">
                {['', 'sheet', 'video', 'link'].map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={cx('min-h-10 rounded-full px-4 text-sm font-semibold', kind === k ? 'bg-ink text-white' : 'border border-line bg-white text-ink-soft')}
                  >
                    {t(k ? `mat.${k}` : 'mat.all')}
                  </button>
                ))}
              </div>
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
                {list
                  .filter((m) => !kind || m.kind === kind)
                  .map((m) => (
                    <li key={m._id}>
                      <a href={m.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-3 hover:bg-paper">
                        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-helix-tint text-lg">
                          {KIND_ICON[m.kind]}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">{m.title}</span>
                          <span className="block text-sm text-ink-soft">{[m.chapter, m.note, formatDate(m.createdAt, locale)].filter(Boolean).join(' · ')}</span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold text-helix-dark">{t('mat.open')}</span>
                      </a>
                    </li>
                  ))}
              </ul>
            </>
          )
        }
      </Loading>
    </div>
  );
}
