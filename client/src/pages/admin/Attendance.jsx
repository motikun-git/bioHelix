import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { get, put } from '../../lib/api.js';
import { useBatches } from '../../lib/data.js';
import { dayLabel, thisMonth, today } from '../../lib/format.js';
import { Alert, Button, Chips, Empty, Input, Loading, MonthPicker, PageHeader, cx, useLoad } from '../../components/ui.jsx';

const STATES = [
  { value: 'present', label: 'P', name: 'Present', on: 'bg-pass text-white border-pass' },
  { value: 'late', label: 'L', name: 'Late', on: 'bg-draft text-white border-draft' },
  { value: 'absent', label: 'A', name: 'Absent', on: 'bg-fail text-white border-fail' },
];

function TakeAttendance({ batchId, date }) {
  const sheet = useLoad(() => get(`/attendance?batch=${batchId}&date=${date}`), [batchId, date]);
  const [marks, setMarks] = useState({});
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!sheet.data) return;
    setMarks(Object.fromEntries(sheet.data.records.map((r) => [r.student, r.status])));
    setSaved('');
  }, [sheet.data]);

  const set = (student, status) => {
    setSaved('');
    setMarks((m) => ({ ...m, [student]: status }));
  };
  const markAll = (status) => {
    setSaved('');
    setMarks(Object.fromEntries(sheet.data.records.map((r) => [r.student, status])));
  };

  const save = async () => {
    setError('');
    const records = Object.entries(marks)
      .filter(([, status]) => status)
      .map(([student, status]) => ({ student, status }));
    setBusy(true);
    try {
      const res = await put('/attendance', { batch: batchId, date, records });
      setSaved(`Saved: ${res.counts.present} present, ${res.counts.late} late, ${res.counts.absent} absent.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Loading state={sheet}>
      {(data) => {
        if (!data.records.length) return <Empty title="No active students in this batch" />;
        const counts = { present: 0, late: 0, absent: 0, none: 0 };
        data.records.forEach((r) => (counts[marks[r.student] || 'none'] += 1));
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-ink-soft">
                {data.taken ? 'Already taken. You can change it and save again.' : 'Not taken yet.'} {counts.none > 0 && `${counts.none} not marked.`}
              </p>
              <Button variant="secondary" onClick={() => markAll('present')}>
                Mark everyone present
              </Button>
            </div>
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
              {data.records.map((r) => (
                <li key={r.student} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{r.name}</p>
                    <p className="text-xs text-ink-soft">{r.studentId}</p>
                  </div>
                  <div className="flex gap-1.5" role="radiogroup" aria-label={`Attendance for ${r.name}`}>
                    {STATES.map((s) => {
                      const on = marks[r.student] === s.value;
                      return (
                        <button
                          key={s.value}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          aria-label={s.name}
                          title={s.name}
                          onClick={() => set(r.student, s.value)}
                          className={cx('size-11 rounded-lg border text-base font-bold', on ? s.on : 'border-line bg-white text-ink-soft')}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
            <Alert>{error}</Alert>
            {saved && <Alert tone="success">{saved}</Alert>}
            <div className="sticky bottom-20 flex items-center gap-3 rounded-xl bg-paper/90 py-2 backdrop-blur lg:bottom-4">
              <Button onClick={save} loading={busy} disabled={counts.none === data.records.length} className="shadow-lg">
                Save attendance
              </Button>
              <span className="text-sm text-ink-soft">
                P {counts.present}, L {counts.late}, A {counts.absent}
              </span>
            </div>
          </div>
        );
      }}
    </Loading>
  );
}

function MonthSummary({ batchId }) {
  const [month, setMonth] = useState(thisMonth());
  const summary = useLoad(() => get(`/attendance/summary?batch=${batchId}&month=${month}`), [batchId, month]);
  return (
    <div className="space-y-4">
      <MonthPicker value={month} onChange={setMonth} max={thisMonth()} />
      <Loading state={summary}>
        {(data) =>
          data.days.length === 0 ? (
            <Empty title="No attendance this month" />
          ) : (
            <>
              <p className="text-sm text-ink-soft">Classes taken: {data.days.length}</p>
              <div className="overflow-x-auto rounded-xl border border-line bg-white">
                <table className="w-full text-left">
                  <thead className="text-sm text-ink-soft">
                    <tr className="border-b border-line">
                      <th className="px-3 py-2 font-semibold">Student</th>
                      <th className="px-2 py-2 text-right font-semibold">P</th>
                      <th className="px-2 py-2 text-right font-semibold">L</th>
                      <th className="px-2 py-2 text-right font-semibold">A</th>
                      <th className="px-3 py-2 text-right font-semibold">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.students.map((s) => (
                      <tr key={s._id} className="border-b border-line last:border-0">
                        <td className="px-3 py-2">
                          <span className="font-semibold">{s.name}</span>
                          <span className="block text-xs text-ink-soft">{s.studentId}</span>
                        </td>
                        <td className="px-2 py-2 text-right">{s.present}</td>
                        <td className="px-2 py-2 text-right">{s.late}</td>
                        <td className="px-2 py-2 text-right">{s.absent}</td>
                        <td className={cx('px-3 py-2 text-right font-bold', s.percent !== null && s.percent < 75 && 'text-fail')}>
                          {s.percent === null ? '–' : `${s.percent}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-ink-soft">Late counts as attended. Below 75% is shown in red.</p>
            </>
          )
        }
      </Loading>
    </div>
  );
}

export default function Attendance() {
  const batches = useBatches('?active=true');
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState('take');
  const batchId = params.get('batch') || batches.data?.[0]?._id || '';
  const date = params.get('date') || today();
  const update = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader title="Attendance" />
      <Loading state={batches}>
        {(list) =>
          list.length === 0 ? (
            <Empty title="No running batches">Create a batch first.</Empty>
          ) : (
            <div className="space-y-5">
              <Chips options={list.map((b) => ({ value: b._id, label: b.name }))} value={batchId} onChange={(v) => update({ batch: v })} />
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex rounded-lg border border-line bg-white p-1">
                  {[
                    ['take', 'Take attendance'],
                    ['month', 'Monthly report'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setView(value)}
                      className={cx('min-h-9 rounded-md px-3 text-sm font-semibold', view === value ? 'bg-ink text-white' : 'text-ink-soft')}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {view === 'take' && (
                  <label className="flex items-center gap-2">
                    <span className="sr-only">Date</span>
                    <Input type="date" value={date} max={today()} onChange={(e) => update({ date: e.target.value })} className="w-auto" />
                    <span className="whitespace-nowrap text-sm text-ink-soft">{dayLabel(date)}</span>
                  </label>
                )}
              </div>
              {batchId && (view === 'take' ? <TakeAttendance batchId={batchId} date={date} /> : <MonthSummary batchId={batchId} />)}
            </div>
          )
        }
      </Loading>
    </>
  );
}
