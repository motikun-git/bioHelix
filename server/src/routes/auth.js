import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Admin, Student } from '../models/index.js';
import { setAuthCookie, clearAuthCookie, requireLogin } from '../middleware/auth.js';
import { HttpError, parse } from '../utils/http.js';
import { normalizeStudentId } from '../utils/helpers.js';
import crypto from 'node:crypto';
import { smsEnabled } from '../config/env.js';
import { PasswordReset } from '../models/reset.js';
import { maskPhone, recipients, sendOne } from '../services/sms.js';

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
  const role = admin.role || 'admin';
  setAuthCookie(res, { id: admin._id, role });
  res.json({ role, name: admin.name, email: admin.email, mustChangePassword: admin.mustChangePassword });
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
  if (req.user.role !== 'student') {
    const admin = await Admin.findById(req.user.id).select('name email role mustChangePassword').lean();
    if (!admin) {
      clearAuthCookie(res);
      throw new HttpError(401, 'Please log in');
    }
    return res.json({ role: admin.role || 'admin', name: admin.name, email: admin.email, mustChangePassword: admin.mustChangePassword });
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
  const Model = req.user.role === 'student' ? Student : Admin;
  const account = await Model.findById(req.user.id);
  if (!account || !(await bcrypt.compare(currentPassword, account.passwordHash))) {
    throw new HttpError(400, 'Current password is wrong');
  }
  if (currentPassword === newPassword) throw new HttpError(400, 'New password must be different');
  account.passwordHash = await bcrypt.hash(newPassword, 12);
  account.mustChangePassword = false;
  await account.save();
  res.json({ ok: true });
});

// ---------- Forgot password (students): 6-digit code by SMS ----------

const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many tries. Try again in an hour. / অনেকবার চেষ্টা হয়েছে, এক ঘণ্টা পর আবার চেষ্টা করুন।' },
});
const CODE_MINUTES = 10;
const MAX_TRIES = 5;

router.get('/student/forgot', (req, res) => {
  res.json({ available: smsEnabled });
});

router.post('/student/forgot', resetLimiter, async (req, res) => {
  if (!smsEnabled) throw new HttpError(400, 'Password reset by SMS is not available. Ask BioHelix to reset it.');
  const { studentId } = parse(z.object({ studentId: z.string().min(1) }), req.body);
  const student = await Student.findOne({ studentId: normalizeStudentId(studentId) }).select('name phone guardianPhone status').lean();
  if (!student || student.status === 'inactive') throw new HttpError(404, 'Student ID not found. / এই আইডি পাওয়া যায়নি।');
  const numbers = recipients(student, 'both');
  if (!numbers.length) throw new HttpError(400, 'No mobile number is saved for this student. Ask BioHelix to reset the password.');

  const recent = await PasswordReset.findOne({ student: student._id, createdAt: { $gt: new Date(Date.now() - 60 * 1000) } }).lean();
  if (recent) throw new HttpError(429, 'A code was just sent. Wait one minute. / একটু আগেই কোড পাঠানো হয়েছে, এক মিনিট অপেক্ষা করুন।');

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await PasswordReset.deleteMany({ student: student._id });
  await PasswordReset.create({
    student: student._id,
    codeHash: await bcrypt.hash(code, 10),
    expiresAt: new Date(Date.now() + CODE_MINUTES * 60 * 1000),
  });
  const message = `BioHelix password reset code: ${code}. Valid for ${CODE_MINUTES} minutes. Do not share it.`;
  let sent = 0;
  for (const to of numbers) {
    const log = await sendOne({ to, message, kind: 'reset', student: student._id, logMessage: message.replace(code, '••••••') });
    if (log.status === 'sent') sent += 1;
  }
  if (!sent) throw new HttpError(502, 'Could not send the SMS right now. Try again later.');
  res.json({ ok: true, phone: numbers.map(maskPhone).join(', ') });
});

router.post('/student/reset', resetLimiter, async (req, res) => {
  const body = parse(
    z.object({
      studentId: z.string().min(1),
      code: z.string().trim().regex(/^\d{6}$/, 'The code has 6 digits'),
      newPassword: z.string().min(8, 'New password must be at least 8 characters').max(100),
    }),
    req.body,
  );
  const WRONG_CODE = 'Wrong or expired code. / কোড ভুল অথবা মেয়াদ শেষ।';
  const student = await Student.findOne({ studentId: normalizeStudentId(body.studentId) });
  if (!student) throw new HttpError(400, WRONG_CODE);
  const reset = await PasswordReset.findOne({ student: student._id });
  if (!reset || reset.expiresAt < new Date() || reset.tries >= MAX_TRIES) throw new HttpError(400, WRONG_CODE);
  if (!(await bcrypt.compare(body.code, reset.codeHash))) {
    reset.tries += 1;
    await reset.save();
    throw new HttpError(400, WRONG_CODE);
  }
  student.passwordHash = await bcrypt.hash(body.newPassword, 12);
  student.mustChangePassword = false;
  await student.save();
  await PasswordReset.deleteMany({ student: student._id });
  res.json({ ok: true });
});

export default router;
