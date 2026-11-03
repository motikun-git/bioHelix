import { useState } from 'react';
import { Link } from 'react-router';
import { del, patch, post } from '../../lib/api.js';
import { DAYS, useBatches, usePrograms } from '../../lib/data.js';
import { schedule, taka } from '../../lib/format.js';
import { Alert, Button, Empty, Field, Input, Loading, Modal, PageHeader, Select, StatusBadge, cx } from '../../components/ui.jsx';

const blank = { program: '', name: '', session: '', days: [], startTime: '', endTime: '', capacity: 0, admissionFee: 0, monthlyFee: 0, isActive: true };

function BatchForm({ initial, programs, onSaved, onCancel }) {
  const [form, setForm] = useState(initial || { ...blank, program: programs[0]?._id || '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const toggleDay = (day) =>
    setForm({ ...form, days: form.days.includes(day) ? form.days.filter((d) => d !== day) : DAYS.filter((d) => [...form.days, day].includes(d)) });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = {
      program: form.program?._id || form.program,
      name: form.name,
      session: form.session,
      days: form.days,
      startTime: form.startTime,
      endTime: form.endTime,
      capacity: Number(form.capacity) || 0,
      admissionFee: Number(form.admissionFee) || 0,
      monthlyFee: Number(form.monthlyFee) || 0,
      isActive: form.isActive,
    };
    try {
      if (initial?._id) await patch(`/batches/${initial._id}`, body);
      else await post('/batches', body);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Program">
        <Select value={form.program?._id || form.program} onChange={set('program')} disabled={initial?.studentCount > 0}>
          {programs.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Batch name" hint="Example: HSC 27 Morning, Admission 26 Evening">
        <Input value={form.name} onChange={set('name')} required />
      </Field>
      <Field label="Session" hint="Example: HSC 2027">
        <Input value={form.session} onChange={set('session')} />
      </Field>
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">Class days</legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => (
            <button
              type="button"
              key={day}
              onClick={() => toggleDay(day)}
              aria-pressed={form.days.includes(day)}
              className={cx(
                'min-h-10 min-w-12 rounded-lg border px-3 font-semibold',
                form.days.includes(day) ? 'border-helix bg-helix text-white' : 'border-line bg-white text-ink-soft',
              )}
            >
              {day}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts">
          <Input type="time" value={form.startTime} onChange={set('startTime')} />
        </Field>
        <Field label="Ends">
          <Input type="time" value={form.endTime} onChange={set('endTime')} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Admission fee (৳)" hint="One time">
          <Input type="number" min="0" inputMode="numeric" value={form.admissionFee ?? 0} onChange={set('admissionFee')} />
        </Field>
        <Field label="Monthly fee (৳)" hint="0 if not monthly">
          <Input type="number" min="0" inputMode="numeric" value={form.monthlyFee ?? 0} onChange={set('monthlyFee')} />
        </Field>
      </div>
      <Field label="Seats" hint="0 means no limit">
        <Input type="number" min="0" inputMode="numeric" value={form.capacity} onChange={set('capacity')} />
      </Field>
      {initial?._id && (
        <label className="flex items-center gap-2">
          <input type="checkbox" className="size-5 accent-helix" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
          Batch is running
        </label>
      )}
      <Alert>{error}</Alert>
      <div className="flex gap-2">
        <Button type="submit" loading={busy}>
          {initial?._id ? 'Save batch' : 'Create batch'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export default function Batches() {
  const programs = usePrograms();
  const batches = useBatches();
  const [editing, setEditing] = useState(null); // null | 'new' | batch
  const [error, setError] = useState('');

  const remove = async (batch) => {
    if (!window.confirm(`Delete batch "${batch.name}"?`)) return;
    try {
      await del(`/batches/${batch._id}`);
      batches.reload();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <PageHeader
        title="Batches"
        subtitle="HSC and Admission batches with their class days."
        action={<Button onClick={() => setEditing('new')}>New batch</Button>}
      />
      <Alert className="mb-4">{error}</Alert>
      <Loading state={batches}>
        {(list) =>
          list.length === 0 ? (
            <Empty title="No batches yet" action={<Button onClick={() => setEditing('new')}>Create the first batch</Button>}>
              A batch groups students who sit together, for example &quot;HSC 27 Morning&quot;.
            </Empty>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
              {list.map((b) => (
                <li key={b._id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {b.name} {!b.isActive && <StatusBadge status="inactive" label="Stopped" />}
                    </p>
                    <p className="text-sm text-ink-soft">
                      {[b.program?.name, b.session, schedule(b), b.monthlyFee > 0 && `${taka(b.monthlyFee)}/month`].filter(Boolean).join(', ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link to={`/admin/students?batch=${b._id}`} className="rounded-lg px-3 py-2 text-sm font-semibold text-helix-dark hover:bg-helix-tint">
                      {b.studentCount} {b.studentCount === 1 ? 'student' : 'students'}
                      {b.capacity > 0 && ` of ${b.capacity}`}
                    </Link>
                    <Button variant="secondary" onClick={() => setEditing(b)}>
                      Edit
                    </Button>
                    {b.studentCount === 0 && (
                      <Button variant="ghost" onClick={() => remove(b)}>
                        Delete
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </Loading>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === 'new' ? 'New batch' : 'Edit batch'}>
        {editing && programs.data && (
          <BatchForm
            key={editing === 'new' ? 'new' : editing._id}
            initial={editing === 'new' ? null : editing}
            programs={programs.data}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              batches.reload();
            }}
          />
        )}
      </Modal>
    </>
  );
}
