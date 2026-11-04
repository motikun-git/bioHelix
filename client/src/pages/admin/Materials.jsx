import { useState } from 'react';
import { del, get, patch, post } from '../../lib/api.js';
import { useBatches, usePrograms } from '../../lib/data.js';
import { formatDate } from '../../lib/format.js';
import { Alert, Button, Chips, Empty, Field, Input, Loading, Modal, PageHeader, Select, cx, useLoad } from '../../components/ui.jsx';

const KINDS = [
  { value: 'sheet', label: 'Lecture sheet / PDF' },
  { value: 'video', label: 'Class video' },
  { value: 'link', label: 'Other link' },
];
const KIND_LABEL = { sheet: 'Sheet', video: 'Video', link: 'Link' };

function MaterialForm({ initial, programs, onSaved, onCancel }) {
  const [form, setForm] = useState(
    initial
      ? { ...initial, program: initial.program._id, batches: initial.batches.map((b) => b._id) }
      : { title: '', kind: 'sheet', url: '', note: '', chapter: '', program: programs[0]?._id || '', batches: [] },
  );
  const batches = useBatches(form.program ? `?program=${form.program}&active=true` : '?active=true');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const options = (batches.data || []).filter((b) => (b.program?._id || b.program) === form.program).map((b) => ({ value: b._id, label: b.name }));

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          const body = { title: form.title, kind: form.kind, url: form.url, note: form.note, chapter: form.chapter, program: form.program, batches: form.batches };
          if (initial) await patch(`/materials/${initial._id}`, body);
          else await post('/materials', body);
          onSaved();
        } catch (err) {
          setError(err.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Title">
        <Input value={form.title} onChange={set('title')} placeholder="Chapter 3: Cell division, lecture sheet" required />
      </Field>
      <div>
        <p className="mb-1 text-sm font-semibold">Type</p>
        <Chips options={KINDS} value={form.kind} onChange={(kind) => setForm({ ...form, kind })} />
      </div>
      <Field label="Link" hint="Google Drive: Share → Anyone with the link → Copy link. YouTube: use an Unlisted video.">
        <Input type="url" value={form.url} onChange={set('url')} placeholder="https://drive.google.com/..." required />
      </Field>
      <Field label="Program">
        <Select value={form.program} onChange={(e) => setForm({ ...form, program: e.target.value, batches: [] })}>
          {programs.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <div>
        <p className="mb-1 text-sm font-semibold">Batches</p>
        {options.length ? (
          <Chips multiple options={options} value={form.batches} onChange={(b) => setForm({ ...form, batches: b })} />
        ) : (
          <p className="text-sm text-ink-soft">No active batches in this program.</p>
        )}
        <p className="mt-1 text-sm text-ink-soft">{form.batches.length ? 'Only these batches see it.' : 'Nothing picked: every batch of the program sees it.'}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Chapter (optional)">
          <Input value={form.chapter} onChange={set('chapter')} />
        </Field>
        <Field label="Note (optional)">
          <Input value={form.note} onChange={set('note')} />
        </Field>
      </div>
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

export default function Materials() {
  const programs = usePrograms();
  const [program, setProgram] = useState('');
  const state = useLoad(() => get(`/materials${program ? `?program=${program}` : ''}`), [program]);
  const [editing, setEditing] = useState(null);

  return (
    <>
      <PageHeader
        title="Lecture sheets and classes"
        subtitle="Share Google Drive / YouTube links. Students see them in the portal under “Notes”."
        action={<Button onClick={() => setEditing('new')}>Add</Button>}
      />
      <div className="mb-4 max-w-xs">
        <Select value={program} onChange={(e) => setProgram(e.target.value)} aria-label="Program">
          <option value="">All programs</option>
          {programs.data?.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>
      <Loading state={state}>
        {(list) =>
          list.length === 0 ? (
            <Empty title="Nothing shared yet">Add a lecture sheet, a class note or a recorded class.</Empty>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
              {list.map((m) => (
                <li key={m._id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      <span className={cx('mr-2 rounded px-1.5 py-0.5 text-xs', m.kind === 'video' ? 'bg-[#e4e9f6]' : 'bg-helix-tint text-helix-dark')}>{KIND_LABEL[m.kind]}</span>
                      <a href={m.url} target="_blank" rel="noreferrer" className="hover:underline">
                        {m.title}
                      </a>
                    </p>
                    <p className="text-sm text-ink-soft">
                      {[m.program?.name, m.batches.length ? m.batches.map((b) => b.name).join(', ') : 'all batches', m.chapter, formatDate(m.createdAt)].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" onClick={() => setEditing(m)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        if (!window.confirm(`Remove "${m.title}"?`)) return;
                        await del(`/materials/${m._id}`);
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
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add lecture sheet or class' : 'Edit'}>
        {editing && programs.data && (
          <MaterialForm
            key={editing === 'new' ? 'new' : editing._id}
            initial={editing === 'new' ? null : editing}
            programs={programs.data}
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
