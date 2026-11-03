import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Student } from '../models/index.js';

const COOKIE = 'bh_token';
const MAX_AGE = { admin: 24 * 60 * 60 * 1000, student: 7 * 24 * 60 * 60 * 1000 };

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

export function requireAdmin(req, res, next) {
  const user = readToken(req);
  if (!user) return res.status(401).json({ message: 'Please log in' });
  if (user.role !== 'admin') return res.status(403).json({ message: 'Admins only' });
  req.user = user;
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
