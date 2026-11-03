import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { patch, post } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { FullLogo } from '../components/Logo.jsx';
import { Alert, Button, Field, Input, Panel } from '../components/ui.jsx';

function AuthShell({ title, children, footer }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-ink px-4 py-10">
      <div className="w-full max-w-sm">
        <Link to="/" className="mx-auto mb-6 block w-40" aria-label="BioHelix home">
          <FullLogo className="w-full" />
        </Link>
        <div className="rounded-2xl bg-white p-6 shadow-xl">
          <h1 className="mb-5 text-2xl font-bold">{title}</h1>
          {children}
        </div>
        {footer && <p className="mt-6 text-center text-sm text-white/70">{footer}</p>}
      </div>
    </div>
  );
}

export function StudentLogin() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ studentId: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user?.role === 'student') return <Navigate to="/portal" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const me = await post('/auth/student/login', form);
      setUser(me);
      navigate(me.mustChangePassword ? '/portal/password' : '/portal', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Student login"
      footer={
        <>
          Guardians can log in with the student&apos;s ID and password. Forgot your password? Ask BioHelix to reset it.
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Student ID" hint="Example: BH-H26-0042">
          <Input
            value={form.studentId}
            onChange={(e) => setForm({ ...form, studentId: e.target.value })}
            autoComplete="username"
            autoCapitalize="characters"
            required
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            autoComplete="current-password"
            required
          />
        </Field>
        <Alert>{error}</Alert>
        <Button type="submit" loading={busy} className="w-full">
          Log in
        </Button>
      </form>
    </AuthShell>
  );
}

export function AdminLogin() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user?.role === 'admin') return <Navigate to="/admin" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setUser(await post('/auth/admin/login', form));
      const from = location.state?.from;
      navigate(from?.startsWith('/admin') ? from : '/admin', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Admin login">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="username" required />
        </Field>
        <Field label="Password">
          <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="current-password" required />
        </Field>
        <Alert>{error}</Alert>
        <Button type="submit" loading={busy} className="w-full">
          Log in
        </Button>
      </form>
    </AuthShell>
  );
}

export function ChangePassword() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const firstTime = user?.role === 'student' && user.mustChangePassword;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.newPassword !== form.confirm) return setError('The two new passwords do not match');
    setBusy(true);
    try {
      await patch('/auth/password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      if (firstTime) {
        setUser({ ...user, mustChangePassword: false });
        navigate('/portal', { replace: true });
      } else {
        setDone(true);
        setForm({ currentPassword: '', newPassword: '', confirm: '' });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <Panel title={firstTime ? 'Set your own password' : 'Change password'}>
        {firstTime && (
          <Alert tone="info" className="mb-4">
            Welcome, {user.name}. Before you see your results, replace the temporary password with one only you know.
          </Alert>
        )}
        <form onSubmit={submit} className="space-y-4">
          <Field label={firstTime ? 'Temporary password' : 'Current password'}>
            <Input type="password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} autoComplete="current-password" required />
          </Field>
          <Field label="New password" hint="At least 8 characters">
            <Input type="password" minLength={8} value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} autoComplete="new-password" required />
          </Field>
          <Field label="Type the new password again">
            <Input type="password" minLength={8} value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} autoComplete="new-password" required />
          </Field>
          <Alert>{error}</Alert>
          {done && <Alert tone="success">Password changed.</Alert>}
          <Button type="submit" loading={busy} className="w-full">
            Save password
          </Button>
        </form>
      </Panel>
    </div>
  );
}

export function Home() {
  return (
    <div className="min-h-dvh bg-ink text-white">
      <div className="mx-auto flex min-h-dvh max-w-4xl flex-col px-5 py-8">
        <div className="my-auto grid items-center gap-10 py-10 md:grid-cols-[1fr_20rem]">
          <FullLogo className="w-56 justify-self-start md:order-2 md:w-full" />
          <div>
          <h1 className="max-w-xl text-4xl font-bold leading-tight sm:text-5xl">Biology is easy if you know how much to read.</h1>
          <p className="mt-4 max-w-lg text-lg text-white/75">
            BioHelix students and guardians: log in to see exam results, merit position and class routine.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/login" className="inline-flex min-h-12 items-center rounded-lg bg-[#5cc7bd] px-6 font-bold text-ink hover:bg-white">
              Student login
            </Link>
            <Link to="/admin/login" className="inline-flex min-h-12 items-center rounded-lg px-4 font-semibold text-white/80 hover:text-white">
              Admin
            </Link>
          </div>
          </div>
        </div>
        <p className="text-sm text-white/50">BioHelix Academic and Admission, Dhaka</p>
      </div>
    </div>
  );
}
