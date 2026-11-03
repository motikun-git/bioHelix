import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { get, patch, post } from '../../lib/api.js';
import { useBatches, usePrograms } from '../../lib/data.js';
import { formatDate, num, toDateInput } from '../../lib/format.js';
import { Alert, Button, Empty, Field, Input, Loading, Modal, PageHeader, Select, StatusBadge, cx, useLoad } from '../../components/ui.jsx';

export function ExamForm({ initial, onSaved, onCancel }) {
  const programs = usePrograms();
  const batches = useBatches('?active=true');
  const [form, setForm] = useState(
    initial
      ? {
          title: initial.title,
          program: initial.program?._id || initial.program,
          batches: initial.batches.map((b) => b._id || b),
          date: toDateInput(initial.date),
          mode: initial.mode,
          totalMarks: initial.totalMarks,
          passMarks: initial.passMarks,
        }
      : { title: '', program: '', batches: [], date: toDateInput(new Date()), mode: 'google_form', totalMarks: '', passMarks: '' },
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const program = form.program || programs.data?.[0]?._id || '';
  const programBatches = batches.data?.filter((b) => b.program?._id === program) || [];
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = {
      ...form,
      program,
      totalMarks: Number(form.totalMarks),
      passMarks: Number(form.passMarks) || 0,
    };
    try {
      const exam = initial ? await patch(`/exams/${initial._id}`, body) : await post('/exams', body);
      onSaved(exam);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (programs.loading || batches.loading) return <p className="text-ink-soft">Loading…</p>;

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Exam name" hint="Example: Cell Biology MCQ, Weekly Test 5">
        <Input value={form.title} onChange={set('title')} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Program">
          <Select value={program} onChange={(e) => setForm({ ...form, program: e.target.value, batches: [] })} disabled={initial && initial.status !== 'draft'}>
            {programs.data.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Exam date">
          <Input type="date" value={form.date} onChange={set('date')} required />
        </Field>
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">Batches that sit this exam</legend>
        {programBatches.length === 0 ? (
          <p className="text-sm text-fail">This program has no running batch yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {programBatches.map((b) => {
              const on = form.batches.includes(b._id);
              return (
                <button
                  type="button"
                  key={b._id}
                  aria-pressed={on}
                  onClick={() => setForm({ ...form, batches: on ? form.batches.filter((x) => x !== b._id) : [...form.batches, b._id] })}
                  className={cx('min-h-10 rounded-lg border px-3 font-semibold', on ? 'border-helix bg-helix text-white' : 'border-line bg-white text-ink-soft')}
                >
                  {b.name}
                </button>
              );
            })}
          </div>
        )}
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">How are marks collected?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ['google_form', 'Google Form', 'Marks come from the form’s response sheet'],
            ['offline', 'Offline (paper)', 'You type each student’s marks'],
          ].map(([value, label, hint]) => (
            <label key={value} className={cx('cursor-pointer rounded-lg border p-3', form.mode === value ? 'border-helix bg-helix-tint' : 'border-line bg-white')}>
              <input type="radio" name="mode" value={value} checked={form.mode === value} onChange={set('mode')} className="sr-only" />
              <span className="block font-semibold">{label}</span>
              <span className="block text-sm text-ink-soft">{hint}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Total marks">
          <Input type="number" inputMode="decimal" min="1" step="any" value={form.totalMarks} onChange={set('totalMarks')} required />
        </Field>
        <Field label="Pass marks" hint="0 if there is no pass mark">
          <Input type="number" inputMode="decimal" min="0" step="any" value={form.passMarks} onChange={set('passMarks')} />
        </Field>
      </div>
      <Alert>{error}</Alert>
      <div className="flex gap-2">
        <Button type="submit" loading={busy} disabled={!form.batches.length}>
          {initial ? 'Save exam' : 'Create exam'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export default function Exams() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const exams = useLoad(() => get(`/exams${status ? `?status=${status}` : ''}`), [status]);

  return (
    <>
      <PageHeader title="Exams" action={<Button onClick={() => setCreating(true)}>New exam</Button>} />
      <div className="mb-4 flex gap-2 overflow-x-auto">
        {[
          ['', 'All'],
          ['draft', 'No marks yet'],
          ['imported', 'Not published'],
          ['published', 'Published'],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setStatus(value)}
            className={cx('min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold', status === value ? 'bg-ink text-white' : 'bg-white text-ink-soft border border-line')}
          >
            {label}
          </button>
        ))}
      </div>
      <Loading state={exams}>
        {(list) =>
          list.length === 0 ? (
            <Empty title="No exams here" action={<Button onClick={() => setCreating(true)}>Create an exam</Button>}>
              Create an exam for one or more batches, then bring in the marks.
            </Empty>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
              {list.map((e) => (
                <li key={e._id}>
                  <Link to={`/admin/exams/${e._id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-paper">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{e.title}</p>
                      <p className="truncate text-sm text-ink-soft">
                        {formatDate(e.date)}, {e.batches.map((b) => b.name).join(', ')}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <StatusBadge status={e.status} />
                      {e.stats.present > 0 && (
                        <p className="mt-1 text-sm text-ink-soft">
                          {e.stats.present} sat, avg {num(e.stats.average)}/{e.totalMarks}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
      </Loading>
      <Modal open={creating} onClose={() => setCreating(false)} title="New exam">
        {creating && <ExamForm onCancel={() => setCreating(false)} onSaved={(exam) => navigate(`/admin/exams/${exam._id}`)} />}
      </Modal>
    </>
  );
}
