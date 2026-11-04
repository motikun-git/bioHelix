import { Router } from 'express';
import { z } from 'zod';
import { Attendance, Expense, Payment, Student } from '../models/index.js';
import { HttpError, assertObjectId, parse, parsePatch } from '../utils/http.js';
import { MONTH_RE, localDate, localMonth, monthRange } from '../utils/helpers.js';

// Income (fee payments) vs expenses, and month-by-month reports. Admins only.
const router = Router();

export const EXPENSE_CATEGORIES = ['rent', 'salary', 'utilities', 'materials', 'marketing', 'other'];

const expenseFields = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must look like 2026-11-03'),
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.coerce.number().positive('Amount must be more than 0').max(10_000_000),
  paidTo: z.string().trim().max(120).default(''),
  note: z.string().trim().max(300).default(''),
});

function monthOf(req) {
  const month = req.query.month || localMonth();
  if (!MONTH_RE.test(month)) throw new HttpError(400, 'Month must look like 2026-11');
  return month;
}

const dhakaStart = (ymd) => new Date(`${ymd}T00:00:00+06:00`);
const dhakaEnd = (ymd) => new Date(`${ymd}T23:59:59.999+06:00`);

router.get('/expenses', async (req, res) => {
  const [from, to] = monthRange(monthOf(req));
  const items = await Expense.find({ date: { $gte: from, $lte: to } }).sort({ date: -1, createdAt: -1 }).lean();
  res.json(items);
});

router.post('/expenses', async (req, res) => {
  const data = parse(expenseFields, req.body);
  if (data.date > localDate()) throw new HttpError(400, 'Date cannot be in the future');
  res.status(201).json(await Expense.create({ ...data, addedBy: req.user.id }));
});

router.patch('/expenses/:id', async (req, res) => {
  assertObjectId(req.params.id);
  const item = await Expense.findById(req.params.id);
  if (!item) throw new HttpError(404, 'Not found');
  const data = parsePatch(expenseFields, req.body);
  if (data.date && data.date > localDate()) throw new HttpError(400, 'Date cannot be in the future');
  Object.assign(item, data);
  await item.save();
  res.json(item);
});

router.delete('/expenses/:id', async (req, res) => {
  assertObjectId(req.params.id);
  await Expense.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
});

function lastMonths(end, count) {
  const [y, m] = end.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (count - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

/** One month in detail plus the last 12 months side by side. */
router.get('/summary', async (req, res) => {
  const month = monthOf(req);
  const months = lastMonths(month, 12);
  const [first] = monthRange(months[0]);
  const [, last] = monthRange(month);

  const [payments, expenses, students, sheets] = await Promise.all([
    Payment.find({ paidAt: { $gte: dhakaStart(first), $lte: dhakaEnd(last) } }).select('paidAt amount kind').lean(),
    Expense.find({ date: { $gte: first, $lte: last } }).select('date amount category').lean(),
    Student.find().select('admissionDate status updatedAt').lean(),
    Attendance.find({ date: { $gte: first, $lte: last } }).select('date records.status').lean(),
  ]);

  const rows = new Map(months.map((m) => [m, { month: m, income: 0, expense: 0, admissions: 0, active: 0, present: 0, marked: 0 }]));
  for (const p of payments) {
    const r = rows.get(localMonth(new Date(p.paidAt)));
    if (r) r.income += p.amount;
  }
  for (const e of expenses) {
    const r = rows.get(e.date.slice(0, 7));
    if (r) r.expense += e.amount;
  }
  for (const s of students) {
    const joined = localMonth(new Date(s.admissionDate));
    const left = s.status === 'active' ? null : localMonth(new Date(s.updatedAt));
    for (const r of rows.values()) {
      if (joined === r.month) r.admissions += 1;
      if (joined <= r.month && (!left || left > r.month)) r.active += 1;
    }
  }
  for (const sheet of sheets) {
    const r = rows.get(sheet.date.slice(0, 7));
    if (!r) continue;
    for (const rec of sheet.records) {
      r.marked += 1;
      if (rec.status !== 'absent') r.present += 1;
    }
  }
  const trend = [...rows.values()].map(({ present, marked, ...r }) => ({
    ...r,
    profit: r.income - r.expense,
    attendance: marked ? Math.round((present / marked) * 100) : null,
  }));

  const [from, to] = monthRange(month);
  const byCategory = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c, 0]));
  expenses.filter((e) => e.date >= from && e.date <= to).forEach((e) => (byCategory[e.category] += e.amount));
  const byKind = { admission: 0, monthly: 0, other: 0 };
  payments.filter((p) => localMonth(new Date(p.paidAt)) === month).forEach((p) => (byKind[p.kind] += p.amount));
  const current = trend[trend.length - 1];

  res.json({ month, income: current.income, expense: current.expense, profit: current.profit, byCategory, byKind, trend });
});

export default router;
