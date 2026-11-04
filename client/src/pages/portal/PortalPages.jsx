import { useState } from 'react';
import { get } from '../../lib/api.js';
import { dayLabel, formatDate, formatTime, monthLabel, taka, thisMonth } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { Empty, Loading, MonthPicker, Panel, PercentBar, cx, useLoad } from '../../components/ui.jsx';

const STATUS = {
  present: { label: 'att.present', cell: 'bg-pass text-white' },
  late: { label: 'att.late', cell: 'bg-draft text-white' },
  absent: { label: 'att.absent', cell: 'bg-fail text-white' },
};
/** Taka in the reader's digits. */
function useTaka() {
  const { n } = useT();
  return (v) => n(taka(v));
}
const WEEK = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

/** Month grid starting on Saturday (the Bangladesh week). */
function MonthGrid({ month, days }) {
  const { t, n } = useT();
  const [y, m] = month.split('-').map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0 = Sun
  const offset = (firstWeekday + 1) % 7; // Sat = 0
  const marks = new Map(days.map((d) => [Number(d.date.slice(8)), d.status]));
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-ink-soft">
        {WEEK.map((d) => (
          <span key={d}>{t(`days.${d}`)}</span>
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
              title={status ? t(STATUS[status].label) : undefined}
              className={cx('grid aspect-square place-items-center rounded-md text-sm font-semibold', status ? STATUS[status].cell : 'bg-white text-ink-soft')}
            >
              {n(i + 1)}
            </span>
          );
        })}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-ink-soft">
        {Object.entries(STATUS).map(([k, s]) => (
          <span key={k} className="flex items-center gap-1">
            <span className={cx('size-3 rounded-sm', s.cell)} />
            {t(s.label)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function PortalAttendance() {
  const { t, n, locale } = useT();
  const [month, setMonth] = useState(thisMonth());
  const state = useLoad(() => get(`/me/attendance?month=${month}`), [month]);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t('att.title')}</h1>
      <Loading state={state}>
        {(a) => (
          <>
            {a.overall.total > 0 && (
              <div className="flex flex-wrap items-end gap-x-8 gap-y-2 rounded-xl border border-line bg-white p-4">
                <p>
                  <span className={cx('block text-4xl font-bold', a.overall.percent < 75 && 'text-fail')}>{n(a.overall.percent)}%</span>
                  <span className="text-sm text-ink-soft">{t('att.since')}</span>
                </p>
                <p className="text-sm text-ink-soft">
                  {t('att.counts', { p: n(a.overall.present), l: n(a.overall.late), a: n(a.overall.absent), t: n(a.overall.total) })}
                </p>
              </div>
            )}
            <MonthPicker value={month} onChange={setMonth} max={thisMonth()} locale={locale} />
            <Panel>
              {a.total === 0 ? (
                <p className="text-ink-soft">{t('att.none', { month: monthLabel(month, false, locale) })}</p>
              ) : (
                <>
                  <p className="mb-3 text-sm text-ink-soft">
                    {t('att.month', { month: monthLabel(month, false, locale), n: n(a.present + a.late), t: n(a.total) })}
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

export function PortalSchedule() {
  const { t, locale } = useT();
  const schedule = useLoad(() => get('/me/schedule'));
  const notices = useLoad(() => get('/me/notices'));
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('sch.title')}</h1>
      <Loading state={schedule}>
        {(s) => (
          <>
            <Panel title={t('sch.weekly')}>
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
                      {t(`days.${d}`)}
                    </span>
                  );
                })}
              </div>
              {s.routine.startTime && (
                <p className="mt-3 text-ink-soft">
                  {s.routine.endTime
                    ? t('sch.to', { a: formatTime(s.routine.startTime, locale), b: formatTime(s.routine.endTime, locale) })
                    : formatTime(s.routine.startTime, locale)}
                </p>
              )}
            </Panel>
            <section>
              <h2 className="mb-2 text-lg font-semibold">{t('sch.coming')}</h2>
              {s.upcoming.length === 0 ? (
                <p className="text-ink-soft">{t('sch.nothing')}</p>
              ) : (
                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
                  {s.upcoming.map((e) => (
                    <li key={`${e.kind}-${e._id}`} className="flex gap-3 px-4 py-3">
                      <span className="w-20 shrink-0 text-sm font-semibold">{dayLabel(e.date, false, locale)}</span>
                      <div className="min-w-0">
                        <p className="font-semibold">
                          <span className={cx('mr-2 rounded px-1.5 py-0.5 text-xs', e.type === 'holiday' ? 'bg-fail-tint text-fail' : e.type === 'exam' ? 'bg-[#e4e9f6]' : 'bg-helix-tint text-helix-dark')}>
                            {t(`type.${e.type}`)}
                          </span>
                          {e.title}
                        </p>
                        <p className="text-sm text-ink-soft">{[e.startTime && formatTime(e.startTime, locale), e.note].filter(Boolean).join(', ')}</p>
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
        <h2 className="mb-2 text-lg font-semibold">{t('sch.notices')}</h2>
        <Loading state={notices}>
          {(list) =>
            list.length === 0 ? (
              <p className="text-ink-soft">{t('sch.noNotices')}</p>
            ) : (
              <ul className="space-y-3">
                {list.map((n) => (
                  <li key={n._id} className={cx('rounded-xl border bg-white p-4', n.pinned ? 'border-helix' : 'border-line')}>
                    <p className="font-semibold">{n.title}</p>
                    <p className="text-sm text-ink-soft">{formatDate(n.createdAt, locale)}</p>
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

const KIND = { admission: 'fee.admissionFee', monthly: 'fee.monthlyFee', other: 'fee.other' };
const METHOD = {
  en: { cash: 'Cash', bkash: 'bKash', nagad: 'Nagad', bank: 'Bank' },
  bn: { cash: 'নগদ টাকা', bkash: 'বিকাশ', nagad: 'নগদ', bank: 'ব্যাংক' },
};

export function PortalFees() {
  const { t, lang, locale } = useT();
  const tk = useTaka();
  const state = useLoad(() => get('/me/fees'));
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('fee.title')}</h1>
      <Loading state={state}>
        {(f) => (
          <>
            <div className={cx('rounded-xl border p-4', f.totalDue > 0 ? 'border-fail/40 bg-fail-tint' : 'border-pass/30 bg-pass-tint')}>
              <p className={cx('text-3xl font-bold', f.totalDue > 0 ? 'text-fail' : 'text-pass')}>{f.totalDue > 0 ? t('fee.due', { amount: tk(f.totalDue) }) : t('fee.allPaid')}</p>
              <p className="text-sm text-ink-soft">
                {f.monthlyFee > 0 && `${t('fee.monthly', { amount: tk(f.monthlyFee) })}. `}
                {t('fee.lead')}
              </p>
            </div>
            <Panel title={t('fee.byMonth')}>
              <ul className="divide-y divide-line">
                {f.admission.fee > 0 && (
                  <li className="flex justify-between py-2">
                    <span>{t('fee.admissionFee')}</span>
                    <span className={f.admission.due ? 'font-semibold text-fail' : 'text-pass'}>{f.admission.due ? t('fee.due', { amount: tk(f.admission.due) }) : t('fee.paid')}</span>
                  </li>
                )}
                {f.months.map((m) => (
                  <li key={m.month} className="flex justify-between py-2">
                    <span>{monthLabel(m.month, false, locale)}</span>
                    <span className={m.due ? 'font-semibold text-fail' : 'text-pass'}>{m.due ? t('fee.due', { amount: tk(m.due) }) : t('fee.paid')}</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <section>
              <h2 className="mb-2 text-lg font-semibold">{t('fee.payments')}</h2>
              {f.payments.length === 0 ? (
                <p className="text-ink-soft">{t('fee.noPayments')}</p>
              ) : (
                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
                  {f.payments.map((p) => (
                    <li key={p._id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{p.kind === 'monthly' ? `${t(KIND.monthly)}, ${monthLabel(p.month, false, locale)}` : t(KIND[p.kind])}</p>
                        <p className="text-sm text-ink-soft">
                          {formatDate(p.paidAt, locale)}, {METHOD[lang][p.method]}, {t('fee.receipt', { no: p.receiptNo })}
                        </p>
                      </div>
                      <span className="shrink-0 font-bold">{tk(p.amount)}</span>
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
  const { t, n } = useT();
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
                <span className="text-ink-soft">{t('res.chapterCorrect', { p: n(c.percent), a: n(c.batchPercent) })}</span>
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
