import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { monthLabel, shiftMonth } from '../lib/format.js';

export function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

const buttonStyles = {
  primary: 'bg-helix text-white hover:bg-helix-dark disabled:bg-helix/50',
  secondary: 'bg-white text-ink border border-line hover:border-ink-soft disabled:text-ink-soft',
  ghost: 'text-helix-dark hover:bg-helix-tint',
  danger: 'bg-white text-fail border border-fail/40 hover:bg-fail-tint',
};

export function Button({ variant = 'primary', loading, className, children, disabled, ...props }) {
  return (
    <button
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 font-semibold transition-colors disabled:cursor-not-allowed',
        buttonStyles[variant],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner small />}
      {children}
    </button>
  );
}

/** A link that looks like a button (never nest a <button> inside an <a>). */
export function ButtonLink({ to, variant = 'primary', className, children }) {
  return (
    <Link
      to={to}
      className={cx('inline-flex min-h-11 items-center justify-center rounded-lg px-4 font-semibold transition-colors', buttonStyles[variant], className)}
    >
      {children}
    </Link>
  );
}

export function Spinner({ small }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cx(
        'inline-block animate-spin rounded-full border-2 border-current border-r-transparent',
        small ? 'size-4' : 'size-7 text-helix',
      )}
    />
  );
}

export function Field({ label, hint, error, children, className }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-sm font-semibold">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-sm text-fail">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-sm text-ink-soft">{hint}</span>
      )}
    </label>
  );
}

const inputClass =
  'block w-full min-h-11 rounded-lg border border-line bg-white px-3 text-base text-ink placeholder:text-ink-soft/60 focus:border-helix focus:outline-none focus:ring-2 focus:ring-helix/20';

export function Input({ className, ...props }) {
  return <input className={cx(inputClass, className)} {...props} />;
}

export function Select({ className, children, ...props }) {
  return (
    <select className={cx(inputClass, 'pr-8', className)} {...props}>
      {children}
    </select>
  );
}

export function Alert({ tone = 'error', children, className }) {
  if (!children) return null;
  const tones = {
    error: 'bg-fail-tint text-fail',
    success: 'bg-pass-tint text-pass',
    info: 'bg-helix-tint text-helix-dark',
    warn: 'bg-draft-tint text-draft',
  };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('rounded-lg px-4 py-3 text-sm font-medium', tones[tone], className)}>
      {children}
    </div>
  );
}

export function Panel({ title, action, children, className }) {
  return (
    <section className={cx('rounded-xl border border-line bg-white', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-soft">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const statusTones = {
  draft: 'bg-draft-tint text-draft',
  imported: 'bg-helix-tint text-helix-dark',
  published: 'bg-pass-tint text-pass',
  active: 'bg-pass-tint text-pass',
  inactive: 'bg-fail-tint text-fail',
  completed: 'bg-helix-tint text-helix-dark',
};
const statusLabels = { draft: 'Draft', imported: 'Not published', published: 'Published' };

export function StatusBadge({ status, label }) {
  return (
    <span className={cx('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', statusTones[status])}>
      {label || statusLabels[status] || status[0].toUpperCase() + status.slice(1)}
    </span>
  );
}

export function Empty({ title, children, action }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-white px-6 py-10 text-center">
      <p className="text-lg font-semibold">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-ink-soft">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl bg-white p-0 text-ink shadow-2xl backdrop:bg-ink/50"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button onClick={onClose} className="rounded-md p-2 text-ink-soft hover:bg-paper" aria-label="Close">
          <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      </div>
      <div className="max-h-[75dvh] overflow-y-auto p-5">{children}</div>
    </dialog>
  );
}

export function CopyButton({ text, label = 'Copy' }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="secondary"
      type="button"
      onClick={async () => {
        await navigator.clipboard?.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? 'Copied' : label}
    </Button>
  );
}

/** Shows a new student's login so the admin can hand it over. */
export function CredentialCard({ studentId, password, name }) {
  const message = `BioHelix portal login\nName: ${name}\nStudent ID: ${studentId}\nPassword: ${password}\nPlease change the password after first login.`;
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg bg-paper p-4 text-lg">
        <dt className="text-ink-soft">Student ID</dt>
        <dd className="font-bold">{studentId}</dd>
        <dt className="text-ink-soft">Password</dt>
        <dd className="font-bold tracking-wide">{password}</dd>
      </dl>
      <p className="text-sm text-ink-soft">
        This password is shown only once. Give it to the student now; they will set their own password on first login.
      </p>
      <CopyButton text={message} label="Copy login message" />
    </div>
  );
}

/** Loads data and exposes { data, error, loading, reload }. */
export function useLoad(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    loader()
      .then((data) => alive && setState({ data, error: '', loading: false }))
      .catch((err) => alive && setState({ data: null, error: err.message, loading: false }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}

export function Loading({ state, children }) {
  if (state.loading && !state.data) {
    return (
      <div className="grid place-items-center py-16">
        <Spinner />
      </div>
    );
  }
  if (state.error) return <Alert>{state.error}</Alert>;
  return children(state.data);
}

/** ‹ November 2026 › */
export function MonthPicker({ value, onChange, max }) {
  return (
    <div className="inline-flex items-center rounded-lg border border-line bg-white">
      <button type="button" onClick={() => onChange(shiftMonth(value, -1))} className="min-h-11 px-3 text-lg text-ink-soft hover:text-ink" aria-label="Previous month">
        ‹
      </button>
      <span className="min-w-36 text-center font-semibold">{monthLabel(value)}</span>
      <button
        type="button"
        onClick={() => onChange(shiftMonth(value, 1))}
        disabled={max && value >= max}
        className="min-h-11 px-3 text-lg text-ink-soft hover:text-ink disabled:opacity-30"
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  );
}

/** A row of toggle chips. multiple=false behaves like radio buttons. */
export function Chips({ options, value, onChange, multiple = false }) {
  const selected = multiple ? value : [value];
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            type="button"
            key={o.value}
            aria-pressed={on}
            onClick={() => onChange(multiple ? (on ? value.filter((v) => v !== o.value) : [...value, o.value]) : o.value)}
            className={cx('min-h-10 rounded-lg border px-3 text-sm font-semibold', on ? 'border-helix bg-helix text-white' : 'border-line bg-white text-ink-soft hover:text-ink')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Textarea({ className, ...props }) {
  return (
    <textarea
      className={cx(
        'block w-full rounded-lg border border-line bg-white px-3 py-2 text-base text-ink placeholder:text-ink-soft/60 focus:border-helix focus:outline-none focus:ring-2 focus:ring-helix/20',
        className,
      )}
      {...props}
    />
  );
}

/** Horizontal bar with a percent label, for chapter accuracy etc. */
export function PercentBar({ value, compare, tone }) {
  const color = tone || (value >= 70 ? 'bg-pass' : value >= 40 ? 'bg-draft' : 'bg-fail');
  return (
    <div className="relative h-2.5 rounded-full bg-line" aria-hidden="true">
      <div className={cx('absolute inset-y-0 left-0 rounded-full', color)} style={{ width: `${Math.max(2, value)}%` }} />
      {compare !== undefined && compare !== null && (
        <span className="absolute -top-1 h-[18px] w-0.5 bg-ink" style={{ left: `${compare}%` }} title={`Average ${compare}%`} />
      )}
    </div>
  );
}
