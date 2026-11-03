import { useState } from 'react';
import { get } from '../../lib/api.js';
import { dayLabel, formatDate, formatTime, monthLabel, taka, thisMonth } from '../../lib/format.js';
import { Empty, Loading, MonthPicker, Panel, PercentBar, cx, useLoad } from '../../components/ui.jsx';

const STATUS = {
  present: { label: 'Present', cell: 'bg-pass text-white' },
  late: { label: 'Late', cell: 'bg-draft text-white' },
  absent: { label: 'Absent', cell: 'bg-fail text-white' },
};
const WEEK = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

/** Month grid starting on Saturday (the Bangladesh week). */
function MonthGrid({ month, days }) {
  const [y, m] = month.split('-').map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0 = Sun
  const offset = (firstWeekday + 1) % 7; // Sat = 0
  const marks = new Map(days.map((d) => [Number(d.date.slice(8)), d.status]));
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-ink-soft">
        {WEEK.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: offset }, (_, i) => (
          <span key={`e${i}`} />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const status = marks.get(i + 1);
          return (
            <span
              key={i}
              title={status ? STATUS[status].label : undefined}
              className={cx('grid aspect-square place-items-center rounded-md text-sm font-semibold', status ? STATUS[status].cell : 'bg-white text-ink-soft')}
            >
              {i + 1}
            </span>
          );
        })}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-ink-soft">
        {Object.entries(STATUS).map(([k, s]) => (
          <span key={k} className="flex items-center gap-1">
            <span className={cx('size-3 rounded-sm', s.cell)} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function PortalAttendance() {
  const [month, setMonth] = useState(thisMonth());
  const state = useLoad(() => get(`/me/attendance?month=${month}`), [month]);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Attendance</h1>
      <Loading state={state}>
        {(a) => (
          <>
            {a.overall.total > 0 && (
              <div className="flex flex-wrap items-end gap-x-8 gap-y-2 rounded-xl border border-line bg-white p-4">
                <p>
                  <span className={cx('block text-4xl font-bold', a.overall.percent < 75 && 'text-fail')}>{a.overall.percent}%</span>
                  <span className="text-sm text-ink-soft">attended since admission</span>
                </p>
                <p className="text-sm text-ink-soft">
                  {a.overall.present} present, {a.overall.late} late, {a.overall.absent} absent of {a.overall.total} classes
                </p>
              </div>
            )}
            <MonthPicker value={month} onChange={setMonth} max={thisMonth()} />
            <Panel>
              {a.total === 0 ? (
                <p className="text-ink-soft">No attendance recorded in {monthLabel(month)}.</p>
              ) : (
                <>
                  <p className="mb-3 text-sm text-ink-soft">
                    {monthLabel(month)}: {a.present + a.late} of {a.total} classes attended
                  </p>
                  <MonthGrid month={month} days={a.days} />
                </>
              )}
            </Panel>
          </>
        )}
      </Loading>
    </div>
  );
}

const TYPE_LABEL = { class: 'Extra class', exam: 'Exam', holiday: 'Holiday', other: 'Notice' };

export function PortalSchedule() {
  const schedule = useLoad(() => get('/me/schedule'));
  const notices = useLoad(() => get('/me/notices'));
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Routine and notices</h1>
      <Loading state={schedule}>
        {(s) => (
          <>
            <Panel title="Weekly class routine">
              <p className="mb-3 font-semibold">{s.routine.batch}</p>
              <div className="grid grid-cols-7 gap-1 text-center">
                {WEEK.map((d) => {
                  const on = s.routine.days.includes(d);
                  return (
                    <span
                      key={d}
                      aria-label={on ? `${d}: class` : `${d}: no class`}
                      className={cx('rounded-md border py-2 text-sm font-semibold', on ? 'border-pass/30 bg-pass-tint text-pass' : 'border-transparent bg-paper text-ink-soft/50')}
                    >
                      {d}
                    </span>
                  );
                })}
              </div>
              {s.routine.startTime && (
                <p className="mt-3 text-ink-soft">
                  {formatTime(s.routine.startTime)}
                  {s.routine.endTime && ` to ${formatTime(s.routine.endTime)}`}
                </p>
              )}
            </Panel>
            <section>
              <h2 className="mb-2 text-lg font-semibold">Coming up</h2>
              {s.upcoming.length === 0 ? (
                <p className="text-ink-soft">No exams, extra classes or holidays in the next few weeks.</p>
              ) : (
                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
                  {s.upcoming.map((e) => (
                    <li key={`${e.kind}-${e._id}`} className="flex gap-3 px-4 py-3">
                      <span className="w-20 shrink-0 text-sm font-semibold">{dayLabel(e.date)}</span>
                      <div className="min-w-0">
                        <p className="font-semibold">
                          <span className={cx('mr-2 rounded px-1.5 py-0.5 text-xs', e.type === 'holiday' ? 'bg-fail-tint text-fail' : e.type === 'exam' ? 'bg-[#e4e9f6]' : 'bg-helix-tint text-helix-dark')}>
                            {TYPE_LABEL[e.type]}
                          </span>
                          {e.title}
                        </p>
                        <p className="text-sm text-ink-soft">{[e.startTime && formatTime(e.startTime), e.note].filter(Boolean).join(', ')}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </Loading>
      <section>
        <h2 className="mb-2 text-lg font-semibold">Notices</h2>
        <Loading state={notices}>
          {(list) =>
            list.length === 0 ? (
              <p className="text-ink-soft">No notices.</p>
            ) : (
              <ul className="space-y-3">
                {list.map((n) => (
                  <li key={n._id} className={cx('rounded-xl border bg-white p-4', n.pinned ? 'border-helix' : 'border-line')}>
                    <p className="font-semibold">{n.title}</p>
                    <p className="text-sm text-ink-soft">{formatDate(n.createdAt)}</p>
                    {n.body && <p className="mt-2 whitespace-pre-line">{n.body}</p>}
                  </li>
                ))}
              </ul>
            )
          }
        </Loading>
      </section>
    </div>
  );
}

const KIND = { admission: 'Admission fee', monthly: 'Monthly fee', other: 'Other' };
const METHOD = { cash: 'Cash', bkash: 'bKash', nagad: 'Nagad', bank: 'Bank' };

export function PortalFees() {
  const state = useLoad(() => get('/me/fees'));
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Fees</h1>
      <Loading state={state}>
        {(f) => (
          <>
            <div className={cx('rounded-xl border p-4', f.totalDue > 0 ? 'border-fail/40 bg-fail-tint' : 'border-pass/30 bg-pass-tint')}>
              <p className={cx('text-3xl font-bold', f.totalDue > 0 ? 'text-fail' : 'text-pass')}>{f.totalDue > 0 ? `${taka(f.totalDue)} due` : 'All paid'}</p>
              <p className="text-sm text-ink-soft">Monthly fee {taka(f.monthlyFee)}. Pay at the BioHelix office or ask for the bKash number.</p>
            </div>
            <Panel title="Month by month">
              <ul className="divide-y divide-line">
                {f.admission.fee > 0 && (
                  <li className="flex justify-between py-2">
                    <span>Admission fee</span>
                    <span className={f.admission.due ? 'font-semibold text-fail' : 'text-pass'}>{f.admission.due ? `${taka(f.admission.due)} due` : 'Paid'}</span>
                  </li>
                )}
                {f.months.map((m) => (
                  <li key={m.month} className="flex justify-between py-2">
                    <span>{monthLabel(m.month)}</span>
                    <span className={m.due ? 'font-semibold text-fail' : 'text-pass'}>{m.due ? `${taka(m.due)} due` : 'Paid'}</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <section>
              <h2 className="mb-2 text-lg font-semibold">Payments</h2>
              {f.payments.length === 0 ? (
                <p className="text-ink-soft">No payments yet.</p>
              ) : (
                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
                  {f.payments.map((p) => (
                    <li key={p._id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{p.kind === 'monthly' ? `${KIND.monthly}, ${monthLabel(p.month)}` : KIND[p.kind]}</p>
                        <p className="text-sm text-ink-soft">
                          {formatDate(p.paidAt)}, {METHOD[p.method]}, receipt {p.receiptNo}
                        </p>
                      </div>
                      <span className="shrink-0 font-bold">{taka(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </Loading>
    </div>
  );
}

/** "Where you lose marks": chapter accuracy vs everyone who sat the same questions. */
export function ChapterList({ chapters, title = 'Chapters', note }) {
  if (!chapters?.length) return null;
  return (
    <Panel title={title}>
      {note && <p className="mb-3 text-sm text-ink-soft">{note}</p>}
      <ul className="space-y-4">
        {chapters.map((c) => (
          <li key={c.chapter}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold">{c.chapter}</span>
              <span>
                <b>{c.percent}%</b> <span className="text-ink-soft">correct, average {c.batchPercent}%</span>
              </span>
            </div>
            <PercentBar value={c.percent} compare={c.batchPercent} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function useChapters() {
  return useLoad(() => get('/me/chapters'));
}

export { Empty };
