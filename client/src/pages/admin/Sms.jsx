import { useEffect, useState } from 'react';
import { get, post, put } from '../../lib/api.js';
import { useBatches } from '../../lib/data.js';
import { formatDate } from '../../lib/format.js';
import { Alert, Button, Chips, Field, Input, Loading, PageHeader, Panel, Select, Textarea, cx, useLoad } from '../../components/ui.jsx';

const SEND_TO = [
  { value: 'guardian', label: 'Guardian' },
  { value: 'student', label: 'Student' },
  { value: 'both', label: 'Both' },
];

/** Bangla text costs one SMS per 70 letters (67 when longer); English per 160 (153). */
function smsParts(text) {
  if (!text) return { parts: 0, unicode: false };
  const unicode = /[^\x00-\x7F]/.test(text);
  const [one, many] = unicode ? [70, 67] : [160, 153];
  const length = [...text].length;
  return { parts: length <= one ? 1 : Math.ceil(length / many), unicode, length };
}

function Settings({ initial, onSaved }) {
  const [form, setForm] = useState(initial);
  const [msg, setMsg] = useState('');
  const save = async (next) => {
    setForm(next);
    setMsg('');
    try {
      onSaved(await put('/sms/settings', next));
      setMsg('Saved');
    } catch (err) {
      setMsg(err.message);
    }
  };
  const toggle = (key, label, hint) => (
    <label className="flex items-start gap-3 py-2">
      <input type="checkbox" className="mt-1 size-5 accent-helix" checked={form[key]} onChange={(e) => save({ ...form, [key]: e.target.checked })} />
      <span>
        <span className="font-semibold">{label}</span>
        <span className="block text-sm text-ink-soft">{hint}</span>
      </span>
    </label>
  );
  return (
    <div className="space-y-2">
      {toggle('onAbsent', 'Absent in class', 'When you save attendance, each absent student’s guardian gets one SMS.')}
      {toggle('onResult', 'Exam result', 'When you publish an exam, every student who sat it gets marks and merit position.')}
      {toggle('onPayment', 'Fee received', 'When you record a payment, the amount and receipt number are sent.')}
      <div>
        <p className="mb-1 text-sm font-semibold">Automatic SMS go to</p>
        <Chips options={SEND_TO} value={form.sendTo} onChange={(sendTo) => save({ ...form, sendTo })} />
      </div>
      <p className="text-sm text-ink-soft">The same news is never sent twice, even if you save attendance or publish again. {msg && <b>{msg}</b>}</p>
    </div>
  );
}

function SendForm({ onSent }) {
  const batches = useBatches('?active=true');
  const [form, setForm] = useState({ batch: '', sendTo: 'guardian', message: '' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { parts, unicode, length } = smsParts(form.message);
  const batchName = batches.data?.find((b) => b._id === form.batch)?.name;

  const submit = async (e) => {
    e.preventDefault();
    const who = batchName ? `all active students of ${batchName}` : 'ALL active students';
    if (!window.confirm(`Send this SMS to ${who}?`)) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const body = { sendTo: form.sendTo, message: form.message };
      if (form.batch) body.batch = form.batch;
      setResult(await post('/sms/send', body));
      setForm({ ...form, message: '' });
      onSent();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="To">
        <Select value={form.batch} onChange={(e) => setForm({ ...form, batch: e.target.value })}>
          <option value="">All active batches</option>
          {batches.data?.map((b) => (
            <option key={b._id} value={b._id}>
              {b.name}
            </option>
          ))}
        </Select>
      </Field>
      <div>
        <p className="mb-1 text-sm font-semibold">Send to</p>
        <Chips options={SEND_TO} value={form.sendTo} onChange={(sendTo) => setForm({ ...form, sendTo })} />
      </div>
      <Field
        label="Message"
        hint={form.message ? `${length} letters, ${parts} SMS per number${unicode ? ' (Bangla: 70 letters per SMS)' : ''}` : 'Start with “BioHelix:” so people know who sent it'}
      >
        <Textarea rows={4} maxLength={600} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="BioHelix: আগামীকাল ক্লাস বন্ধ থাকবে।" required />
      </Field>
      <Alert>{error}</Alert>
      {result && (
        <Alert tone={result.failed ? 'warn' : 'success'}>
          Sent {result.sent}
          {result.failed > 0 && `, failed ${result.failed}`}
          {result.skipped > 0 && `, skipped ${result.skipped} (no phone number)`}.
        </Alert>
      )}
      <Button type="submit" loading={busy}>
        Send SMS
      </Button>
    </form>
  );
}

function TestSms() {
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState({ tone: 'error', text: '' });
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg({ text: '' });
        try {
          await post('/sms/test', { phone });
          setMsg({ tone: 'success', text: 'Test SMS sent. Check the phone.' });
        } catch (err) {
          setMsg({ tone: 'error', text: err.message });
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Send a test SMS to" className="min-w-48 flex-1">
        <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" required />
      </Field>
      <Button type="submit" variant="secondary" loading={busy}>
        Send test
      </Button>
      <Alert tone={msg.tone} className="w-full">
        {msg.text}
      </Alert>
    </form>
  );
}

const KIND = { absent: 'Absent', result: 'Result', payment: 'Payment', manual: 'Manual', test: 'Test', reset: 'Password code' };

function Log({ logs }) {
  const [open, setOpen] = useState(null);
  if (!logs.length) return <p className="text-ink-soft">No SMS sent yet.</p>;
  return (
    <ul className="divide-y divide-line rounded-lg border border-line">
      {logs.map((l) => (
        <li key={l._id}>
          <button type="button" onClick={() => setOpen(open === l._id ? null : l._id)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left">
            <span className="min-w-0">
              <span className="font-semibold">{l.student?.name || `0${l.to.slice(3)}`}</span>
              <span className="block truncate text-sm text-ink-soft">
                {KIND[l.kind]}, {formatDate(l.createdAt)}, {l.kind === 'reset' ? 'code hidden' : l.message}
              </span>
            </span>
            <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold', l.status === 'sent' ? 'bg-pass-tint text-pass' : 'bg-fail-tint text-fail')}>
              {l.status === 'sent' ? 'Sent' : 'Failed'}
            </span>
          </button>
          {open === l._id && (
            <div className="space-y-1 bg-paper px-3 py-2 text-sm">
              <p>To 0{l.to.slice(3)}</p>
              {l.kind !== 'reset' && <p className="whitespace-pre-wrap">{l.message}</p>}
              {l.error && <p className="text-fail">{l.error}</p>}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function Sms() {
  const state = useLoad(() => get('/sms'));
  const [settings, setSettings] = useState(null);
  useEffect(() => {
    if (state.data) setSettings(state.data.settings);
  }, [state.data]);

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="SMS" subtitle="Absence, result and fee SMS to guardians, plus notices to a whole batch." />
      <Loading state={state}>
        {(d) => (
          <>
            {!d.enabled ? (
              <Panel title="SMS is not set up yet">
                <ol className="list-decimal space-y-2 pl-5">
                  <li>
                    Open an account at <b>sms.net.bd</b> (Alpha SMS) and buy some SMS credit (bKash works). A Bangla SMS costs about 35 to 50 paisa.
                  </li>
                  <li>In their panel open <b>API</b> and copy the API key.</li>
                  <li>
                    On the hosting (Northflank) add an environment variable <code className="rounded bg-paper px-1">SMS_API_KEY</code> with that key, then restart the
                    service. Optional: <code className="rounded bg-paper px-1">SMS_SENDER_ID</code> once they approve a “BioHelix” sender name.
                  </li>
                  <li>Come back here, send a test SMS, then turn on the automatic messages you want.</li>
                </ol>
                <p className="mt-3 text-sm text-ink-soft">Students’ “Forgot password” by SMS also starts working once this is set.</p>
              </Panel>
            ) : (
              <Panel
                title="Status"
                action={
                  d.balance !== null && (
                    <span className="text-sm font-semibold text-ink-soft">
                      Balance: <span className="text-ink">৳{d.balance.toFixed(2)}</span>
                    </span>
                  )
                }
              >
                {d.dryRun && (
                  <Alert tone="warn" className="mb-3">
                    Test mode (SMS_DRY_RUN=1): messages are only written to the log below, nothing is really sent.
                  </Alert>
                )}
                <TestSms />
              </Panel>
            )}
            {settings && (
              <Panel title="Automatic SMS">
                <Settings initial={settings} onSaved={setSettings} />
              </Panel>
            )}
            {d.enabled && (
              <Panel title="Send a message">
                <SendForm onSent={state.reload} />
              </Panel>
            )}
            <Panel title="Last 100 SMS">
              <Log logs={d.logs} />
            </Panel>
          </>
        )}
      </Loading>
    </div>
  );
}
