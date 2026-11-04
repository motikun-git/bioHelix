import { Link, useParams } from 'react-router';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { get } from '../../lib/api.js';
import { formatDate, formatTime, num } from '../../lib/format.js';
import { ordinalL, useT } from '../../lib/i18n.jsx';
import { Empty, Loading, Panel, cx, useLoad } from '../../components/ui.jsx';
import { Avatar } from '../admin/Students.jsx';
import { ChapterList, useChapters } from './PortalPages.jsx';

/**
 * Where the student stands on a 0 → total track, with the batch average and
 * highest marked. Easier to read at a glance than three separate numbers.
 */
function ScoreTrack({ result }) {
  const { t, n } = useT();
  const { exam, marks, average, highest } = result;
  const pos = (v) => `${Math.max(0, Math.min(100, (v / exam.totalMarks) * 100))}%`;
  return (
    <div className="pt-7 pb-6" aria-hidden="true">
      <div className="relative h-2 rounded-full bg-line">
        {exam.passMarks > 0 && <div className="absolute inset-y-0 left-0 rounded-l-full bg-fail-tint" style={{ width: pos(exam.passMarks) }} />}
        <div className="absolute inset-y-0 left-0 rounded-full bg-helix/35" style={{ width: pos(marks) }} />
        {average !== null && (
          <span className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-ink-soft" style={{ left: pos(average) }}>
            <span className="absolute top-5 -translate-x-1/2 whitespace-nowrap text-xs text-ink-soft">{t('res.avg', { n: n(num(average)) })}</span>
          </span>
        )}
        {highest !== null && (
          <span className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-ink" style={{ left: pos(highest) }}>
            <span className="absolute -top-6 -translate-x-1/2 whitespace-nowrap text-xs font-semibold">{t('res.top', { n: n(num(highest)) })}</span>
          </span>
        )}
        <span className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-helix shadow" style={{ left: pos(marks) }} />
      </div>
    </div>
  );
}

function ResultSummary({ result, large }) {
  const { t, n, lang } = useT();
  const { exam } = result;
  if (result.isAbsent) {
    return (
      <div>
        <p className={cx('font-bold text-fail', large ? 'text-4xl' : 'text-2xl')}>{t('res.absent')}</p>
        <p className="text-ink-soft">{t('res.absentLead', { n: n(result.participants), high: n(num(result.highest)), avg: n(num(result.average)) })}</p>
      </div>
    );
  }
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <p className={cx('font-bold leading-none', large ? 'text-6xl' : 'text-5xl')}>
          {n(num(result.marks))}
          <span className="text-2xl font-semibold text-ink-soft"> / {n(exam.totalMarks)}</span>
        </p>
        {result.rank && (
          <p className="text-right leading-tight">
            <span className={cx('block font-bold text-helix-dark', large ? 'text-4xl' : 'text-3xl')}>{ordinalL(result.rank, lang)}</span>
            <span className="text-sm text-ink-soft">{t('res.ofMerit', { n: n(result.participants) })}</span>
          </p>
        )}
      </div>
      <ScoreTrack result={result} />
      <p className="text-sm text-ink-soft">
        {n(result.percent)}%{exam.passMarks > 0 && `, ${result.passed ? t('res.passed') : t('res.belowPass', { n: n(exam.passMarks) })}`}
      </p>
    </div>
  );
}

function ProgressChart({ results }) {
  const { t, locale } = useT();
  const points = results
    .filter((r) => !r.isAbsent && r.percent !== null)
    .slice()
    .reverse()
    .map((r) => ({ name: r.exam.title, date: formatDate(r.exam.date, locale), percent: r.percent }));
  if (points.length < 2) return null;
  return (
    <Panel title={t('res.progress')}>
      <p className="mb-3 text-sm text-ink-soft">{t('res.progressLead')}</p>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="#d9e2df" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#4a5d74' }} tickLine={false} axisLine={{ stroke: '#d9e2df' }} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 12, fill: '#4a5d74' }} tickLine={false} axisLine={false} unit="%" />
            <Tooltip
              formatter={(v) => [`${v}%`, t('res.score')]}
              labelFormatter={(_, p) => p?.[0]?.payload?.name}
              contentStyle={{ borderRadius: 8, border: '1px solid #d9e2df', fontFamily: 'inherit' }}
            />
            <Line isAnimationActive={false} type="monotone" dataKey="percent" stroke="#1b8a86" strokeWidth={2.5} dot={{ r: 4, fill: '#1b8a86' }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

/** "Sat, Mon, Wed, 4:30 pm" in the reader's language. */
export function useSchedule() {
  const { t, locale } = useT();
  return (batch) => {
    if (!batch) return '';
    const days = (batch.days || []).map((d) => t(`days.${d}`)).join(', ');
    const time = batch.startTime ? `${formatTime(batch.startTime, locale)}${batch.endTime ? ` – ${formatTime(batch.endTime, locale)}` : ''}` : '';
    return [days, time].filter(Boolean).join(', ');
  };
}

export default function PortalHome() {
  const { t, n, lang, locale } = useT();
  const schedule = useSchedule();
  const me = useLoad(() => get('/me'));
  const results = useLoad(() => get('/me/results'));
  const exams = useLoad(() => get('/me/exams'));
  const openExams = (exams.data || []).filter((e) => e.window === 'open' && e.attempt?.state !== 'submitted');
  const chapters = useChapters();

  return (
    <div className="space-y-6">
      <Loading state={me}>
        {(s) => (
          <section className="flex items-center gap-4">
            <Avatar url={s.photoUrl} name={s.name} size="size-16" />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold leading-tight">{s.name}</h1>
              <p className="font-semibold text-helix-dark">{s.studentId}</p>
              <p className="text-sm text-ink-soft">
                {[s.program, s.batch?.name, schedule(s.batch)].filter(Boolean).join(', ')}
              </p>
            </div>
          </section>
        )}
      </Loading>

      {openExams.map((e) => (
        <Link key={e._id} to="/portal/exams" className="flex items-center justify-between gap-3 rounded-xl border border-helix bg-helix-tint px-4 py-3 text-helix-dark">
          <span className="font-semibold">
            {t('ex.title')}: {e.title}
          </span>
          <span className="shrink-0 font-semibold underline">{e.attempt ? t('ex.continue') : t('ex.start')}</span>
        </Link>
      ))}

      <Loading state={results}>
        {(list) =>
          list.length === 0 ? (
            <Empty title={t('res.none')}>{t('res.noneLead')}</Empty>
          ) : (
            <>
              <Panel
                title={t('res.latest')}
                action={
                  <Link to={`/portal/results/${list[0].exam._id}`} className="text-sm font-semibold text-helix-dark">
                    {t('res.details')}
                  </Link>
                }
              >
                <p className="mb-3 font-semibold">
                  {list[0].exam.title} <span className="font-normal text-ink-soft">({formatDate(list[0].exam.date, locale)})</span>
                </p>
                <ResultSummary result={list[0]} />
              </Panel>

              <ProgressChart results={list} />

              <ChapterList
                chapters={chapters.data}
                title={t('res.loseTitle')}
                note={t('res.loseLead')}
              />

              <section>
                <h2 className="mb-2 text-lg font-semibold">{t('res.all')}</h2>
                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
                  {list.map((r) => (
                    <li key={r.exam._id}>
                      <Link to={`/portal/results/${r.exam._id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-paper">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{r.exam.title}</p>
                          <p className="text-sm text-ink-soft">{formatDate(r.exam.date, locale)}</p>
                        </div>
                        <p className="shrink-0 text-right">
                          {r.isAbsent ? (
                            <span className="font-semibold text-fail">{t('res.absent')}</span>
                          ) : (
                            <span className="font-semibold">
                              {n(num(r.marks))}/{n(r.exam.totalMarks)}
                            </span>
                          )}
                          {r.rank && <span className="block text-sm text-ink-soft">{ordinalL(r.rank, lang)}</span>}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )
        }
      </Loading>
    </div>
  );
}

export function ResultDetail() {
  const { t, n, lang, locale } = useT();
  const { examId } = useParams();
  const state = useLoad(() => get(`/me/results/${examId}`), [examId]);
  return (
    <div className="space-y-4">
      <Link to="/portal" className="text-sm font-semibold text-helix-dark">
        {t('res.allResults')}
      </Link>
      <Loading state={state}>
        {(r) => (
          <>
            <div>
              <h1 className="text-2xl font-bold">{r.exam.title}</h1>
              <p className="text-ink-soft">
                {formatDate(r.exam.date, locale)}, {r.exam.mode === 'offline' ? t('res.written') : t('res.mcq')}
              </p>
            </div>
            <Panel>
              <ResultSummary result={r} large />
            </Panel>
            <dl className="grid grid-cols-3 gap-3">
              {[
                [t('res.sat'), n(r.participants)],
                [t('res.highest'), n(num(r.highest))],
                [t('res.average'), n(num(r.average))],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-line bg-white px-3 py-3">
                  <dd className="text-2xl font-bold">{value}</dd>
                  <dt className="text-sm text-ink-soft">{label}</dt>
                </div>
              ))}
            </dl>
            {r.online && (
              <Link to={`/portal/exams/${r.exam._id}/review`} className="inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-4 font-semibold">
                {t('ex.review')}
              </Link>
            )}
            {r.top?.length > 0 && (
              <Panel title={t('res.merit')}>
                <ol className="divide-y divide-line">
                  {r.top.map((m, i) => (
                    <li key={i} className={cx('flex items-center gap-3 py-2', m.me && 'font-semibold text-helix-dark')}>
                      <span className="w-10 shrink-0 font-bold">{ordinalL(m.rank, lang)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">
                          {m.name}
                          {m.me && ` (${t('res.you')})`}
                        </span>
                        {m.college && <span className="block truncate text-sm font-normal text-ink-soft">{m.college}</span>}
                      </span>
                      <span className="shrink-0 font-semibold">{n(num(m.marks))}</span>
                    </li>
                  ))}
                </ol>
              </Panel>
            )}
            <ChapterList chapters={r.chapters} title={t('res.byChapter')} note={t('res.byChapterLead')} />
          </>
        )}
      </Loading>
    </div>
  );
}
