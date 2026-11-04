import { Router } from 'express';
import { notifyPayment } from '../services/sms.js';
import { z } from 'zod';
import { Admin, Payment, Student } from '../models/index.js';
import { HttpError, assertObjectId, parse } from '../utils/http.js';
import { MONTH_RE, localDate, localMonth, monthRange } from '../utils/helpers.js';
import { dueList, feeAccount, monthlyFeeFor, nextReceiptNo } from '../services/fees.js';

const router = Router();

const paymentSchema = z
  .object({
    student: z.string().refine((v) => /^[a-f\d]{24}$/i.test(v), 'Pick a student'),
    kind: z.enum(['admission', 'monthly', 'other']),
    month: z.string().regex(MONTH_RE, 'Pick the month this fee is for').optional(),
    amount: z.coerce.number().min(0).max(1_000_000),
    discount: z.coerce.number().min(0).max(1_000_000).default(0),
    method: z.enum(['cash', 'bkash', 'nagad', 'bank']).default('cash'),
    trxId: z.string().trim().max(60).default(''),
    note: z.string().trim().max(300).default(''),
    paidAt: z.coerce.date().optional(),
  })
  .refine((p) => p.kind !== 'monthly' || p.month, { message: 'Pick the month this fee is for', path: ['month'] })
  .refine((p) => p.amount + p.discount > 0, { message: 'Enter an amount', path: ['amount'] })
  .refine((p) => p.method === 'cash' || p.trxId, { message: 'Enter the transaction ID for bKash, Nagad or bank', path: ['trxId'] });

/** A student's full fee account (used on the student profile and the payment form). */
router.get('/students/:id', async (req, res) => {
  assertObjectId(req.params.id);
  const student = await Student.findById(req.params.id).select('admissionDate batch monthlyFee status').lean();
  if (!student) throw new HttpError(404, 'Student not found');
  res.json(await feeAccount(student));
});

router.post('/payments', async (req, res) => {
  const data = parse(paymentSchema, req.body);
  const student = await Student.findById(data.student).select('_id batch monthlyFee').populate('batch', 'admissionFee monthlyFee').lean();
  if (!student) throw new HttpError(404, 'Student not found');
  // Only take the kinds of fee this student's batch actually charges
  if (data.kind === 'monthly' && !monthlyFeeFor(student, student.batch)) {
    throw new HttpError(400, 'This student has no monthly fee. Set it on the batch first.');
  }
  if (data.kind === 'admission' && !student.batch?.admissionFee) {
    throw new HttpError(400, 'This batch has no admission fee. Set it on the batch first.');
  }
  if (data.kind !== 'monthly') delete data.month;
  if (data.paidAt && localDate(data.paidAt) > localDate()) throw new HttpError(400, 'Payment date cannot be in the future');
  const payment = await Payment.create({ ...data, receiptNo: await nextReceiptNo(data.paidAt), receivedBy: req.user.id });
  notifyPayment(payment);
  res.status(201).json(payment);
});

/** Recent payments, newest first; filter by month paid. */
router.get('/payments', async (req, res) => {
  const filter = {};
  if (req.query.month) {
    if (!MONTH_RE.test(req.query.month)) throw new HttpError(400, 'Month must look like 2026-11');
    const [from, to] = monthRange(req.query.month);
    filter.paidAt = { $gte: new Date(`${from}T00:00:00+06:00`), $lte: new Date(`${to}T23:59:59.999+06:00`) };
  }
  if (req.query.student) {
    assertObjectId(req.query.student, 'student');
    filter.student = req.query.student;
  }
  const payments = await Payment.find(filter)
    .populate({ path: 'student', select: 'studentId name batch', populate: { path: 'batch', select: 'name' } })
    .sort({ paidAt: -1, createdAt: -1 })
    .limit(500)
    .lean();
  const total = payments.reduce((sum, p) => sum + p.amount, 0);
  res.json({ total, count: payments.length, items: payments });
});

/** Everything needed to print one money receipt. */
router.get('/payments/:id', async (req, res) => {
  assertObjectId(req.params.id);
  const payment = await Payment.findById(req.params.id)
    .populate({ path: 'student', select: 'studentId name guardianName batch program', populate: [{ path: 'batch', select: 'name' }, { path: 'program', select: 'name' }] })
    .lean();
  if (!payment) throw new HttpError(404, 'Payment not found');
  const admin = payment.receivedBy ? await Admin.findById(payment.receivedBy).select('name').lean() : null;
  res.json({ ...payment, receivedByName: admin?.name || '' });
});

/** Payments entered by mistake can be removed the same day only, so old receipts stay trustworthy. */
router.delete('/payments/:id', async (req, res) => {
  assertObjectId(req.params.id);
  const payment = await Payment.findById(req.params.id);
  if (!payment) throw new HttpError(404, 'Payment not found');
  if (localDate(payment.createdAt) !== localDate()) {
    throw new HttpError(400, 'Only payments entered today can be deleted. Add a correcting entry instead.');
  }
  await payment.deleteOne();
  res.json({ ok: true });
});

router.get('/dues', async (req, res) => {
  const month = req.query.month || localMonth();
  if (!MONTH_RE.test(month)) throw new HttpError(400, 'Month must look like 2026-11');
  let batchId;
  if (req.query.batch) {
    assertObjectId(req.query.batch, 'batch');
    batchId = req.query.batch;
  }
  const rows = await dueList({ batchId, month });
  res.json({ month, total: rows.reduce((sum, r) => sum + r.total, 0), items: rows });
});

export default router;
