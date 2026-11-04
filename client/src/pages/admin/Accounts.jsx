import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { del, get, post } from '../../lib/api.js';
import { formatDate, monthLabel, taka, thisMonth, today } from '../../lib/format.js';
import { Alert, Button, Field, Input, Loading, MonthPicker, PageHeader, Panel, Select, cx, useLoad } from '../../components/ui.jsx';

const CATEGORIES = {
  rent: 'Rent',
  salary: 'Teacher / staff salary',
  utilities: 'Electricity, internet, water',
  materials: 'Printing, sheets, stationery',
  marketing: 'Marketing, Facebook ads',
  other: 'Other',
};
const KIND = { admission: 'Admission fees', monthly: 'Monthly fees', other: 'Other fees' };
const AXIS = { fontSize: 12, fill: '#4a5d74' };
const shortTaka = (v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v));

function Stat({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-line bg-white px-4 py-3">
      <p className={cx('text-2xl font-bold', tone)}>{value}</p>
      <p className="text-sm text-ink-soft">{label}</p>
    </div>
  );
}

function AddExpense({ onAdded }) {
  const [form, setForm] = useState({ date: today(), category: 'rent', amount: '', paidTo: '', note: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          await post('/accounts/expenses', { ...form, amount: Number(form.amount) });
          setForm({ ...form, amount: '', paidTo: '', note: '' });
          onAdded(form.date.slice(0, 7));
        } catch (err) {
          setError(err.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Date">
        <Input type="date" max={today()} value={form.date} onChange={set('date')} required />
      </Field>
      <Field label="What for">
        <Select value={form.category} onChange={set('category')}>
          {Object.entries(CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Amount (৳)">
        <Input type="number" min="1" inputMode="numeric" value={form.amount} onChange={set('amount')} required />
      </Field>
      <Field label="Paid to (optional)">
        <Input value={form.paidTo} onChange={set('paidTo')} placeholder="e.g. house owner, Rahim sir" />
      </Field>
      <Field label="Note (optional)" className="sm:col-span-2">
        <Input value={form.note} onChange={set('note')} />
      </Field>
      <Alert className="sm:col-span-2">{error}</Alert>
      <div>
        <Button type="submit" loading={busy}>
          Add expense
        </Button>
      </div>
    </form>
  );
}

export default function Accounts() {
  const [month, setMonth] = useState(thisMonth());
  const summary = useLoad(() => get(`/accounts/summary?month=${month}`), [month]);
  const expenses = useLoad(() => get(`/accounts/expenses?month=${month}`), [month]);
  const reload = () => {
    summary.reload();
    expenses.reload();
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Accounts and reports" subtitle="Fee income (from the Fees page) against expenses, and how BioHelix is growing." action={<MonthPicker value={month} onChange={setMonth} max={thisMonth()} />} />
      <Loading state={summary}>
        {(s) => (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat label={`Income in ${monthLabel(month)}`} value={taka(s.income)} tone="text-pass" />
              <Stat label="Expenses" value={taka(s.expense)} tone="text-fail" />
              <Stat label={s.profit >= 0 ? 'Profit' : 'Loss'} value={taka(Math.abs(s.profit))} tone={s.profit >= 0 ? 'text-ink' : 'text-fail'} />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Income by type">
                <ul className="divide-y divide-line">
                  {Object.entries(s.byKind).map(([k, v]) => (
                    <li key={k} className="flex justify-between py-2">
                      <span>{KIND[k]}</span>
                      <span className="font-semibold">{taka(v)}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
              <Panel title="Expenses by type">
                <ul className="divide-y divide-line">
                  {Object.entries(s.byCategory)
                    .filter(([, v]) => v > 0)
                    .map(([k, v]) => (
                      <li key={k} className="flex justify-between py-2">
                        <span>{CATEGORIES[k]}</span>
                        <span className="font-semibold">{taka(v)}</span>
                      </li>
                    ))}
                  {!Object.values(s.byCategory).some(Boolean) && <li className="py-2 text-ink-soft">No expenses this month.</li>}
                </ul>
              </Panel>
            </div>
            <Panel title="Last 12 months: income and expenses">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={s.trend.map((r) => ({ ...r, label: monthLabel(r.month, true) }))} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                    <CartesianGrid stroke="#d9e2df" vertical={false} />
                    <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: '#d9e2df' }} interval="preserveStartEnd" />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={shortTaka} />
                    <Tooltip formatter={(v, name) => [taka(v), name]} contentStyle={{ borderRadius: 8, border: '1px solid #d9e2df' }} />
                    <Legend wrapperStyle={{ fontSize: 13 }} />
                    <Bar isAnimationActive={false} dataKey="income" name="Income" fill="#1b8a86" radius={[3, 3, 0, 0]} />
                    <Bar isAnimationActive={false} dataKey="expense" name="Expenses" fill="#c2410c" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Students">
                <p className="mb-2 text-sm text-ink-soft">Active students each month, and new admissions.</p>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={s.trend.map((r) => ({ ...r, label: monthLabel(r.month, true) }))} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                      <CartesianGrid stroke="#d9e2df" vertical={false} />
                      <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: '#d9e2df' }} interval="preserveStartEnd" />
                      <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #d9e2df' }} />
                      <Legend wrapperStyle={{ fontSize: 13 }} />
                      <Bar isAnimationActive={false} dataKey="active" name="Active" fill="#16304f" radius={[3, 3, 0, 0]} />
                      <Bar isAnimationActive={false} dataKey="admissions" name="New" fill="#5cc7bd" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
              <Panel title="Attendance">
                <p className="mb-2 text-sm text-ink-soft">Share of classes attended (late counts as attended).</p>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={s.trend.map((r) => ({ ...r, label: monthLabel(r.month, true) }))} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
                      <CartesianGrid stroke="#d9e2df" vertical={false} />
                      <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: '#d9e2df' }} interval="preserveStartEnd" />
                      <YAxis domain={[0, 100]} tick={AXIS} tickLine={false} axisLine={false} unit="%" />
                      <Tooltip formatter={(v) => [`${v}%`, 'Attendance']} contentStyle={{ borderRadius: 8, border: '1px solid #d9e2df' }} />
                      <Line isAnimationActive={false} type="monotone" dataKey="attendance" stroke="#1b8a86" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            </div>
          </>
        )}
      </Loading>
      <Panel title="Add an expense">
        <AddExpense
          onAdded={(m) => {
            if (m === month) reload();
            else setMonth(m);
          }}
        />
      </Panel>
      <Panel title={`Expenses in ${monthLabel(month)}`}>
        <Loading state={expenses}>
          {(list) =>
            list.length === 0 ? (
              <p className="text-ink-soft">No expenses recorded.</p>
            ) : (
              <ul className="divide-y divide-line">
                {list.map((e) => (
                  <li key={e._id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="font-semibold">{CATEGORIES[e.category]}</p>
                      <p className="text-sm text-ink-soft">{[formatDate(e.date), e.paidTo, e.note].filter(Boolean).join(' · ')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{taka(e.amount)}</span>
                      <Button
                        variant="ghost"
                        onClick={async () => {
                          if (!window.confirm('Delete this expense?')) return;
                          await del(`/accounts/expenses/${e._id}`);
                          reload();
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )
          }
        </Loading>
      </Panel>
    </div>
  );
}
