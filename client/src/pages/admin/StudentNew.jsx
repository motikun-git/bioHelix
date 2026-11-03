import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { post, upload } from '../../lib/api.js';
import { useBatches } from '../../lib/data.js';
import { downloadCsv } from '../../lib/format.js';
import { Alert, Button, CredentialCard, Empty, Field, Input, Loading, PageHeader, Panel, Select } from '../../components/ui.jsx';

export const studentFields = [
  { key: 'name', label: 'Full name', required: true, autoComplete: 'off' },
  { key: 'phone', label: 'Student phone', type: 'tel', inputMode: 'tel', hint: '01XXXXXXXXX' },
  { key: 'guardianName', label: 'Guardian name' },
  { key: 'guardianPhone', label: 'Guardian phone', type: 'tel', inputMode: 'tel', hint: 'Result and absence SMS will go here later' },
  { key: 'college', label: 'College' },
];

export default function StudentNew() {
  const batches = useBatches('?active=true');
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', phone: '', guardianName: '', guardianPhone: '', college: '', batch: '' });
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await post('/students', { ...form, batch: form.batch || batches.data[0]?._id });
      let photoError = '';
      if (photo) {
        const fd = new FormData();
        fd.append('photo', photo);
        await upload(`/students/${res.student._id}/photo`, fd).catch((err) => {
          photoError = err.message;
        });
      }
      setCreated({ ...res, photoError });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <div className="mx-auto max-w-md">
        <Panel title={`${created.student.name} added`}>
          <CredentialCard studentId={created.student.studentId} password={created.tempPassword} name={created.student.name} />
          {created.photoError && <Alert tone="warn" className="mt-4">Student saved, but the photo did not upload: {created.photoError}</Alert>}
          <div className="mt-6 flex flex-wrap gap-2">
            <Button
              onClick={() => {
                setCreated(null);
                setPhoto(null);
                setForm({ ...form, name: '', phone: '', guardianName: '', guardianPhone: '', college: '' });
              }}
            >
              Add another to this batch
            </Button>
            <Button variant="secondary" onClick={() => navigate(`/admin/students/${created.student._id}`)}>
              Open profile
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Add student" subtitle="The Student ID and a temporary password are created automatically." />
      <Loading state={batches}>
        {(list) =>
          list.length === 0 ? (
            <Empty title="Create a batch first" action={<Link to="/admin/batches" className="font-semibold text-helix-dark underline">Go to batches</Link>}>
              Every student must belong to a running batch.
            </Empty>
          ) : (
            <form onSubmit={submit} className="space-y-4 rounded-xl border border-line bg-white p-4">
              <Field label="Batch">
                <Select value={form.batch || list[0]._id} onChange={(e) => setForm({ ...form, batch: e.target.value })}>
                  {list.map((b) => (
                    <option key={b._id} value={b._id}>
                      {b.name} ({b.program?.name})
                    </option>
                  ))}
                </Select>
              </Field>
              {studentFields.map(({ key, label, hint, ...rest }) => (
                <Field key={key} label={label} hint={hint}>
                  <Input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} {...rest} />
                </Field>
              ))}
              <Field label="Photo" hint="Optional. A clear face photo; it is resized automatically.">
                <input type="file" accept="image/*" capture="user" onChange={(e) => setPhoto(e.target.files[0] || null)} className="block w-full text-sm file:mr-3 file:min-h-10 file:rounded-lg file:border-0 file:bg-helix-tint file:px-4 file:font-semibold file:text-helix-dark" />
              </Field>
              <Alert>{error}</Alert>
              <Button type="submit" loading={busy} className="w-full sm:w-auto">
                Add student
              </Button>
            </form>
          )
        }
      </Loading>
    </div>
  );
}

export function StudentImport() {
  const batches = useBatches('?active=true');
  const [batch, setBatch] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const fd = new FormData();
    fd.append('batch', batch || batches.data[0]?._id);
    fd.append('file', file);
    try {
      setResult(await upload('/students/import', fd));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const downloadLogins = () =>
    downloadCsv('biohelix-student-logins.csv', [
      ['Student ID', 'Name', 'Phone', 'Temporary password'],
      ...result.created.map((s) => [s.studentId, s.name, s.phone, s.tempPassword]),
    ]);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Import students" subtitle="Add a whole batch at once from a CSV file." />
      {result ? (
        <Panel title={`${result.created.length} students added`}>
          <Alert tone="warn" className="mb-4">
            Download the login sheet now. Temporary passwords are not shown again (you can reset any student later).
          </Alert>
          <Button onClick={downloadLogins} disabled={!result.created.length}>
            Download login sheet
          </Button>
          {result.errors.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 font-semibold">{result.errors.length} rows skipped</h3>
              <ul className="space-y-1 text-sm">
                {result.errors.map((err) => (
                  <li key={err.row} className="rounded-md bg-fail-tint px-3 py-2 text-fail">
                    Row {err.row} ({err.name}): {err.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Button variant="secondary" className="mt-6" onClick={() => setResult(null)}>
            Import another file
          </Button>
        </Panel>
      ) : (
        <Loading state={batches}>
          {(list) => (
            <form onSubmit={submit} className="space-y-4 rounded-xl border border-line bg-white p-4">
              <div className="rounded-lg bg-paper p-3 text-sm">
                <p className="font-semibold">CSV columns</p>
                <p className="text-ink-soft">
                  First row must be headers. Only <b>name</b> is required; also read: phone, guardianName, guardianPhone, college, session. In Google Sheets or Excel, use File, Download, CSV.
                </p>
              </div>
              <Field label="Put everyone in batch">
                <Select value={batch || list[0]?._id || ''} onChange={(e) => setBatch(e.target.value)} required>
                  {list.map((b) => (
                    <option key={b._id} value={b._id}>
                      {b.name} ({b.program?.name})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="CSV file">
                <input type="file" accept=".csv,text/csv" required onChange={(e) => setFile(e.target.files[0] || null)} className="block w-full text-sm file:mr-3 file:min-h-10 file:rounded-lg file:border-0 file:bg-helix-tint file:px-4 file:font-semibold file:text-helix-dark" />
              </Field>
              <Alert>{error}</Alert>
              <Button type="submit" loading={busy} disabled={!file || !list.length}>
                Import students
              </Button>
            </form>
          )}
        </Loading>
      )}
    </div>
  );
}
