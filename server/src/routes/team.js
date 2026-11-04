import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Admin } from '../models/index.js';
import { HttpError, assertObjectId, parse } from '../utils/http.js';
import { generateTempPassword } from '../utils/helpers.js';

// Admin-only: the people who can log in to the admin panel.
const router = Router();

function publicStaff(a) {
  return {
    _id: a._id,
    name: a.name,
    email: a.email,
    role: a.role || 'admin',
    mustChangePassword: a.mustChangePassword,
    lastLoginAt: a.lastLoginAt,
    createdAt: a.createdAt,
  };
}

async function adminsLeft(exceptId) {
  return Admin.countDocuments({ _id: { $ne: exceptId }, $or: [{ role: 'admin' }, { role: { $exists: false } }] });
}

router.get('/', async (req, res) => {
  const staff = await Admin.find().sort({ role: 1, name: 1 }).lean();
  res.json(staff.map(publicStaff));
});

router.post('/', async (req, res) => {
  const data = parse(
    z.object({
      name: z.string().trim().min(2, 'Name is too short').max(80),
      email: z.string().trim().toLowerCase().email('Enter a valid email'),
      role: z.enum(['admin', 'teacher']),
    }),
    req.body,
  );
  const tempPassword = generateTempPassword(10);
  const staff = await Admin.create({ ...data, passwordHash: await bcrypt.hash(tempPassword, 12), mustChangePassword: true });
  res.status(201).json({ staff: publicStaff(staff), tempPassword });
});

router.patch('/:id', async (req, res) => {
  assertObjectId(req.params.id);
  const data = parse(z.object({ name: z.string().trim().min(2).max(80).optional(), role: z.enum(['admin', 'teacher']).optional() }), req.body);
  const staff = await Admin.findById(req.params.id);
  if (!staff) throw new HttpError(404, 'Account not found');
  if (data.role === 'teacher' && (staff.role || 'admin') === 'admin' && !(await adminsLeft(staff._id))) {
    throw new HttpError(400, 'There must always be at least one admin');
  }
  if (String(staff._id) === req.user.id && data.role === 'teacher') throw new HttpError(400, 'You cannot remove your own admin access');
  Object.assign(staff, data);
  await staff.save();
  res.json(publicStaff(staff));
});

router.post('/:id/reset-password', async (req, res) => {
  assertObjectId(req.params.id);
  const staff = await Admin.findById(req.params.id);
  if (!staff) throw new HttpError(404, 'Account not found');
  if (String(staff._id) === req.user.id) throw new HttpError(400, 'Use Change password for your own account');
  const tempPassword = generateTempPassword(10);
  staff.passwordHash = await bcrypt.hash(tempPassword, 12);
  staff.mustChangePassword = true;
  await staff.save();
  res.json({ email: staff.email, tempPassword });
});

router.delete('/:id', async (req, res) => {
  assertObjectId(req.params.id);
  if (req.params.id === req.user.id) throw new HttpError(400, 'You cannot remove your own account');
  const staff = await Admin.findById(req.params.id);
  if (!staff) throw new HttpError(404, 'Account not found');
  if ((staff.role || 'admin') === 'admin' && !(await adminsLeft(staff._id))) throw new HttpError(400, 'There must always be at least one admin');
  await staff.deleteOne();
  res.json({ ok: true });
});

export default router;
