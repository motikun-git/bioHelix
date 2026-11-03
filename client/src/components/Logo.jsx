import { cx } from './ui.jsx';

/** The BioHelix mark (from the official logo) on a light tile, plus the name. */
export function Logo({ light, className }) {
  return (
    <span className={cx('inline-flex items-center gap-2.5', className)}>
      <img src="/logo-mark.png" alt="" width="40" height="40" className="size-10 shrink-0 rounded-lg" />
      <span className={cx('text-lg font-bold leading-none', light ? 'text-white' : 'text-ink')}>
        BioHelix
        <span className={cx('block text-xs font-medium', light ? 'text-white/70' : 'text-ink-soft')}>
          Academic and Admission
        </span>
      </span>
    </span>
  );
}

/** Full logo with wordmark, for the home and login screens. */
export function FullLogo({ className }) {
  return (
    <img
      src="/logo-full.jpg"
      alt="BioHelix Academic and Admission"
      width="486"
      height="412"
      className={cx('h-auto rounded-2xl', className)}
    />
  );
}
