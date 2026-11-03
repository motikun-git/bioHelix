import { Batch, Counter, Payment, Student } from '../models/index.js';
import { localDate, localMonth, monthsBetween } from '../utils/helpers.js';

/** BH-R26-00001: one running number per year. */
export async function nextReceiptNo(date = new Date()) {
  const yy = localDate(date).slice(2, 4);
  const counter = await Counter.findOneAndUpdate(
    { name: `receipt-${yy}` },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  );
  return `BH-R${yy}-${String(counter.seq).padStart(5, '0')}`;
}

export function monthlyFeeFor(student, batch) {
  return student.monthlyFee ?? batch?.monthlyFee ?? 0;
}

/**
 * A student's fee account: admission fee, every month from admission to now,
 * how much was paid (amount + discount) and what is still due.
 */
export async function feeAccount(studentOrId, { upTo = localMonth() } = {}) {
  const student =
    studentOrId.batch && studentOrId.admissionDate
      ? studentOrId
      : await Student.findById(studentOrId).select('admissionDate batch monthlyFee status').lean();
  const batch = await Batch.findById(student.batch).select('admissionFee monthlyFee name').lean();
  const payments = await Payment.find({ student: student._id }).sort({ paidAt: -1 }).lean();

  const paidFor = (kind, month) =>
    payments.filter((p) => p.kind === kind && (month ? p.month === month : true)).reduce((sum, p) => sum + p.amount + p.discount, 0);

  const monthly = monthlyFeeFor(student, batch);
  const startMonth = localMonth(new Date(student.admissionDate));
  const months = monthly > 0 && startMonth <= upTo ? monthsBetween(startMonth, upTo) : [];
  const monthRows = months.map((month) => {
    const paid = paidFor('monthly', month);
    return { month, fee: monthly, paid, due: Math.max(0, monthly - paid) };
  });

  const admissionFee = batch?.admissionFee || 0;
  const admissionPaid = paidFor('admission');
  const admission = { fee: admissionFee, paid: admissionPaid, due: Math.max(0, admissionFee - admissionPaid) };

  return {
    monthlyFee: monthly,
    admission,
    months: monthRows.reverse(), // newest first
    totalDue: admission.due + monthRows.reduce((sum, m) => sum + m.due, 0),
    payments,
  };
}

/** Students of a batch (or all active students) who still owe money for a given month. */
export async function dueList({ batchId, month = localMonth() }) {
  const filter = { status: 'active' };
  if (batchId) filter.batch = batchId;
  const students = await Student.find(filter).select('studentId name phone guardianPhone batch admissionDate monthlyFee').populate('batch', 'name admissionFee monthlyFee').lean();
  const payments = await Payment.find({ student: { $in: students.map((s) => s._id) } }).select('student kind month amount discount').lean();
  const byStudent = new Map();
  for (const p of payments) {
    const key = String(p.student);
    if (!byStudent.has(key)) byStudent.set(key, []);
    byStudent.get(key).push(p);
  }

  const rows = [];
  for (const s of students) {
    const mine = byStudent.get(String(s._id)) || [];
    const sum = (kind, m) => mine.filter((p) => p.kind === kind && (m ? p.month === m : true)).reduce((t, p) => t + p.amount + p.discount, 0);
    const monthly = monthlyFeeFor(s, s.batch);
    const start = localMonth(new Date(s.admissionDate));
    const months = monthly > 0 && start <= month ? monthsBetween(start, month) : [];
    const unpaidMonths = months.filter((m) => sum('monthly', m) < monthly);
    const monthsDue = unpaidMonths.reduce((t, m) => t + monthly - sum('monthly', m), 0);
    const admissionDue = Math.max(0, (s.batch?.admissionFee || 0) - sum('admission'));
    const total = monthsDue + admissionDue;
    if (total > 0) {
      rows.push({
        _id: s._id,
        studentId: s.studentId,
        name: s.name,
        phone: s.phone,
        guardianPhone: s.guardianPhone,
        batch: s.batch?.name,
        unpaidMonths,
        admissionDue,
        total,
        thisMonthPaid: !unpaidMonths.includes(month),
      });
    }
  }
  return rows.sort((a, b) => b.total - a.total);
}
