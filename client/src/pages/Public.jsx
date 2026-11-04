import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { get, post } from '../lib/api.js';
import { LangToggle, bnDigits, useT } from '../lib/i18n.jsx';
import { formatTime, taka } from '../lib/format.js';
import { DAYS } from '../lib/data.js';
import { FullLogo, Logo } from '../components/Logo.jsx';
import { Alert, Button, Field, Input, Select, Spinner, Textarea, cx, useLoad } from '../components/ui.jsx';

/** Site info, programs and achievements, loaded once for all public pages. */
let siteCache = null;
export function useSite() {
  return useLoad(() => (siteCache ? Promise.resolve(siteCache) : get('/public/site').then((d) => (siteCache = d))));
}

function waLink(number) {
  const digits = String(number || '').replace(/\D/g, '');
  if (!digits) return '';
  return `https://wa.me/${digits.startsWith('880') ? digits : `88${digits}`}`;
}

export function PublicLayout() {
  const { t } = useT();
  const { pathname, hash } = useLocation();

  // Scroll to #programs etc. after navigating to the home page
  useEffect(() => {
    // Newer Chrome returns a Promise from scrollTo; an effect must not return it
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    const el = document.getElementById(hash.slice(1));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [pathname, hash]);

  const links = [
    ['/#programs', t('nav.programs')],
    ['/#results', t('nav.results')],
    ['/admission', t('nav.admission')],
    ['/#contact', t('nav.contact')],
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 bg-ink/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
          <Link to="/" aria-label="BioHelix home">
            <Logo light />
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {links.map(([to, label]) => (
              <Link key={to} to={to} className="rounded-md px-3 py-2 text-sm font-semibold text-white/75 hover:text-white">
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <LangToggle />
            <Link to="/login" className="hidden rounded-lg bg-[#5cc7bd] px-3 py-2 text-sm font-bold text-ink hover:bg-white sm:inline-flex">
              {t('nav.login')}
            </Link>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden">
          {links.map(([to, label]) => (
            <Link key={to} to={to} className="shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold text-white/75">
              {label}
            </Link>
          ))}
          <Link to="/login" className="shrink-0 rounded-md bg-[#5cc7bd] px-3 py-1.5 text-sm font-bold text-ink sm:hidden">
            {t('nav.login')}
          </Link>
        </nav>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

function Footer() {
  const { t } = useT();
  const site = useSite();
  return (
    <footer className="bg-ink text-white/70">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm">
        <p>
          {t('home.footer')}
          {site.data?.site.address && `, ${site.data.site.address}`}
        </p>
        <NavLink to="/admin/login" className="hover:text-white">
          {t('nav.admin')}
        </NavLink>
      </div>
    </footer>
  );
}

function Section({ id, title, lead, children, tone = 'white' }) {
  return (
    <section id={id} className={cx('scroll-mt-28 py-14', tone === 'white' ? 'bg-white' : 'bg-paper')}>
      <div className="mx-auto max-w-5xl px-4">
        <h2 className="text-2xl font-bold sm:text-3xl">{title}</h2>
        {lead && <p className="mt-2 max-w-2xl text-ink-soft">{lead}</p>}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

function BatchCard({ batch }) {
  const { t, locale, lang } = useT();
  const num = (n) => (lang === 'bn' ? bnDigits(n) : n);
  return (
    <li className="flex flex-col rounded-xl border border-line bg-white p-4">
      <p className="text-lg font-semibold">{batch.name}</p>
      {batch.session && <p className="text-sm text-ink-soft">{batch.session}</p>}
      <div className="mt-3 grid grid-cols-7 gap-1 text-center" aria-label="Class days">
        {DAYS.map((d) => {
          const on = batch.days.includes(d);
          return (
            <span key={d} className={cx('rounded-md border py-1 text-xs font-semibold', on ? 'border-pass/30 bg-pass-tint text-pass' : 'border-transparent bg-paper text-ink-soft/50')}>
              {t(`days.${d}`)}
            </span>
          );
        })}
      </div>
      {batch.startTime && (
        <p className="mt-2 text-sm">
          {formatTime(batch.startTime, locale)}
          {batch.endTime && ` – ${formatTime(batch.endTime, locale)}`}
        </p>
      )}
      <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-4">
        <p className="text-sm">
          {batch.monthlyFee > 0 && <span className="block font-semibold">{t('home.monthlyFee', { amount: num(taka(batch.monthlyFee)) })}</span>}
          {batch.admissionFee > 0 && <span className="block text-ink-soft">{t('home.admissionFee', { amount: num(taka(batch.admissionFee)) })}</span>}
        </p>
        {batch.seatsLeft !== null && (
          <span className={cx('rounded-full px-2.5 py-0.5 text-xs font-semibold', batch.seatsLeft > 0 ? 'bg-helix-tint text-helix-dark' : 'bg-fail-tint text-fail')}>
            {batch.seatsLeft > 0 ? t('home.seatsLeft', { n: num(batch.seatsLeft) }) : t('home.full')}
          </span>
        )}
      </div>
    </li>
  );
}

export function PublicHome() {
  const { t } = useT();
  const state = useSite();
  if (!state.data) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner />
      </div>
    );
  }
  const { site, programs, achievements } = state.data;
  const wa = waLink(site.whatsapp);
  const anyBatch = programs.some((p) => p.batches.length);

  return (
    <>
      <section className="bg-ink text-white">
        <div className="mx-auto grid max-w-5xl items-center gap-10 px-4 py-14 md:grid-cols-[1fr_18rem] md:py-20">
          <div>
            <h1 className="max-w-xl text-4xl font-bold leading-tight sm:text-5xl">{site.tagline}</h1>
            <p className="mt-4 max-w-lg text-lg text-white/75">{t('home.lead')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              {site.admissionOpen && (
                <Link to="/admission" className="inline-flex min-h-12 items-center rounded-lg bg-[#5cc7bd] px-6 font-bold text-ink hover:bg-white">
                  {t('home.apply')}
                </Link>
              )}
              <Link to="/login" className="inline-flex min-h-12 items-center rounded-lg border border-white/30 px-5 font-semibold text-white hover:bg-white/10">
                {t('home.portal')}
              </Link>
            </div>
            {site.admissionNote && <p className="mt-4 text-sm font-semibold text-[#5cc7bd]">{site.admissionNote}</p>}
          </div>
          <FullLogo className="w-48 md:order-none md:w-full" />
        </div>
      </section>

      <Section title={t('home.aboutTitle')}>
        <p className="max-w-3xl whitespace-pre-line text-lg leading-relaxed">{site.about}</p>
      </Section>

      <Section id="programs" title={t('home.programsTitle')} lead={t('home.programsLead')} tone="paper">
        {!anyBatch ? (
          <p className="text-ink-soft">{t('home.noBatches')}</p>
        ) : (
          <div className="space-y-10">
            {programs
              .filter((p) => p.batches.length)
              .map((p) => (
                <div key={p._id}>
                  <h3 className="mb-3 text-xl font-semibold">{p.name}</h3>
                  <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {p.batches.map((b) => (
                      <BatchCard key={b.name} batch={b} />
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        )}
      </Section>

      {achievements.length > 0 && (
        <Section id="results" title={t('home.resultsTitle')}>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {achievements.map((a) => (
              <li key={a._id} className="rounded-xl border border-line bg-paper p-5">
                <p className="text-xl font-bold leading-snug text-helix-dark">{a.result}</p>
                <p className="mt-2 font-semibold">{a.name}</p>
                {a.year && <p className="text-sm text-ink-soft">{a.year}</p>}
                {a.quote && <blockquote className="mt-3 border-l-2 border-helix pl-3 text-ink-soft">{a.quote}</blockquote>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section id="contact" title={t('home.contactTitle')} tone={achievements.length ? 'paper' : 'white'}>
        <div className="grid gap-6 md:grid-cols-2">
          <ul className="space-y-3 text-lg">
            {site.phone && (
              <li>
                <a href={`tel:${site.phone.replace(/\s/g, '')}`} className="font-semibold text-helix-dark underline-offset-4 hover:underline">
                  {t('home.call')}: {site.phone}
                </a>
              </li>
            )}
            {wa && (
              <li>
                <a href={wa} target="_blank" rel="noreferrer" className="font-semibold text-helix-dark underline-offset-4 hover:underline">
                  {t('home.whatsapp')}: {site.whatsapp}
                </a>
              </li>
            )}
            {site.email && (
              <li>
                <a href={`mailto:${site.email}`} className="font-semibold text-helix-dark underline-offset-4 hover:underline">
                  {t('home.email')}: {site.email}
                </a>
              </li>
            )}
            {site.facebook && (
              <li>
                <a href={site.facebook} target="_blank" rel="noreferrer" className="font-semibold text-helix-dark underline-offset-4 hover:underline">
                  {t('home.facebook')}
                </a>
              </li>
            )}
          </ul>
          <div>
            <p className="whitespace-pre-line text-lg">{site.address}</p>
            {site.mapUrl && (
              <a href={site.mapUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block font-semibold text-helix-dark underline-offset-4 hover:underline">
                {t('home.map')}
              </a>
            )}
          </div>
        </div>
      </Section>
    </>
  );
}

export function AdmissionPage() {
  const { t } = useT();
  const state = useSite();
  const blank = { name: '', phone: '', guardianPhone: '', program: '', college: '', message: '', website: '' };
  const [form, setForm] = useState(blank);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { program, ...rest } = form;
      await post('/public/inquiries', { ...rest, ...(program && { program }) });
      setSent(true);
      setForm(blank);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-3xl font-bold">{t('adm.title')}</h1>
      <p className="mt-2 text-ink-soft">{t('adm.lead')}</p>
      {state.data && !state.data.site.admissionOpen ? (
        <Alert tone="warn" className="mt-6">
          {t('adm.closed')}
        </Alert>
      ) : sent ? (
        <div className="mt-6 space-y-4">
          <Alert tone="success">{t('adm.sent')}</Alert>
          <Button variant="secondary" onClick={() => setSent(false)}>
            {t('adm.another')}
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4 rounded-xl border border-line bg-white p-4">
          <Field label={t('adm.name')}>
            <Input value={form.name} onChange={set('name')} autoComplete="name" required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('adm.phone')} hint={t('phone.hint')}>
              <Input type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" required />
            </Field>
            <Field label={t('adm.guardianPhone')}>
              <Input type="tel" inputMode="tel" value={form.guardianPhone} onChange={set('guardianPhone')} />
            </Field>
          </div>
          <Field label={t('adm.program')}>
            <Select value={form.program} onChange={set('program')}>
              <option value="">{t('adm.programAny')}</option>
              {state.data?.programs.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('adm.college')}>
            <Input value={form.college} onChange={set('college')} />
          </Field>
          <Field label={t('adm.message')}>
            <Textarea rows={3} value={form.message} onChange={set('message')} />
          </Field>
          {/* Spam trap: hidden from people, bots fill it */}
          <input type="text" name="website" value={form.website} onChange={set('website')} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
          <Alert>{error}</Alert>
          <Button type="submit" loading={busy} className="w-full sm:w-auto">
            {t('adm.send')}
          </Button>
        </form>
      )}
    </div>
  );
}
