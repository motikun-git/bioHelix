import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { get, patch, post } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { LangToggle, useT } from '../lib/i18n.jsx';
import { FullLogo } from '../components/Logo.jsx';
import { Alert, Button, Field, Input, Panel } from '../components/ui.jsx';

function AuthShell({ title, children, footer, lang = true }) {
  const { t } = useT();
  return (
    <div className="grid min-h-dvh place-items-center bg-ink px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-4 flex items-center justify-between">
          <Link to="/" className="text-sm font-semibold text-white/70 hover:text-white">
            ← {t('login.back')}
          </Link>
          {lang && <LangToggle />}
        </div>
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
  const { t } = useT();
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
      title={t('login.title')}
      footer={t('login.guardian')}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('login.id')} hint={t('login.idHint')}>
          <Input
            value={form.studentId}
            onChange={(e) => setForm({ ...form, studentId: e.target.value })}
            autoComplete="username"
            autoCapitalize="characters"
            required
          />
        </Field>
        <Field label={t('login.password')}>
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
          {t('login.submit')}
        </Button>
        <Link to="/forgot" className="block text-center text-sm font-semibold text-helix-dark hover:underline">
          {t('login.forgot')}
        </Link>
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

  if (user?.role === 'admin' || user?.role === 'teacher') return <Navigate to="/admin" replace />;

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
    <AuthShell title="Admin login" lang={false}>
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
  const { t } = useT();
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const firstTime = Boolean(user?.mustChangePassword);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.newPassword !== form.confirm) return setError(t('pw.mismatch'));
    setBusy(true);
    try {
      await patch('/auth/password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      if (firstTime) {
        setUser({ ...user, mustChangePassword: false });
        navigate(user.role === 'student' ? '/portal' : '/admin', { replace: true });
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
      <Panel title={firstTime ? t('pw.firstTitle') : t('pw.title')}>
        {firstTime && (
          <Alert tone="info" className="mb-4">
            {user.role === 'student'
              ? t('pw.welcome', { name: user.name })
              : `Welcome, ${user.name}. Replace the temporary password with one only you know.`}
          </Alert>
        )}
        <form onSubmit={submit} className="space-y-4">
          <Field label={firstTime ? t('pw.temp') : t('pw.current')}>
            <Input type="password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} autoComplete="current-password" required />
          </Field>
          <Field label={t('pw.new')} hint={t('pw.newHint')}>
            <Input type="password" minLength={8} value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} autoComplete="new-password" required />
          </Field>
          <Field label={t('pw.again')}>
            <Input type="password" minLength={8} value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} autoComplete="new-password" required />
          </Field>
          <Alert>{error}</Alert>
          {done && <Alert tone="success">{t('pw.saved')}</Alert>}
          <Button type="submit" loading={busy} className="w-full">
            {t('pw.save')}
          </Button>
        </form>
      </Panel>
    </div>
  );
}

/** Student forgot password: 6-digit code by SMS to the student's / guardian's phone. */
export function ForgotPassword() {
  const { t } = useT();
  const status = useLoadOnce(() => get('/auth/student/forgot'));
  const [step, setStep] = useState('id');
  const [form, setForm] = useState({ studentId: '', code: '', newPassword: '' });
  const [sentTo, setSentTo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const run = (fn) => async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const sendCode = run(async () => {
    const res = await post('/auth/student/forgot', { studentId: form.studentId });
    setSentTo(res.phone);
    setStep('code');
  });
  const reset = run(async () => {
    await post('/auth/student/reset', form);
    setStep('done');
  });

  let body;
  if (status === null) body = <p className="text-ink-soft">{t('common.loading')}…</p>;
  else if (!status.available) body = <Alert tone="info">{t('forgot.noSms')}</Alert>;
  else if (step === 'done')
    body = (
      <>
        <Alert tone="success">{t('forgot.done')}</Alert>
        <Link to="/login" className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-helix px-4 font-semibold text-white">
          {t('login.submit')}
        </Link>
      </>
    );
  else if (step === 'id')
    body = (
      <form onSubmit={sendCode} className="space-y-4">
        <p className="text-ink-soft">{t('forgot.lead')}</p>
        <Field label={t('login.id')} hint={t('login.idHint')}>
          <Input value={form.studentId} onChange={set('studentId')} autoCapitalize="characters" autoComplete="username" required />
        </Field>
        <Alert>{error}</Alert>
        <Button type="submit" loading={busy} className="w-full">
          {t('forgot.send')}
        </Button>
      </form>
    );
  else
    body = (
      <form onSubmit={reset} className="space-y-4">
        <Alert tone="info">{t('forgot.sentTo', { phone: sentTo })}</Alert>
        <Field label={t('forgot.code')}>
          <Input value={form.code} onChange={set('code')} inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required />
        </Field>
        <Field label={t('forgot.newPassword')} hint={t('pw.newHint')}>
          <Input type="password" minLength={8} value={form.newPassword} onChange={set('newPassword')} autoComplete="new-password" required />
        </Field>
        <Alert>{error}</Alert>
        <Button type="submit" loading={busy} className="w-full">
          {t('forgot.save')}
        </Button>
      </form>
    );

  return <AuthShell title={t('forgot.title')}>{body}</AuthShell>;
}

function useLoadOnce(fn) {
  const [data, setData] = useState(null);
  useEffect(() => {
    fn()
      .then(setData)
      .catch(() => setData({ available: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return data;
}
