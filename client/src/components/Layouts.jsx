import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../lib/auth.jsx';
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
};

export function Icon({ name, className }) {
  return (
    <svg viewBox="0 0 24 24" className={cx('size-5 shrink-0', className)} fill="none" stroke="currentColor" strokeWidth={name === 'more' ? 3 : 1.8} strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      <path d={icons[name]} />
    </svg>
  );
}

export const adminNav = [
  { to: '/admin', label: 'Home', icon: 'home', end: true },
  { to: '/admin/students', label: 'Students', icon: 'students' },
  { to: '/admin/attendance', label: 'Attendance', icon: 'attendance' },
  { to: '/admin/exams', label: 'Exams', icon: 'exams' },
  { to: '/admin/fees', label: 'Fees', icon: 'fees' },
  { to: '/admin/notices', label: 'Notices', icon: 'notices' },
  { to: '/admin/calendar', label: 'Calendar', icon: 'calendar' },
  { to: '/admin/batches', label: 'Batches', icon: 'batches' },
];

// Phone bottom bar: the four things done daily, everything else under More
const mobileTabs = [...adminNav.slice(0, 4), { to: '/admin/more', label: 'More', icon: 'more' }];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const signOut = async () => {
    await logout('/admin/login');
  };

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col bg-ink px-4 py-6 text-white lg:flex print:hidden">
        <Logo light className="px-2" />
        <nav className="mt-8 space-y-1">
          {adminNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cx('flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium', isActive ? 'bg-white/12 text-white' : 'text-white/70 hover:text-white')
              }
            >
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-white/15 pt-4 text-sm">
          <p className="px-3 font-semibold">{user?.name}</p>
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
  const links = [...adminNav.slice(4), { to: '/admin/password', label: 'Change password', icon: 'logout' }];
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
  { to: '/portal', label: 'Results', icon: 'results', end: true },
  { to: '/portal/attendance', label: 'Attendance', icon: 'attendance' },
  { to: '/portal/schedule', label: 'Routine', icon: 'calendar' },
  { to: '/portal/fees', label: 'Fees', icon: 'fees' },
];

export function PortalLayout() {
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
            {showTabs && (
              <NavLink to="/portal/password" className="rounded-md px-2 py-2 text-white/80 hover:text-white">
                Password
              </NavLink>
            )}
            <button
              onClick={async () => {
                await logout('/login');
              }}
              className="rounded-md px-2 py-2 text-white/80 hover:text-white"
            >
              Log out
            </button>
          </div>
        </div>
        {showTabs && (
          <nav className="mx-auto grid max-w-3xl grid-cols-4 px-2">
            {portalTabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  cx(
                    'flex items-center justify-center gap-1.5 border-b-[3px] py-2.5 text-sm font-semibold',
                    isActive ? 'border-[#5cc7bd] text-white' : 'border-transparent text-white/65 hover:text-white',
                  )
                }
              >
                <Icon name={t.icon} className="hidden size-4 sm:block" />
                {t.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-12 pt-6">
        <Outlet />
      </main>
    </div>
  );
}
