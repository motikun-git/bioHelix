import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Admin, Student } from '../models/index.js';
import { setAuthCookie, clearAuthCookie, requireLogin } from '../middleware/auth.js';
import { HttpError, parse } from '../utils/http.js';
import { normalizeStudentId } from '../utils/helpers.js';

const router = Router();

// 10 failed tries per 15 minutes per IP; successful logins don't count
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many wrong attempts. Try again in 15 minutes.' },
});

const WRONG = 'Wrong ID/email or password';

router.post('/admin/login', loginLimiter, async (req, res) => {
  const { email, password } = parse(
    z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) }),
    req.body,
  );
  const admin = await Admin.findOne({ email });
  if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) throw new HttpError(401, WRONG);
  admin.lastLoginAt = new Date();
  await admin.save();
  setAuthCookie(res, { id: admin._id, role: 'admin' });
  res.json({ role: 'admin', name: admin.name, email: admin.email });
});

router.post('/student/login', loginLimiter, async (req, res) => {
  const body = parse(z.object({ studentId: z.string().min(1), password: z.string().min(1) }), req.body);
  const student = await Student.findOne({ studentId: normalizeStudentId(body.studentId) });
  if (!student || !(await bcrypt.compare(body.password, student.passwordHash))) throw new HttpError(401, WRONG);
  if (student.status === 'inactive') throw new HttpError(403, 'Your account is not active. Please contact BioHelix.');
  setAuthCookie(res, { id: student._id, role: 'student' });
  res.json({
    role: 'student',
    name: student.name,
    studentId: student.studentId,
    mustChangePassword: student.mustChangePassword,
  });
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

/** Who is logged in? The app calls this on load. */
router.get('/session', requireLogin, async (req, res) => {
  if (req.user.role === 'admin') {
    const admin = await Admin.findById(req.user.id).select('name email').lean();
    if (!admin) throw new HttpError(401, 'Please log in');
    return res.json({ role: 'admin', name: admin.name, email: admin.email });
  }
  const student = await Student.findById(req.user.id).select('name studentId status mustChangePassword').lean();
  if (!student || student.status === 'inactive') {
    clearAuthCookie(res);
    throw new HttpError(401, 'Please log in');
  }
  res.json({
    role: 'student',
    name: student.name,
    studentId: student.studentId,
    mustChangePassword: student.mustChangePassword,
  });
});

router.patch('/password', requireLogin, async (req, res) => {
  const { currentPassword, newPassword } = parse(
    z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8, 'New password must be at least 8 characters').max(100),
    }),
    req.body,
  );
  const Model = req.user.role === 'admin' ? Admin : Student;
  const account = await Model.findById(req.user.id);
  if (!account || !(await bcrypt.compare(currentPassword, account.passwordHash))) {
    throw new HttpError(400, 'Current password is wrong');
  }
  if (currentPassword === newPassword) throw new HttpError(400, 'New password must be different');
  account.passwordHash = await bcrypt.hash(newPassword, 12);
  if (req.user.role === 'student') account.mustChangePassword = false;
  await account.save();
  res.json({ ok: true });
});

export default router;
