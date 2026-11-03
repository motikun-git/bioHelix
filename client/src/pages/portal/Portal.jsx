import { Link, useParams } from 'react-router';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { get } from '../../lib/api.js';
import { formatDate, num, ordinal, schedule } from '../../lib/format.js';
import { Empty, Loading, Panel, cx, useLoad } from '../../components/ui.jsx';
import { Avatar } from '../admin/Students.jsx';
import { ChapterList, useChapters } from './PortalPages.jsx';

/**
 * Where the student stands on a 0 → total track, with the batch average and
 * highest marked. Easier to read at a glance than three separate numbers.
 */
function ScoreTrack({ result }) {
  const { exam, marks, average, highest } = result;
  const pos = (v) => `${Math.max(0, Math.min(100, (v / exam.totalMarks) * 100))}%`;
  return (
    <div className="pt-7 pb-6" aria-hidden="true">
      <div className="relative h-2 rounded-full bg-line">
        {exam.passMarks > 0 && <div className="absolute inset-y-0 left-0 rounded-l-full bg-fail-tint" style={{ width: pos(exam.passMarks) }} />}
        <div className="absolute inset-y-0 left-0 rounded-full bg-helix/35" style={{ width: pos(marks) }} />
        {average !== null && (
          <span className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-ink-soft" style={{ left: pos(average) }}>
            <span className="absolute top-5 -translate-x-1/2 whitespace-nowrap text-xs text-ink-soft">avg {num(average)}</span>
          </span>
        )}
        {highest !== null && (
          <span className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-ink" style={{ left: pos(highest) }}>
            <span className="absolute -top-6 -translate-x-1/2 whitespace-nowrap text-xs font-semibold">top {num(highest)}</span>
          </span>
        )}
        <span className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-helix shadow" style={{ left: pos(marks) }} />
      </div>
    </div>
  );
}

function ResultSummary({ result, large }) {
  const { exam } = result;
  if (result.isAbsent) {
    return (
      <div>
        <p className={cx('font-bold text-fail', large ? 'text-4xl' : 'text-2xl')}>Absent</p>
        <p className="text-ink-soft">
          {result.participants} students sat this exam. Highest was {num(result.highest)}, average {num(result.average)}.
        </p>
      </div>
    );
  }
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <p className={cx('font-bold leading-none', large ? 'text-6xl' : 'text-5xl')}>
          {num(result.marks)}
          <span className="text-2xl font-semibold text-ink-soft"> / {exam.totalMarks}</span>
        </p>
        {result.rank && (
          <p className="text-right leading-tight">
            <span className={cx('block font-bold text-helix-dark', large ? 'text-4xl' : 'text-3xl')}>{ordinal(result.rank)}</span>
            <span className="text-sm text-ink-soft">of {result.participants} in merit list</span>
          </p>
        )}
      </div>
      <ScoreTrack result={result} />
      <p className="text-sm text-ink-soft">
        {result.percent}%{exam.passMarks > 0 && (result.passed ? ', passed' : `, below pass mark ${exam.passMarks}`)}
      </p>
    </div>
  );
}

function ProgressChart({ results }) {
  const points = results
    .filter((r) => !r.isAbsent && r.percent !== null)
    .slice()
    .reverse()
    .map((r) => ({ name: r.exam.title, date: formatDate(r.exam.date), percent: r.percent }));
  if (points.length < 2) return null;
  return (
    <Panel title="Progress">
      <p className="mb-3 text-sm text-ink-soft">Your marks as a percentage, oldest exam on the left.</p>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="#d9e2df" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#4a5d74' }} tickLine={false} axisLine={{ stroke: '#d9e2df' }} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 12, fill: '#4a5d74' }} tickLine={false} axisLine={false} unit="%" />
            <Tooltip
              formatter={(v) => [`${v}%`, 'Score']}
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

export default function PortalHome() {
  const me = useLoad(() => get('/me'));
  const results = useLoad(() => get('/me/results'));
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

      <Loading state={results}>
        {(list) =>
          list.length === 0 ? (
            <Empty title="No results yet">Your marks will appear here as soon as BioHelix publishes an exam result.</Empty>
          ) : (
            <>
              <Panel
                title="Latest result"
                action={
                  <Link to={`/portal/results/${list[0].exam._id}`} className="text-sm font-semibold text-helix-dark">
                    Details
                  </Link>
                }
              >
                <p className="mb-3 font-semibold">
                  {list[0].exam.title} <span className="font-normal text-ink-soft">({formatDate(list[0].exam.date)})</span>
                </p>
                <ResultSummary result={list[0]} />
              </Panel>

              <ProgressChart results={list} />

              <ChapterList
                chapters={chapters.data}
                title="Where you lose marks"
                note="Correct answers per chapter across all MCQ exams, weakest first. The dark line is the average of all students."
              />

              <section>
                <h2 className="mb-2 text-lg font-semibold">All exams</h2>
                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
                  {list.map((r) => (
                    <li key={r.exam._id}>
                      <Link to={`/portal/results/${r.exam._id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-paper">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{r.exam.title}</p>
                          <p className="text-sm text-ink-soft">{formatDate(r.exam.date)}</p>
                        </div>
                        <p className="shrink-0 text-right">
                          {r.isAbsent ? (
                            <span className="font-semibold text-fail">Absent</span>
                          ) : (
                            <span className="font-semibold">
                              {num(r.marks)}/{r.exam.totalMarks}
                            </span>
                          )}
                          {r.rank && <span className="block text-sm text-ink-soft">{ordinal(r.rank)}</span>}
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
  const { examId } = useParams();
  const state = useLoad(() => get(`/me/results/${examId}`), [examId]);
  return (
    <div className="space-y-4">
      <Link to="/portal" className="text-sm font-semibold text-helix-dark">
        All results
      </Link>
      <Loading state={state}>
        {(r) => (
          <>
            <div>
              <h1 className="text-2xl font-bold">{r.exam.title}</h1>
              <p className="text-ink-soft">
                {formatDate(r.exam.date)}, {r.exam.mode === 'offline' ? 'written exam' : 'online MCQ'}
              </p>
            </div>
            <Panel>
              <ResultSummary result={r} large />
            </Panel>
            <dl className="grid grid-cols-3 gap-3">
              {[
                ['Students sat', r.participants],
                ['Highest', num(r.highest)],
                ['Average', num(r.average)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-line bg-white px-3 py-3">
                  <dd className="text-2xl font-bold">{value}</dd>
                  <dt className="text-sm text-ink-soft">{label}</dt>
                </div>
              ))}
            </dl>
            <ChapterList chapters={r.chapters} title="This exam by chapter" note="The dark line is the average of all students who sat it." />
          </>
        )}
      </Loading>
    </div>
  );
}
