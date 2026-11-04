import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { del, get, patch, post, put } from '../../lib/api.js';
import { formatDate } from '../../lib/format.js';
import { Alert, Button, Empty, Field, Input, Loading, Modal, PageHeader, Panel, Textarea, cx, useLoad } from '../../components/ui.jsx';

// ================= Admission inquiries =================

const STATUS = {
  new: { label: 'New', tone: 'bg-draft-tint text-draft' },
  called: { label: 'Called', tone: 'bg-helix-tint text-helix-dark' },
  admitted: { label: 'Admitted', tone: 'bg-pass-tint text-pass' },
  closed: { label: 'Closed', tone: 'bg-paper text-ink-soft' },
};

function InquiryRow({ item, onChange }) {
  const [note, setNote] = useState(item.note);
  const [saving, setSaving] = useState(false);
  const update = async (data) => {
    setSaving(true);
    try {
      await patch(`/inquiries/${item._id}`, data);
      onChange();
    } finally {
      setSaving(false);
    }
  };
  const admitLink = `/admin/students/new?${new URLSearchParams({ name: item.name, phone: item.phone, guardianPhone: item.guardianPhone || '', college: item.college || '', inquiry: item._id })}`;
  return (
    <li className="space-y-3 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">
            {item.name} <span className={cx('ml-1 rounded-full px-2 py-0.5 text-xs font-semibold', STATUS[item.status].tone)}>{STATUS[item.status].label}</span>
          </p>
          <p className="text-sm text-ink-soft">
            {formatDate(item.createdAt)}
            {item.program && `, ${item.program.name}`}
            {item.college && `, ${item.college}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`tel:${item.phone}`} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:border-ink-soft">
            Call {item.phone}
          </a>
          {item.guardianPhone && (
            <a href={`tel:${item.guardianPhone}`} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:border-ink-soft">
              Guardian {item.guardianPhone}
            </a>
          )}
        </div>
      </div>
      {item.message && <p className="rounded-lg bg-paper px-3 py-2 text-sm">{item.message}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {['called', 'closed', 'new']
          .filter((s) => s !== item.status)
          .map((s) => (
            <Button key={s} variant="secondary" disabled={saving} onClick={() => update({ status: s })}>
              Mark {STATUS[s].label.toLowerCase()}
            </Button>
          ))}
        {item.status !== 'admitted' && (
          <Link to={admitLink} className="inline-flex min-h-11 items-center rounded-lg bg-helix px-4 font-semibold text-white hover:bg-helix-dark">
            Admit as student
          </Link>
        )}
      </div>
      <div className="flex gap-2">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Your note (e.g. will come Saturday)" aria-label="Note" />
        <Button variant="secondary" disabled={note === item.note || saving} onClick={() => update({ note })}>
          Save
        </Button>
      </div>
    </li>
  );
}

export function Inquiries() {
  const [status, setStatus] = useState('new');
  const state = useLoad(() => get(`/inquiries${status ? `?status=${status}` : ''}`), [status]);
  return (
    <>
      <PageHeader title="Admission inquiries" subtitle="People who filled the form on the public website." />
      <div className="mb-4 flex gap-2 overflow-x-auto">
        {[['new', 'New'], ['called', 'Called'], ['admitted', 'Admitted'], ['closed', 'Closed'], ['', 'All']].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setStatus(value)}
            className={cx('min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold', status === value ? 'bg-ink text-white' : 'border border-line bg-white text-ink-soft')}
          >
            {label}
            {value === 'new' && state.data?.newCount > 0 && ` (${state.data.newCount})`}
          </button>
        ))}
      </div>
      <Loading state={state}>
        {(data) =>
          data.items.length === 0 ? (
            <Empty title="Nothing here">New inquiries from the website appear here. Share the website link on the Facebook page.</Empty>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
              {data.items.map((item) => (
                <InquiryRow key={item._id} item={item} onChange={state.reload} />
              ))}
            </ul>
          )
        }
      </Loading>
    </>
  );
}

// ================= Public website settings =================

function SiteForm() {
  const state = useLoad(() => get('/site'));
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState({ tone: 'error', text: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (state.data) setForm(state.data);
  }, [state.data]);
  if (!form) return <Loading state={state}>{() => null}</Loading>;
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg({ text: '' });
    try {
      setForm(await put('/site', form));
      setMsg({ tone: 'success', text: 'Saved. The public website shows it within a minute.' });
    } catch (err) {
      setMsg({ tone: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <Field label="Headline" hint="The big line at the top of the home page">
        <Input value={form.tagline} onChange={set('tagline')} />
      </Field>
      <Field label="About BioHelix">
        <Textarea rows={5} value={form.about} onChange={set('about')} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone">
          <Input value={form.phone} onChange={set('phone')} placeholder="01XXXXXXXXX" />
        </Field>
        <Field label="WhatsApp number">
          <Input value={form.whatsapp} onChange={set('whatsapp')} placeholder="01XXXXXXXXX" />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Facebook page link">
          <Input value={form.facebook} onChange={set('facebook')} placeholder="https://www.facebook.com/..." />
        </Field>
      </div>
      <Field label="Address">
        <Textarea rows={2} value={form.address} onChange={set('address')} />
      </Field>
      <Field label="Google Maps link" hint="Open the place in Google Maps, tap Share, copy the link">
        <Input value={form.mapUrl} onChange={set('mapUrl')} placeholder="https://maps.app.goo.gl/..." />
      </Field>
      <fieldset className="space-y-2 rounded-lg bg-paper p-3">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="size-5 accent-helix" checked={form.admissionOpen} onChange={set('admissionOpen')} />
          Admission is open (show the admission form)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="size-5 accent-helix" checked={form.showFees} onChange={set('showFees')} />
          Show batch fees on the website
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="size-5 accent-helix" checked={form.showMeritList ?? true} onChange={set('showMeritList')} />
          Show the top 10 names on each result in the student portal
        </label>
        <Field label="Admission note" hint="Optional, e.g. 'HSC 27 batch starts 1 December'">
          <Input value={form.admissionNote} onChange={set('admissionNote')} />
        </Field>
      </fieldset>
      <Alert tone={msg.tone}>{msg.text}</Alert>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy}>
          Save website
        </Button>
        <a href="/" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-lg px-4 font-semibold text-helix-dark hover:bg-helix-tint">
          Open website
        </a>
      </div>
    </form>
  );
}

function AchievementForm({ initial, onSaved, onCancel }) {
  const [form, setForm] = useState(initial || { name: '', result: '', year: '', quote: '', order: 0 });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          const body = { name: form.name, result: form.result, year: form.year, quote: form.quote, order: Number(form.order) || 0 };
          if (initial) await patch(`/site/achievements/${initial._id}`, body);
          else await post('/site/achievements', body);
          onSaved();
        } catch (err) {
          setError(err.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Student name">
        <Input value={form.name} onChange={set('name')} required />
      </Field>
      <Field label="Result" hint="e.g. Dhaka Medical College, or GPA 5 in Biology">
        <Input value={form.result} onChange={set('result')} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Year / session">
          <Input value={form.year} onChange={set('year')} placeholder="2025-26" />
        </Field>
        <Field label="Order" hint="Smaller shows first">
          <Input type="number" min="0" value={form.order} onChange={set('order')} />
        </Field>
      </div>
      <Field label="A line from the student (optional)">
        <Textarea rows={2} value={form.quote} onChange={set('quote')} />
      </Field>
      <p className="text-sm text-ink-soft">Only add students who (and whose guardians) agreed to be shown publicly.</p>
      <Alert>{error}</Alert>
      <div className="flex gap-2">
        <Button type="submit" loading={busy}>
          Save
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Achievements() {
  const state = useLoad(() => get('/site/achievements'));
  const [editing, setEditing] = useState(null);
  return (
    <>
      <Loading state={state}>
        {(list) =>
          list.length === 0 ? (
            <p className="text-ink-soft">No achievements yet. The Results section is hidden on the website until you add one.</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {list.map((a) => (
                <li key={a._id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="font-semibold">{a.name}</p>
                    <p className="text-sm text-ink-soft">
                      {a.result}
                      {a.year && `, ${a.year}`}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" onClick={() => setEditing(a)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        if (!window.confirm(`Remove ${a.name} from the website?`)) return;
                        await del(`/site/achievements/${a._id}`);
                        state.reload();
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </Loading>
      <Button variant="secondary" className="mt-3" onClick={() => setEditing('new')}>
        Add achievement
      </Button>
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add achievement' : 'Edit achievement'}>
        {editing && (
          <AchievementForm
            key={editing === 'new' ? 'new' : editing._id}
            initial={editing === 'new' ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              state.reload();
            }}
          />
        )}
      </Modal>
    </>
  );
}

export function WebsiteSettings() {
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Public website" subtitle="What visitors see at the home page. Programs and batches come from the Batches page." />
      <Panel title="Details">
        <SiteForm />
      </Panel>
      <Panel title="Results / achievements">
        <Achievements />
      </Panel>
    </div>
  );
}
