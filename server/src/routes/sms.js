import { Router } from 'express';
import { z } from 'zod';
import { env, smsEnabled } from '../config/env.js';
import { Batch, SmsLog } from '../models/index.js';
import { dueList } from '../services/fees.js';
import { localDate } from '../utils/helpers.js';
import { saveSmsSettings, sendOne, sendToStudents, smsBalance, smsSettings, studentsForBulk, toMsisdn } from '../services/sms.js';
import { HttpError, parse } from '../utils/http.js';

const router = Router();
const objectId = z.string().regex(/^[a-f\d]{24}$/i);

router.get('/', async (req, res) => {
  const [settings, balance, logs] = await Promise.all([
    smsSettings(),
    smsBalance(),
    SmsLog.find().sort({ createdAt: -1 }).limit(100).populate('student', 'studentId name').lean(),
  ]);
  res.json({ enabled: smsEnabled, dryRun: env.sms.dryRun, settings, balance, logs });
});

router.put('/settings', async (req, res) => {
  const data = parse(
    z.object({
      onAbsent: z.boolean(),
      onResult: z.boolean(),
      onPayment: z.boolean(),
      sendTo: z.enum(['guardian', 'student', 'both']),
    }).partial(),
    req.body,
  );
  res.json(await saveSmsSettings(data));
});

function requireSms() {
  if (!smsEnabled) throw new HttpError(400, 'SMS is not set up yet. Add SMS_API_KEY on the server first.');
}

/** One message to every active student of a batch (or a whole program, or everyone). */
router.post('/send', async (req, res) => {
  requireSms();
  const body = parse(
    z.object({
      batch: objectId.optional(),
      program: objectId.optional(),
      sendTo: z.enum(['guardian', 'student', 'both']).default('guardian'),
      message: z.string().trim().min(1, 'Write the message').max(600, 'Message is too long (600 characters at most)'),
    }),
    req.body,
  );
  if (body.batch && !(await Batch.exists({ _id: body.batch }))) throw new HttpError(404, 'Batch not found');
  const students = await studentsForBulk(body);
  if (!students.length) throw new HttpError(400, 'No active students to send to');
  if (students.length > 1000) throw new HttpError(400, 'Too many students at once. Pick one batch.');
  res.json(await sendToStudents(students, { kind: 'manual', sendTo: body.sendTo, text: body.message }));
});

router.post('/test', async (req, res) => {
  requireSms();
  const { phone } = parse(z.object({ phone: z.string().min(1, 'Enter a phone number') }), req.body);
  const to = toMsisdn(phone);
  if (!to) throw new HttpError(400, 'Enter a Bangladeshi mobile number like 01712345678');
  const log = await sendOne({ to, message: 'BioHelix: SMS is working.', kind: 'test' });
  if (log.status !== 'sent') throw new HttpError(502, log.error);
  res.json({ ok: true });
});

/** Remind everyone on the due list (optionally one batch) about unpaid fees. Once a day at most. */
router.post('/dues', async (req, res) => {
  requireSms();
  const body = parse(
    z.object({ batch: objectId.optional(), sendTo: z.enum(['guardian', 'student', 'both']).default('guardian') }),
    req.body,
  );
  const dues = await dueList({ batchId: body.batch });
  if (!dues.length) throw new HttpError(400, 'Nobody has dues right now');
  const bn = (n) => String(n).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);
  const byId = new Map(dues.map((d) => [String(d._id), d]));
  res.json(
    await sendToStudents(dues, {
      kind: 'due',
      ref: `due:${localDate()}`,
      sendTo: body.sendTo,
      text: (s) => `BioHelix: ${s.name} এর ${bn(byId.get(String(s._id)).total)} টাকা ফি বাকি আছে। অনুগ্রহ করে পরিশোধ করুন। ধন্যবাদ।`,
    }),
  );
});

export default router;
