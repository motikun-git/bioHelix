import { useState } from 'react';
import { del, get, patch, post } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { formatDate } from '../../lib/format.js';
import { Alert, Button, Chips, CopyButton, Field, Input, Loading, Modal, PageHeader, cx, useLoad } from '../../components/ui.jsx';

const ROLE_INFO = {
  admin: 'Everything: students, fees, backup, team',
  teacher: 'Attendance, exams, marks, notices, calendar. No fees, backup or editing students.',
};

function StaffLogin({ email, password }) {
  const message = `BioHelix admin panel\n${window.location.origin}/admin/login\nEmail: ${email}\nTemporary password: ${password}\nYou will set your own password after logging in.`;
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg bg-paper p-4">
        <dt className="text-ink-soft">Email</dt>
        <dd className="break-all font-semibold">{email}</dd>
        <dt className="text-ink-soft">Password</dt>
        <dd className="text-lg font-bold tracking-wide">{password}</dd>
      </dl>
      <p className="text-sm text-ink-soft">Shown only once. They choose their own password after the first login.</p>
      <CopyButton text={message} label="Copy login message" />
    </div>
  );
}

function AddStaff({ onDone }) {
  const [form, setForm] = useState({ name: '', email: '', role: 'teacher' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);

  if (created) {
    return (
      <div className="space-y-4">
        <StaffLogin email={created.staff.email} password={created.tempPassword} />
        <Button onClick={onDone}>Done</Button>
      </div>
    );
  }
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          setCreated(await post('/team', form));
        } catch (err) {
          setError(err.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Name">
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      </Field>
      <Field label="Email" hint="They log in with this email">
        <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
      </Field>
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">Access</legend>
        <Chips
          options={[
            { value: 'teacher', label: 'Teacher' },
            { value: 'admin', label: 'Admin' },
          ]}
          value={form.role}
          onChange={(role) => setForm({ ...form, role })}
        />
        <p className="mt-2 text-sm text-ink-soft">{ROLE_INFO[form.role]}</p>
      </fieldset>
      <Alert>{error}</Alert>
      <Button type="submit" loading={busy}>
        Create account
      </Button>
    </form>
  );
}

export default function Team() {
  const { user } = useAuth();
  const team = useLoad(() => get('/team'));
  const [adding, setAdding] = useState(false);
  const [reset, setReset] = useState(null);
  const [error, setError] = useState('');

  const act = async (fn) => {
    setError('');
    try {
      await fn();
      team.reload();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <PageHeader title="Team" subtitle="Who can log in to this admin panel." action={<Button onClick={() => setAdding(true)}>Add person</Button>} />
      <Alert className="mb-4">{error}</Alert>
      <Loading state={team}>
        {(list) => (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
            {list.map((a) => {
              const me = a.email === user?.email;
              return (
                <li key={a._id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {a.name} {me && <span className="text-sm font-normal text-ink-soft">(you)</span>}
                    </p>
                    <p className="break-all text-sm text-ink-soft">{a.email}</p>
                    <p className="text-xs text-ink-soft">
                      {a.mustChangePassword ? 'Has not logged in yet' : a.lastLoginAt ? `Last login ${formatDate(a.lastLoginAt)}` : 'Never logged in'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cx('rounded-full px-2.5 py-0.5 text-xs font-semibold', a.role === 'admin' ? 'bg-ink text-white' : 'bg-helix-tint text-helix-dark')}>
                      {a.role === 'admin' ? 'Admin' : 'Teacher'}
                    </span>
                    {!me && (
                      <>
                        <Button variant="ghost" onClick={() => act(() => patch(`/team/${a._id}`, { role: a.role === 'admin' ? 'teacher' : 'admin' }))}>
                          Make {a.role === 'admin' ? 'teacher' : 'admin'}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() =>
                            window.confirm(`Give ${a.name} a new temporary password?`) &&
                            act(async () => setReset(await post(`/team/${a._id}/reset-password`)))
                          }
                        >
                          Reset password
                        </Button>
                        <Button variant="ghost" onClick={() => window.confirm(`Remove ${a.name}? They will not be able to log in.`) && act(() => del(`/team/${a._id}`))}>
                          Remove
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Loading>
      <dl className="mt-5 space-y-1 text-sm text-ink-soft">
        <div>
          <dt className="inline font-semibold text-ink">Admin: </dt>
          <dd className="inline">{ROLE_INFO.admin}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-ink">Teacher: </dt>
          <dd className="inline">{ROLE_INFO.teacher}</dd>
        </div>
      </dl>
      <Modal open={adding} onClose={() => setAdding(false)} title="Add person">
        {adding && (
          <AddStaff
            onDone={() => {
              setAdding(false);
              team.reload();
            }}
          />
        )}
      </Modal>
      <Modal open={Boolean(reset)} onClose={() => setReset(null)} title="New temporary password">
        {reset && <StaffLogin email={reset.email} password={reset.tempPassword} />}
      </Modal>
    </>
  );
}
