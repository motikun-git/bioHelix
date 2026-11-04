import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../lib/auth.jsx';
import { LangToggle, useT } from '../lib/i18n.jsx';
import { Logo } from './Logo.jsx';
import { cx } from './ui.jsx';

const icons = {
  home: 'M3 10.5L12 3l9 7.5V21h-6v-6H9v6H3z',
  students: 'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21c0-4 3.6-6 8-6s8 2 8 6',
  attendance: 'M4 5h16v15H4zM4 10h16M8 3v4M16 3v4M8.5 15l2 2 4-4',
  exams: 'M6 3h9l4 4v14H6zM9 12h7M9 16h7M9 8h3',
  fees: 'M3 7h18v11H3zM3 11h18M7 15h3',
  notices: 'M4 10v4h3l6 4V6L7 10zM17 9a4 4 0 0 1 0 6',
  calendar: 'M4 5h16v15H4zM4 10h16M8 3v4M16 3v4M8 14h2M12 14h2M16 14h0M8 17h2',
  batches: 'M4 5h16v14H4zM4 10h16M9 5v14',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  results: 'M5 20V10M12 20V4M19 20v-7',
  backup: 'M12 3v12M7 10l5 5 5-5M4 17v3h16v-3',
  team: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3 2.7-5 6-5s6 2 6 5M16 5.5a3 3 0 0 1 0 5.5M18 15c1.8.6 3 2.4 3 5',
  sms: 'M4 5h16v11H9l-5 4zM8 9h8M8 12h5',
  inquiries: 'M4 4h16v16H4zM4 13h5l1 2h4l1-2h5',
  website: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z',
  key: 'M14 4a6 6 0 1 1-4.2 10.2L4 20v-3h3v-3h3l.8-.8A6 6 0 0 1 14 4z',
  materials: 'M4 5c3-1 5-1 8 1 3-2 5-2 8-1v14c-3-1-5-1-8 1-3-2-5-2-8-1zM12 6v14',
  accounts: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
};

export function Icon({ name, className }) {
  return (
    <svg viewBox="0 0 24 24" className={cx('size-5 shrink-0', className)} fill="none" stroke="currentColor" strokeWidth={name === 'more' ? 3 : 1.8} strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      <path d={icons[name]} />
    </svg>
  );
}

// adminOnly items are hidden from teachers (the server blocks them too)
export const adminNav = [
  { to: '/admin', label: 'Home', icon: 'home', end: true },
  { to: '/admin/students', label: 'Students', icon: 'students' },
  { to: '/admin/attendance', label: 'Attendance', icon: 'attendance' },
  { to: '/admin/exams', label: 'Exams', icon: 'exams' },
  { to: '/admin/fees', label: 'Fees', icon: 'fees', adminOnly: true },
  { to: '/admin/notices', label: 'Notices', icon: 'notices' },
  { to: '/admin/calendar', label: 'Calendar', icon: 'calendar' },
  { to: '/admin/batches', label: 'Batches', icon: 'batches' },
  { to: '/admin/materials', label: 'Lecture sheets', icon: 'materials' },
  { to: '/admin/accounts', label: 'Accounts', icon: 'accounts', adminOnly: true },
  { to: '/admin/sms', label: 'SMS', icon: 'sms', adminOnly: true },
  { to: '/admin/inquiries', label: 'Admission inquiries', icon: 'inquiries', adminOnly: true },
  { to: '/admin/website', label: 'Public website', icon: 'website', adminOnly: true },
  { to: '/admin/team', label: 'Team', icon: 'team', adminOnly: true },
  { to: '/admin/backup', label: 'Backup', icon: 'backup', adminOnly: true },
];

function useNav() {
  const { user } = useAuth();
  return adminNav.filter((item) => !item.adminOnly || user?.role === 'admin');
}

// Phone bottom bar: the four things done daily, everything else under More
const mobileTabs = [...adminNav.slice(0, 4), { to: '/admin/more', label: 'More', icon: 'more' }];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const nav = useNav();
  const signOut = async () => {
    await logout('/admin/login');
  };

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col bg-ink px-4 py-6 text-white lg:flex print:hidden">
        <Logo light className="px-2" />
        <nav className="mt-6 space-y-0.5 overflow-y-auto">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cx('flex items-center gap-3 rounded-lg px-3 py-2 font-medium', isActive ? 'bg-white/12 text-white' : 'text-white/70 hover:text-white')
              }
            >
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-white/15 pt-4 text-sm">
          <p className="px-3 font-semibold">
            {user?.name} {user?.role === 'teacher' && <span className="font-normal text-white/60">(teacher)</span>}
          </p>
          <NavLink to="/admin/password" className="block px-3 py-1 text-white/70 hover:text-white">
            Change password
          </NavLink>
          <button onClick={signOut} className="flex items-center gap-2 px-3 py-1 text-white/70 hover:text-white">
            Log out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-10 flex items-center justify-between bg-ink px-4 py-2.5 lg:hidden print:hidden">
        <Logo light />
        <button onClick={signOut} className="rounded-md p-2 text-white/80" aria-label="Log out">
          <Icon name="logout" />
        </button>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-5 sm:px-6 lg:pb-10 lg:pt-8 print:p-0">
        <Outlet />
      </main>

      {/* Mobile bottom tabs: thumb-friendly for admins using a phone */}
      <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden">
        {mobileTabs.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cx('flex flex-col items-center gap-0.5 py-2 text-[0.7rem] font-semibold', isActive ? 'text-helix' : 'text-ink-soft')
            }
          >
            <Icon name={item.icon} className="size-6" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/** Phone "More" screen: the admin pages that don't fit in the bottom bar. */
export function AdminMore() {
  const { user, logout } = useAuth();
  const links = [...useNav().slice(4), { to: '/admin/password', label: 'Change password', icon: 'key' }];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">More</h1>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
        {links.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} className="flex items-center gap-3 px-4 py-4 font-semibold hover:bg-paper">
              <Icon name={item.icon} className="text-helix" />
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
      <p className="text-sm text-ink-soft">Logged in as {user?.name}</p>
      <button
        onClick={async () => {
          await logout('/admin/login');
        }}
        className="font-semibold text-fail"
      >
        Log out
      </button>
    </div>
  );
}

const portalTabs = [
  { to: '/portal', label: 'portal.results', icon: 'results', end: true },
  { to: '/portal/exams', label: 'portal.exams', icon: 'exams' },
  { to: '/portal/materials', label: 'portal.materials', icon: 'notices' },
  { to: '/portal/attendance', label: 'portal.attendance', icon: 'attendance' },
  { to: '/portal/schedule', label: 'portal.routine', icon: 'calendar' },
  { to: '/portal/fees', label: 'portal.fees', icon: 'fees' },
];

export function PortalLayout() {
  const { t } = useT();
  const { user, logout } = useAuth();
  const showTabs = !user?.mustChangePassword;
  return (
    <div className="min-h-dvh">
      <header className="bg-ink">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-2.5">
          <NavLink to="/portal">
            <Logo light />
          </NavLink>
          <div className="flex items-center gap-1 text-sm">
            <LangToggle />
            {showTabs && (
              <NavLink to="/portal/password" className="hidden rounded-md px-2 py-2 text-white/80 hover:text-white sm:block">
                {t('portal.password')}
              </NavLink>
            )}
            <button
              onClick={async () => {
                await logout('/login');
              }}
              className="rounded-md px-2 py-2 text-white/80 hover:text-white"
            >
              {t('portal.logout')}
            </button>
          </div>
        </div>
        {showTabs && (
          <nav className="mx-auto flex max-w-3xl overflow-x-auto px-2 [scrollbar-width:none]">
            {portalTabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  cx(
                    'flex shrink-0 grow items-center justify-center gap-1.5 whitespace-nowrap border-b-[3px] px-3 py-2.5 text-sm font-semibold',
                    isActive ? 'border-[#5cc7bd] text-white' : 'border-transparent text-white/65 hover:text-white',
                  )
                }
              >
                <Icon name={tab.icon} className="hidden size-4 sm:block" />
                {t(tab.label)}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-12 pt-6">
        <Outlet />
        {showTabs && (
          <NavLink to="/portal/password" className="mt-10 block text-center text-sm font-semibold text-helix-dark sm:hidden">
            {t('pw.title')}
          </NavLink>
        )}
      </main>
    </div>
  );
}
