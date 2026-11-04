import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Admin, Student } from '../models/index.js';

const COOKIE = 'bh_token';
const MAX_AGE = { admin: 24 * 60 * 60 * 1000, teacher: 24 * 60 * 60 * 1000, student: 7 * 24 * 60 * 60 * 1000 };

export function setAuthCookie(res, { id, role }) {
  const token = jwt.sign({ sub: String(id), role }, env.jwtSecret, { expiresIn: MAX_AGE[role] / 1000 });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'lax',
    maxAge: MAX_AGE[role],
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE, { httpOnly: true, secure: env.isProd, sameSite: 'lax' });
}

function readToken(req) {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    return { id: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}

/** Any logged-in user (admin or student). */
export function requireLogin(req, res, next) {
  const user = readToken(req);
  if (!user) return res.status(401).json({ message: 'Please log in' });
  req.user = user;
  next();
}

/**
 * Staff (admins and teachers). Looks the account up on every request, so a
 * removed account or a changed role takes effect immediately, and a temporary
 * password must be changed before anything else.
 */
function staffGuard(roles) {
  return async (req, res, next) => {
    const token = readToken(req);
    if (!token) return res.status(401).json({ message: 'Please log in' });
    if (token.role === 'student') return res.status(403).json({ message: 'Staff only' });
    const staff = await Admin.findById(token.id).select('role mustChangePassword').lean();
    if (!staff) {
      clearAuthCookie(res);
      return res.status(401).json({ message: 'Please log in' });
    }
    const role = staff.role || 'admin';
    if (staff.mustChangePassword) {
      return res.status(403).json({ message: 'Please change your password first', code: 'PASSWORD_CHANGE_REQUIRED' });
    }
    if (!roles.includes(role)) return res.status(403).json({ message: 'Only admins can do this' });
    req.user = { id: token.id, role };
    next();
  };
}

/** Admins only: fees, backup, team, editing students and batches. */
export const requireAdmin = staffGuard(['admin']);

/** Admins and teachers: attendance, exams, notices, calendar, reading student lists. */
export const requireStaff = staffGuard(['admin', 'teacher']);

/** Teachers may read but not change (used on students, programs and batches). */
export function teacherReadOnly(req, res, next) {
  if (req.user?.role === 'teacher' && req.method !== 'GET') {
    return res.status(403).json({ message: 'Only admins can change this' });
  }
  next();
}

/**
 * Students only. Checks the DB each time so a student marked inactive is
 * locked out immediately, and blocks everything until a temporary password is changed.
 */
export async function requireStudent(req, res, next) {
  const user = readToken(req);
  if (!user) return res.status(401).json({ message: 'Please log in' });
  if (user.role !== 'student') return res.status(403).json({ message: 'Students only' });
  const student = await Student.findById(user.id).select('status mustChangePassword').lean();
  if (!student || student.status === 'inactive') {
    clearAuthCookie(res);
    return res.status(401).json({ message: 'Your account is not active' });
  }
  if (student.mustChangePassword) {
    return res.status(403).json({ message: 'Please change your password first', code: 'PASSWORD_CHANGE_REQUIRED' });
  }
  req.user = user;
  next();
}
