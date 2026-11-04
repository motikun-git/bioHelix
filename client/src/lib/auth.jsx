import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { get, post } from './api.js';
import { Spinner } from '../components/ui.jsx';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = still checking

  const refresh = useCallback(async () => {
    try {
      setUser(await get('/auth/session'));
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onExpired = () => setUser(null);
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, [refresh]);

  /**
   * Log out and land on the login page with a clean history.
   * Every page visited while logged in sits in the browser's Back history, so we
   * jump back to this tab's first BioHelix page and replace it with the login page
   * (a full reload, which also wipes any data kept in memory). After that, Back
   * leaves the site in one press instead of bouncing through private pages.
   */
  const logout = useCallback(async (to = '/login') => {
    setUser(undefined); // private pages show a spinner instead of data from now on
    await post('/auth/logout').catch(() => {});
    const idx = window.history.state?.idx ?? 0; // React Router's position in this tab's history
    if (idx > 0) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 800);
        window.addEventListener(
          'popstate',
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
        window.history.go(-idx);
      });
    }
    window.location.replace(to);
  }, []);

  return <AuthContext.Provider value={{ user, setUser, refresh, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

const STAFF = ['admin', 'teacher'];

/** True when the logged-in staff member is an admin (not a teacher). */
export function useIsAdmin() {
  return useAuth().user?.role === 'admin';
}

/**
 * Wrap routes that need a login. role: 'student', 'staff' (admins and teachers)
 * or 'admin' (admins only; teachers are sent to the dashboard).
 */
export function RequireRole({ role, children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (user === undefined) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner />
      </div>
    );
  }
  const isStaffRoute = role !== 'student';
  const allowed = role === 'student' ? user?.role === 'student' : role === 'staff' ? STAFF.includes(user?.role) : user?.role === 'admin';
  if (!user || (isStaffRoute && !STAFF.includes(user.role)) || (!isStaffRoute && user.role !== 'student')) {
    return <Navigate to={isStaffRoute ? '/admin/login' : '/login'} replace state={{ from: location.pathname }} />;
  }
  if (!allowed) return <Navigate to="/admin" replace />;
  const passwordPage = isStaffRoute ? '/admin/password' : '/portal/password';
  if (user.mustChangePassword && location.pathname !== passwordPage) {
    return <Navigate to={passwordPage} replace />;
  }
  return children;
}
