import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { get, patch, post, upload } from '../../lib/api.js';
import { useBatches } from '../../lib/data.js';
import { formatDate, num, schedule } from '../../lib/format.js';
import { Alert, Button, CredentialCard, Field, Input, Loading, Modal, Panel, Select, StatusBadge, cx, useLoad } from '../../components/ui.jsx';
import { FeeAccount } from './Fees.jsx';
import { studentFields } from './StudentNew.jsx';
import { Avatar } from './Students.jsx';

function EditForm({ student, onSaved, onCancel }) {
  const batches = useBatches();
  const [form, setForm] = useState({
    name: student.name,
    phone: student.phone,
    guardianName: student.guardianName,
    guardianPhone: student.guardianPhone,
    college: student.college,
    session: student.session,
    batch: student.batch?._id,
    status: student.status,
    monthlyFee: student.monthlyFee ?? '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sameProgram = batches.data?.filter((b) => String(b.program?._id) === String(student.program?._id)) || [];

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await patch(`/students/${student._id}`, form);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {studentFields.map(({ key, label, hint, ...rest }) => (
        <Field key={key} label={label} hint={hint}>
          <Input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} {...rest} />
        </Field>
      ))}
      <Field label="Session">
        <Input value={form.session} onChange={(e) => setForm({ ...form, session: e.target.value })} />
      </Field>
      <Field label="Batch" hint="Students can move between batches of the same program">
        <Select value={form.batch} onChange={(e) => setForm({ ...form, batch: e.target.value })}>
          {sameProgram.map((b) => (
            <option key={b._id} value={b._id}>
              {b.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Own monthly fee (৳)" hint="Leave empty to use the batch fee. Set a lower amount for a scholarship.">
        <Input type="number" min="0" inputMode="numeric" value={form.monthlyFee} onChange={(e) => setForm({ ...form, monthlyFee: e.target.value })} />
      </Field>
      <Field label="Status" hint="Inactive students cannot log in">
        <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          <option value="active">Active</option>
          <option value="inactive">Inactive (left or blocked)</option>
          <option value="completed">Completed the course</option>
        </Select>
      </Field>
      <Alert>{error}</Alert>
      <div className="flex gap-2">
        <Button type="submit" loading={busy}>
          Save changes
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export default function StudentDetail() {
  const { id } = useParams();
  const state = useLoad(() => get(`/students/${id}`), [id]);
  const [editing, setEditing] = useState(false);
  const [credentials, setCredentials] = useState(null);
  const [message, setMessage] = useState({ tone: 'error', text: '' });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const resetPassword = async (student) => {
    if (!window.confirm(`Reset password for ${student.name}? Their old password will stop working.`)) return;
    try {
      const res = await post(`/students/${student._id}/reset-password`);
      setCredentials({ ...res, name: student.name });
    } catch (err) {
      setMessage({ tone: 'error', text: err.message });
    }
  };

  const changePhoto = async (file) => {
    if (!file) return;
    setUploading(true);
    setMessage({ text: '' });
    const fd = new FormData();
    fd.append('photo', file);
    try {
      await upload(`/students/${id}/photo`, fd);
      state.reload();
    } catch (err) {
      setMessage({ tone: 'error', text: err.message });
    } finally {
      setUploading(false);
      fileRef.current.value = '';
    }
  };

  return (
    <Loading state={state}>
      {(s) => (
        <div className="space-y-6">
          <Link to="/admin/students" className="text-sm font-semibold text-helix-dark">
            All students
          </Link>
          <div className="flex flex-wrap items-center gap-4">
            <button type="button" onClick={() => fileRef.current.click()} className="group relative rounded-full" aria-label="Change photo">
              <Avatar url={s.photoUrl} name={s.name} size="size-20" />
              <span className="absolute inset-x-0 bottom-0 rounded-b-full bg-ink/70 py-0.5 text-center text-xs font-semibold text-white">
                {uploading ? 'Uploading' : 'Photo'}
              </span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => changePhoto(e.target.files[0])} />
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold">{s.name}</h1>
              <p className="text-lg font-semibold text-helix-dark">{s.studentId}</p>
              <StatusBadge status={s.status} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button variant="secondary" onClick={() => resetPassword(s)}>
                Reset password
              </Button>
            </div>
          </div>

          <Alert tone={message.tone}>{message.text}</Alert>

          <dl className="grid gap-x-6 gap-y-3 rounded-xl border border-line bg-white p-4 sm:grid-cols-2">
            {[
              ['Program', s.program?.name],
              ['Batch', `${s.batch?.name || ''}${schedule(s.batch) ? ` (${schedule(s.batch)})` : ''}`],
              ['Phone', s.phone],
              ['Guardian', [s.guardianName, s.guardianPhone].filter(Boolean).join(', ')],
              ['College', s.college],
              ['Session', s.session],
              ['Admitted', formatDate(s.admissionDate)],
              ['Logged in yet', s.mustChangePassword ? 'No (still on temporary password)' : 'Yes'],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-ink-soft">{label}</dt>
                <dd className="font-medium">{value || '–'}</dd>
              </div>
            ))}
          </dl>

          <div className="grid gap-4 md:grid-cols-2">
            <Panel
              title="Attendance"
              action={
                <Link to={`/admin/attendance?batch=${s.batch?._id}`} className="text-sm font-semibold text-helix-dark">
                  Batch attendance
                </Link>
              }
            >
              {s.attendance.total === 0 ? (
                <p className="text-ink-soft">No attendance taken yet.</p>
              ) : (
                <>
                  <p className={cx('text-3xl font-bold', s.attendance.percent < 75 && 'text-fail')}>{s.attendance.percent}%</p>
                  <p className="text-sm text-ink-soft">
                    {s.attendance.present} present, {s.attendance.late} late, {s.attendance.absent} absent of {s.attendance.total} classes
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1" aria-label="Last 30 classes">
                    {s.attendance.recent.map((d) => (
                      <span
                        key={d.date}
                        title={`${d.date}: ${d.status}`}
                        className={cx('size-4 rounded-sm', d.status === 'present' ? 'bg-pass' : d.status === 'late' ? 'bg-draft' : 'bg-fail')}
                      />
                    ))}
                  </div>
                </>
              )}
            </Panel>
            <Panel
              title="Fees"
              action={
                <Link to={`/admin/fees?student=${s._id}`} className="text-sm font-semibold text-helix-dark">
                  Collect payment
                </Link>
              }
            >
              <FeeAccount account={s.fees} />
            </Panel>
          </div>

          <section>
            <h2 className="mb-2 text-lg font-semibold">Exam history</h2>
            {s.results.length === 0 ? (
              <p className="text-ink-soft">No exam results yet.</p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
                {s.results.map((r) => (
                  <li key={r._id}>
                    <Link to={`/admin/exams/${r.exam?._id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-paper">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{r.exam?.title}</p>
                        <p className="text-sm text-ink-soft">{formatDate(r.exam?.date)}</p>
                      </div>
                      <p className="shrink-0 text-right font-semibold">
                        {r.isAbsent ? <span className="text-fail">Absent</span> : `${num(r.marks)} / ${r.exam?.totalMarks}`}
                        {r.rank && <span className="block text-sm font-normal text-ink-soft">Rank {r.rank}</span>}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Modal open={editing} onClose={() => setEditing(false)} title="Edit student">
            {editing && (
              <EditForm
                student={s}
                onCancel={() => setEditing(false)}
                onSaved={() => {
                  setEditing(false);
                  state.reload();
                }}
              />
            )}
          </Modal>
          <Modal open={Boolean(credentials)} onClose={() => setCredentials(null)} title="New temporary password">
            {credentials && <CredentialCard studentId={credentials.studentId} password={credentials.tempPassword} name={credentials.name} />}
          </Modal>
        </div>
      )}
    </Loading>
  );
}
