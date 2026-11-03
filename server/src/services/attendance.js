import mongoose from 'mongoose';
import { Attendance } from '../models/index.js';

/**
 * A student's attendance between two dates (inclusive), with each day's mark.
 * Counted in JavaScript so it works the same on every MongoDB version.
 */
export async function attendanceCounts(studentId, { from, to } = {}) {
  const id = new mongoose.Types.ObjectId(String(studentId));
  const filter = { 'records.student': id };
  if (from || to) filter.date = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  const sheets = await Attendance.find(filter).select('date records').sort({ date: 1 }).lean();
  const days = [];
  const counts = { present: 0, absent: 0, late: 0 };
  for (const sheet of sheets) {
    const mine = sheet.records.find((r) => String(r.student) === String(id));
    if (!mine) continue;
    counts[mine.status] += 1;
    days.push({ date: sheet.date, status: mine.status });
  }
  const total = days.length;
  return {
    ...counts,
    total,
    percent: total ? Math.round(((counts.present + counts.late) / total) * 100) : null,
    days,
  };
}
