import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { del, get, post } from '../../lib/api.js';
import { useBatches } from '../../lib/data.js';
import { formatDate, monthLabel, taka, thisMonth, today } from '../../lib/format.js';
import { Alert, Button, Empty, Field, Input, Loading, MonthPicker, PageHeader, Panel, Select, cx, useLoad } from '../../components/ui.jsx';
import { Logo } from '../../components/Logo.jsx';

const METHODS = { cash: 'Cash', bkash: 'bKash', nagad: 'Nagad', bank: 'Bank' };
const KINDS = { admission: 'Admission fee', monthly: 'Monthly fee', other: 'Other' };

export function paymentLabel(p) {
  return p.kind === 'monthly' ? `Monthly fee, ${monthLabel(p.month)}` : KINDS[p.kind];
}

/** Which fees apply: only admission, only monthly, or both. */
export function feeKinds(account) {
  return {
    admission: (account?.admission?.fee || 0) > 0,
    monthly: (account?.monthlyFee || 0) > 0,
  };
}

function feeSummary(account) {
  const kinds = feeKinds(account);
  const parts = [kinds.admission && `Admission fee ${taka(account.admission.fee)}`, kinds.monthly && `Monthly fee ${taka(account.monthlyFee)}`].filter(Boolean);
  return parts.length ? parts.join(', ') : 'No fees set for this batch';
}

/** Account summary of one student: what is due, month by month. */
export function FeeAccount({ account }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-ink-soft">{feeSummary(account)}</p>
        <p className={cx('text-2xl font-bold', account.totalDue > 0 ? 'text-fail' : 'text-pass')}>
          {account.totalDue > 0 ? `${taka(account.totalDue)} due` : 'All paid'}
        </p>
      </div>
      <ul className="divide-y divide-line rounded-lg border border-line text-sm">
        {account.admission.fee > 0 && (
          <li className="flex justify-between px-3 py-2">
            <span>Admission fee</span>
            <span className={account.admission.due ? 'font-semibold text-fail' : 'text-pass'}>
              {account.admission.due ? `${taka(account.admission.due)} due` : 'Paid'}
            </span>
          </li>
        )}
        {account.months.map((m) => (
          <li key={m.month} className="flex justify-between px-3 py-2">
            <span>{monthLabel(m.month)}</span>
            <span className={m.due ? 'font-semibold text-fail' : 'text-pass'}>{m.due ? `${taka(m.due)} due` : 'Paid'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StudentPicker({ onPick, activeOnly = true, placeholder = 'Type a name, Student ID or phone' }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);

  const search = async (term, pickExact) => {
    if (term.trim().length < 2) return setItems(null);
    setBusy(true);
    try {
      const d = await get(`/students?limit=8${activeOnly ? '&status=active' : ''}&q=${encodeURIComponent(term.trim())}`);
      const exact = d.items.find((x) => x.studentId === term.trim().toUpperCase());
      if (pickExact && (exact || d.items.length === 1)) return choose(exact || d.items[0]);
      setItems(d.items);
    } catch {
      setItems([]);
    } finally {
      setBusy(false);
    }
  };

  const choose = (student) => {
    setItems(null);
    onPick(student);
  };

  // Suggestions while typing
  useEffect(() => {
    const t = setTimeout(() => search(q, false), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          search(q, true);
        }}
      >
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label="Find student" autoFocus />
        <Button type="submit" loading={busy} disabled={q.trim().length < 2}>
          Search
        </Button>
      </form>
      {items && items.length === 0 && <p className="mt-2 text-sm text-ink-soft">No student found.</p>}
      {items?.length > 0 && (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
          {items.map((s) => (
            <li key={s._id}>
              <button type="button" onClick={() => choose(s)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-paper">
                <span className="font-semibold">{s.name}</span>
                <span className="text-right text-sm text-ink-soft">
                  {s.studentId}, {s.batch?.name}
                  {s.status !== 'active' && ` (${s.status})`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CollectPayment({ initialStudentId }) {
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);
  const [account, setAccount] = useState(null);
  const [form, setForm] = useState({ kind: 'monthly', month: thisMonth(), amount: '', discount: '', method: 'cash', trxId: '', note: '', paidAt: today() });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = async (s) => {
    setStudent(s);
    setError('');
    const acc = await get(`/fees/students/${s._id}`);
    setAccount(acc);
    const kinds = feeKinds(acc);
    const oldestDue = [...acc.months].reverse().find((m) => m.due > 0);
    if (kinds.admission && (acc.admission.due > 0 || !kinds.monthly)) {
      setForm((f) => ({ ...f, kind: 'admission', amount: String(acc.admission.due || '') }));
    } else if (kinds.monthly) {
      setForm((f) => ({ ...f, kind: 'monthly', month: oldestDue?.month || thisMonth(), amount: String(oldestDue?.due || acc.monthlyFee || '') }));
    } else {
      setForm((f) => ({ ...f, kind: 'other', amount: '' }));
    }
  };

  useEffect(() => {
    if (initialStudentId) get(`/students/${initialStudentId}`).then(pick).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStudentId]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payment = await post('/fees/payments', {
        student: student._id,
        kind: form.kind,
        ...(form.kind === 'monthly' && { month: form.month }),
        amount: Number(form.amount) || 0,
        discount: Number(form.discount) || 0,
        method: form.method,
        trxId: form.trxId,
        note: form.note,
        paidAt: form.paidAt === today() ? undefined : `${form.paidAt}T12:00:00+06:00`,
      });
      navigate(`/admin/fees/receipt/${payment._id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!student) {
    return (
      <Panel title="Who is paying?">
        <StudentPicker onPick={pick} />
      </Panel>
    );
  }
  if (!account) {
    return (
      <Panel title={student.name}>
        <p className="text-ink-soft">Loading account…</p>
      </Panel>
    );
  }
  const kinds = feeKinds(account);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <Panel
        title={student.name}
        action={
          <button className="text-sm font-semibold text-helix-dark" onClick={() => (setStudent(null), setAccount(null))}>
            Change student
          </button>
        }
      >
        <form onSubmit={submit} className="space-y-4">
          {!kinds.admission && !kinds.monthly && (
            <Alert tone="warn">
              {student.batch?.name || 'This batch'} has no admission or monthly fee set. Set it in <Link to="/admin/batches" className="underline">Batches</Link>, or record an Other payment.
            </Alert>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Fee for">
              <Select value={form.kind} onChange={set('kind')}>
                {kinds.admission && <option value="admission">Admission fee</option>}
                {kinds.monthly && <option value="monthly">Monthly fee</option>}
                <option value="other">Other (book, exam fee…)</option>
              </Select>
            </Field>
            {form.kind === 'monthly' && (
              <Field label="Month">
                <Input type="month" value={form.month} onChange={set('month')} required />
              </Field>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount received (৳)">
              <Input type="number" inputMode="numeric" min="0" value={form.amount} onChange={set('amount')} required />
            </Field>
            <Field label="Discount (৳)" hint="Waived amount, if any">
              <Input type="number" inputMode="numeric" min="0" value={form.discount} onChange={set('discount')} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Paid by">
              <Select value={form.method} onChange={set('method')}>
                {Object.entries(METHODS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            {form.method !== 'cash' && (
              <Field label="Transaction ID">
                <Input value={form.trxId} onChange={set('trxId')} required />
              </Field>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date received">
              <Input type="date" value={form.paidAt} max={today()} onChange={set('paidAt')} required />
            </Field>
            <Field label="Note">
              <Input value={form.note} onChange={set('note')} />
            </Field>
          </div>
          <Alert>{error}</Alert>
          <Button type="submit" loading={busy}>
            Save and print receipt
          </Button>
        </form>
      </Panel>
      <Panel title="Account" className="order-first lg:order-none">
        <FeeAccount account={account} />
      </Panel>
    </div>
  );
}

/** One SMS to every guardian on the due list (at most once a day each). */
function DueSms({ batch, count }) {
  const [msg, setMsg] = useState({ tone: 'error', text: '' });
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        variant="secondary"
        loading={busy}
        onClick={async () => {
          if (!window.confirm(`Send a fee reminder SMS to ${count} guardians?`)) return;
          setBusy(true);
          setMsg({ text: '' });
          try {
            const r = await post('/sms/dues', batch ? { batch } : {});
            setMsg({ tone: r.failed ? 'warn' : 'success', text: `Sent ${r.sent}${r.failed ? `, failed ${r.failed}` : ''}${r.skipped ? `, skipped ${r.skipped} (no number or already reminded today)` : ''}.` });
          } catch (err) {
            setMsg({ tone: 'error', text: err.message });
          } finally {
            setBusy(false);
          }
        }}
      >
        SMS reminder to all
      </Button>
      <Alert tone={msg.tone}>{msg.text}</Alert>
    </div>
  );
}

function DueList() {
  const batches = useBatches('?active=true');
  const [batch, setBatch] = useState('');
  const [month, setMonth] = useState(thisMonth());
  const dues = useLoad(() => get(`/fees/dues?month=${month}${batch ? `&batch=${batch}` : ''}`), [batch, month]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <MonthPicker value={month} onChange={setMonth} max={thisMonth()} />
        <Select value={batch} onChange={(e) => setBatch(e.target.value)} className="w-auto" aria-label="Batch">
          <option value="">All batches</option>
          {batches.data?.map((b) => (
            <option key={b._id} value={b._id}>
              {b.name}
            </option>
          ))}
        </Select>
      </div>
      <Loading state={dues}>
        {(data) =>
          data.items.length === 0 ? (
            <Empty title="Nobody owes anything">Everyone has paid up to {monthLabel(month)}.</Empty>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-semibold">
                  {data.items.length} students, {taka(data.total)} due in total
                </p>
                {month === thisMonth() && <DueSms batch={batch} count={data.items.length} />}
              </div>
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
                {data.items.map((d) => (
                  <li key={d._id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <Link to={`/admin/students/${d._id}`} className="font-semibold hover:text-helix-dark">
                        {d.name}
                      </Link>
                      <p className="text-sm text-ink-soft">
                        {d.studentId}, {d.batch}
                        {d.guardianPhone && `, guardian ${d.guardianPhone}`}
                      </p>
                      <p className="text-sm text-ink-soft">
                        {[d.admissionDue > 0 && 'Admission fee', ...d.unpaidMonths.map((m) => monthLabel(m, true))].filter(Boolean).join(', ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-fail">{taka(d.total)}</span>
                      <Link to={`/admin/fees?student=${d._id}`} className="rounded-lg bg-helix px-3 py-2 text-sm font-semibold text-white hover:bg-helix-dark">
                        Collect
                      </Link>
                    </div>
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

function PaymentRows({ items, showStudent = true }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
      {items.map((p) => (
        <li key={p._id}>
          <Link to={`/admin/fees/receipt/${p._id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-paper">
            <div className="min-w-0">
              <p className="truncate font-semibold">{showStudent ? p.student?.name : paymentLabel(p)}</p>
              <p className="truncate text-sm text-ink-soft">
                {formatDate(p.paidAt)}, {showStudent && `${paymentLabel(p)}, `}
                {METHODS[p.method]}
                {p.discount > 0 && `, discount ${taka(p.discount)}`}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-bold">{taka(p.amount)}</p>
              <p className="text-xs text-ink-soft">{p.receiptNo}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Everything one student has paid, plus what they still owe. */
function StudentHistory({ student, onClear }) {
  const payments = useLoad(() => get(`/fees/payments?student=${student._id}`), [student._id]);
  const account = useLoad(() => get(`/fees/students/${student._id}`), [student._id]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-lg font-semibold">{student.name}</p>
          <p className="text-sm text-ink-soft">
            {student.studentId}, {student.batch?.name}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to={`/admin/fees?student=${student._id}`} className="inline-flex min-h-11 items-center rounded-lg bg-helix px-4 font-semibold text-white hover:bg-helix-dark">
            Collect payment
          </Link>
          <Button variant="secondary" onClick={onClear}>
            Clear
          </Button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Loading state={payments}>
          {(data) =>
            data.items.length === 0 ? (
              <Empty title="No payments yet" />
            ) : (
              <div className="space-y-2">
                <p className="font-semibold">
                  {data.count} {data.count === 1 ? 'payment' : 'payments'}, {taka(data.total)} paid in total
                </p>
                <PaymentRows items={data.items} showStudent={false} />
              </div>
            )
          }
        </Loading>
        <Panel title="Account" className="order-first lg:order-none">
          <Loading state={account}>{(acc) => <FeeAccount account={acc} />}</Loading>
        </Panel>
      </div>
    </div>
  );
}

function PaymentList() {
  const [month, setMonth] = useState(thisMonth());
  const [student, setStudent] = useState(null);
  const payments = useLoad(() => (student ? Promise.resolve(null) : get(`/fees/payments?month=${month}`)), [month, student]);
  return (
    <div className="space-y-5">
      <Panel title="Payment history of one student">
        <StudentPicker onPick={setStudent} activeOnly={false} placeholder="Student ID, name or phone" />
      </Panel>
      {student ? (
        <StudentHistory key={student._id} student={student} onClear={() => setStudent(null)} />
      ) : (
        <>
          <MonthPicker value={month} onChange={setMonth} max={thisMonth()} />
          <Loading state={payments}>
            {(data) =>
              !data ? null : data.items.length === 0 ? (
                <Empty title={`No payments in ${monthLabel(month)}`} />
              ) : (
                <>
                  <p className="font-semibold">
                    {data.count} {data.count === 1 ? 'payment' : 'payments'}, {taka(data.total)} collected in {monthLabel(month)}
                  </p>
                  <PaymentRows items={data.items} />
                </>
              )
            }
          </Loading>
        </>
      )}
    </div>
  );
}

export default function Fees() {
  const [params, setParams] = useSearchParams();
  const studentId = params.get('student');
  const tab = studentId ? 'collect' : params.get('tab') || 'collect';
  const tabs = [
    ['collect', 'Collect payment'],
    ['dues', 'Who owes'],
    ['payments', 'Payments'],
  ];
  return (
    <>
      <PageHeader title="Fees" subtitle="Fee amounts are set on each batch." />
      <div className="mb-5 flex gap-2 overflow-x-auto">
        {tabs.map(([value, label]) => (
          <button
            key={value}
            onClick={() => setParams({ tab: value }, { replace: true })}
            className={cx('min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold', tab === value ? 'bg-ink text-white' : 'border border-line bg-white text-ink-soft')}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'collect' && <CollectPayment key={studentId || 'new'} initialStudentId={studentId} />}
      {tab === 'dues' && <DueList />}
      {tab === 'payments' && <PaymentList />}
    </>
  );
}

/** Printable money receipt. */
export function Receipt() {
  const { id } = useParams();
  const navigate = useNavigate();
  const state = useLoad(() => get(`/fees/payments/${id}`), [id]);
  const [error, setError] = useState('');
  return (
    <Loading state={state}>
      {(p) => (
        <div className="mx-auto max-w-md space-y-4">
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button onClick={() => window.print()}>Print receipt</Button>
            <Button variant="secondary" onClick={() => navigate('/admin/fees?tab=payments')}>
              Go to Fees
            </Button>
            <Button variant="secondary" onClick={() => navigate(`/admin/fees?student=${p.student?._id}`)}>
              Take another payment from {p.student?.name?.split(' ')[0] || 'this student'}
            </Button>
            {p.createdAt && new Date(p.createdAt).toDateString() === new Date().toDateString() && (
              <Button
                variant="ghost"
                onClick={async () => {
                  if (!window.confirm('Delete this payment? Only do this if it was entered by mistake.')) return;
                  try {
                    await del(`/fees/payments/${id}`);
                    navigate('/admin/fees?tab=payments');
                  } catch (err) {
                    setError(err.message);
                  }
                }}
              >
                Delete
              </Button>
            )}
          </div>
          <Alert>{error}</Alert>
          <article className="rounded-xl border border-line bg-white p-6 print:border-ink">
            <header className="flex items-start justify-between gap-3 border-b border-line pb-4">
              <Logo />
              <div className="text-right">
                <p className="text-lg font-bold">Money receipt</p>
                <p className="text-sm text-ink-soft">{p.receiptNo}</p>
              </div>
            </header>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 py-4">
              <dt className="text-ink-soft">Date</dt>
              <dd>{formatDate(p.paidAt)}</dd>
              <dt className="text-ink-soft">Student</dt>
              <dd className="font-semibold">{p.student?.name}</dd>
              <dt className="text-ink-soft">Student ID</dt>
              <dd>{p.student?.studentId}</dd>
              <dt className="text-ink-soft">Batch</dt>
              <dd>{[p.student?.program?.name, p.student?.batch?.name].filter(Boolean).join(', ')}</dd>
              <dt className="text-ink-soft">For</dt>
              <dd>{paymentLabel(p)}</dd>
              <dt className="text-ink-soft">Paid by</dt>
              <dd>
                {METHODS[p.method]}
                {p.trxId && ` (TrxID ${p.trxId})`}
              </dd>
              {p.discount > 0 && (
                <>
                  <dt className="text-ink-soft">Discount</dt>
                  <dd>{taka(p.discount)}</dd>
                </>
              )}
              {p.note && (
                <>
                  <dt className="text-ink-soft">Note</dt>
                  <dd>{p.note}</dd>
                </>
              )}
            </dl>
            <div className="flex items-baseline justify-between border-t border-line pt-4">
              <span className="font-semibold">Amount received</span>
              <span className="text-3xl font-bold">{taka(p.amount)}</span>
            </div>
            <p className="mt-8 text-right text-sm text-ink-soft">Received by {p.receivedByName || 'BioHelix'}</p>
          </article>
        </div>
      )}
    </Loading>
  );
}
