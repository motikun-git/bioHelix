import { useState } from 'react';
import { del, get, patch, post } from '../../lib/api.js';
import { useBatches, usePrograms } from '../../lib/data.js';
import { dayLabel, formatDate, formatTime, monthLabel, shiftMonth, thisMonth, today } from '../../lib/format.js';
import { Alert, Button, Chips, Empty, Field, Input, Loading, Modal, PageHeader, Select, Textarea, cx, useLoad } from '../../components/ui.jsx';

// ---------- Notices ----------

function NoticeForm({ initial, onSaved, onCancel }) {
  const programs = usePrograms();
  const batches = useBatches('?active=true');
  const [form, setForm] = useState({
    title: initial?.title || '',
    body: initial?.body || '',
    audience: initial?.audience || 'all',
    programs: initial?.programs?.map((p) => p._id || p) || [],
    batches: initial?.batches?.map((b) => b._id || b) || [],
    pinned: initial?.pinned || false,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (initial) await patch(`/notices/${initial._id}`, form);
      else await post('/notices', form);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Title">
        <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
      </Field>
      <Field label="Details" hint="Bangla or English, both are fine">
        <Textarea rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
      </Field>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-semibold">Who should see it?</legend>
        <Chips
          options={[
            { value: 'all', label: 'Everyone' },
            { value: 'program', label: 'A program' },
            { value: 'batch', label: 'Some batches' },
          ]}
          value={form.audience}
          onChange={(audience) => setForm({ ...form, audience })}
        />
        {form.audience === 'program' && programs.data && (
          <Chips multiple options={programs.data.map((p) => ({ value: p._id, label: p.name }))} value={form.programs} onChange={(v) => setForm({ ...form, programs: v })} />
        )}
        {form.audience === 'batch' && batches.data && (
          <Chips multiple options={batches.data.map((b) => ({ value: b._id, label: b.name }))} value={form.batches} onChange={(v) => setForm({ ...form, batches: v })} />
        )}
      </fieldset>
      <label className="flex items-center gap-2">
        <input type="checkbox" className="size-5 accent-helix" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} />
        Pin to the top
      </label>
      <Alert>{error}</Alert>
      <div className="flex gap-2">
        <Button type="submit" loading={busy}>
          {initial ? 'Save notice' : 'Post notice'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function audienceText(n) {
  if (n.audience === 'program') return n.programs.map((p) => p.name).join(', ');
  if (n.audience === 'batch') return n.batches.map((b) => b.name).join(', ');
  return 'Everyone';
}

export default function Notices() {
  const notices = useLoad(() => get('/notices'));
  const [editing, setEditing] = useState(null);

  const remove = async (n) => {
    if (!window.confirm(`Delete "${n.title}"?`)) return;
    await del(`/notices/${n._id}`);
    notices.reload();
  };

  return (
    <>
      <PageHeader title="Notices" subtitle="Students see these in their portal." action={<Button onClick={() => setEditing('new')}>New notice</Button>} />
      <Loading state={notices}>
        {(list) =>
          list.length === 0 ? (
            <Empty title="No notices yet" action={<Button onClick={() => setEditing('new')}>Post the first notice</Button>} />
          ) : (
            <ul className="space-y-3">
              {list.map((n) => (
                <li key={n._id} className={cx('rounded-xl border bg-white p-4', n.pinned ? 'border-helix' : 'border-line')}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {n.pinned && <span className="mr-2 rounded bg-helix-tint px-1.5 py-0.5 text-xs text-helix-dark">Pinned</span>}
                        {n.title}
                      </p>
                      <p className="text-sm text-ink-soft">
                        {formatDate(n.createdAt)}, for {audienceText(n)}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" onClick={() => setEditing(n)}>
                        Edit
                      </Button>
                      <Button variant="ghost" onClick={() => remove(n)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                  {n.body && <p className="mt-2 whitespace-pre-line">{n.body}</p>}
                </li>
              ))}
            </ul>
          )
        }
      </Loading>
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === 'new' ? 'New notice' : 'Edit notice'}>
        {editing && (
          <NoticeForm
            key={editing === 'new' ? 'new' : editing._id}
            initial={editing === 'new' ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              notices.reload();
            }}
          />
        )}
      </Modal>
    </>
  );
}

// ---------- Calendar ----------

const TYPE_STYLE = {
  class: 'bg-helix-tint text-helix-dark',
  exam: 'bg-[#e4e9f6] text-ink',
  holiday: 'bg-fail-tint text-fail',
  other: 'bg-paper text-ink-soft',
};
const TYPE_LABEL = { class: 'Extra class', exam: 'Exam', holiday: 'Holiday', other: 'Other' };

function EventForm({ initial, onSaved, onCancel }) {
  const batches = useBatches('?active=true');
  const [form, setForm] = useState({
    title: initial?.title || '',
    type: initial?.type || 'class',
    date: initial?.date || today(),
    startTime: initial?.startTime || '',
    endTime: initial?.endTime || '',
    batches: initial?.batches?.map((b) => b._id || b) || [],
    note: initial?.note || '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (initial) await patch(`/events/${initial._id}`, form);
      else await post('/events', form);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="What">
        <Input value={form.title} onChange={set('title')} placeholder="Extra class: Genetics" required />
      </Field>
      <Field label="Type">
        <Select value={form.type} onChange={set('type')}>
          <option value="class">Extra class</option>
          <option value="holiday">Holiday / no class</option>
          <option value="other">Other</option>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Date" className="col-span-2 sm:col-span-1">
          <Input type="date" value={form.date} onChange={set('date')} required />
        </Field>
        <Field label="Starts">
          <Input type="time" value={form.startTime} onChange={set('startTime')} />
        </Field>
        <Field label="Ends">
          <Input type="time" value={form.endTime} onChange={set('endTime')} />
        </Field>
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">Batches (none selected means everyone)</legend>
        {batches.data && (
          <Chips multiple options={batches.data.map((b) => ({ value: b._id, label: b.name }))} value={form.batches} onChange={(v) => setForm({ ...form, batches: v })} />
        )}
      </fieldset>
      <Field label="Note">
        <Input value={form.note} onChange={set('note')} />
      </Field>
      <Alert>{error}</Alert>
      <div className="flex gap-2">
        <Button type="submit" loading={busy}>
          {initial ? 'Save' : 'Add to calendar'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function Calendar() {
  const [month, setMonth] = useState(thisMonth());
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const items = useLoad(() => get(`/events?from=${month}-01&to=${month}-${lastDay}`), [month]);

  const remove = async (item) => {
    if (!window.confirm(`Remove "${item.title}"?`)) return;
    try {
      await del(`/events/${item._id}`);
      items.reload();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <PageHeader title="Calendar" subtitle="Extra classes and holidays. Exams appear here automatically." action={<Button onClick={() => setEditing('new')}>Add event</Button>} />
      <div className="mb-4 flex items-center gap-2">
        <button onClick={() => setMonth(shiftMonth(month, -1))} className="min-h-11 rounded-lg border border-line bg-white px-3" aria-label="Previous month">
          ‹
        </button>
        <span className="min-w-40 text-center text-lg font-semibold">{monthLabel(month)}</span>
        <button onClick={() => setMonth(shiftMonth(month, 1))} className="min-h-11 rounded-lg border border-line bg-white px-3" aria-label="Next month">
          ›
        </button>
        {month !== thisMonth() && (
          <Button variant="ghost" onClick={() => setMonth(thisMonth())}>
            This month
          </Button>
        )}
      </div>
      <Alert className="mb-3">{error}</Alert>
      <Loading state={items}>
        {(list) => {
          if (!list.length) return <Empty title={`Nothing on the calendar in ${monthLabel(month)}`} />;
          const byDate = list.reduce((acc, item) => ((acc[item.date] ||= []).push(item), acc), {});
          return (
            <ol className="space-y-3">
              {Object.entries(byDate).map(([date, dayItems]) => (
                <li key={date} className={cx('grid grid-cols-[4.5rem_1fr] gap-3 rounded-xl border bg-white p-3', date === today() ? 'border-helix' : 'border-line')}>
                  <div className="text-center">
                    <p className="text-2xl font-bold leading-none">{Number(date.slice(8))}</p>
                    <p className="text-sm text-ink-soft">{dayLabel(date).split(',')[0]}</p>
                  </div>
                  <ul className="space-y-2">
                    {dayItems.map((item) => (
                      <li key={item._id} className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className={cx('mr-2 rounded px-1.5 py-0.5 text-xs font-semibold', TYPE_STYLE[item.type])}>{TYPE_LABEL[item.type]}</span>
                          <span className="font-semibold">{item.title}</span>
                          <p className="text-sm text-ink-soft">
                            {[item.startTime && `${formatTime(item.startTime)}${item.endTime ? `–${formatTime(item.endTime)}` : ''}`, item.batches?.length ? item.batches.map((b) => b.name).join(', ') : 'All batches', item.note]
                              .filter(Boolean)
                              .join(', ')}
                          </p>
                        </div>
                        {item.kind === 'event' && (
                          <div className="flex gap-1">
                            <Button variant="ghost" onClick={() => setEditing(item)}>
                              Edit
                            </Button>
                            <Button variant="ghost" onClick={() => remove(item)}>
                              Remove
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          );
        }}
      </Loading>
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add to calendar' : 'Edit event'}>
        {editing && (
          <EventForm
            key={editing === 'new' ? 'new' : editing._id}
            initial={editing === 'new' ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              items.reload();
            }}
          />
        )}
      </Modal>
    </>
  );
}
