import mongoose from 'mongoose';
import { Result, Student } from '../models/index.js';
import { HttpError } from '../utils/http.js';
import { normalizeStudentId, parseScore } from '../utils/helpers.js';

/**
 * Turn sheet/CSV rows into results for one exam.
 * - Matches rows to students by Student ID (any batch).
 * - If a student submitted twice, the first row (earliest) counts.
 * - Active students of the exam's batches with no row are marked absent.
 * Returns a report the admin sees after import.
 */
export async function importExamRows(exam, headers, body, columnMap, source) {
  const { studentId: idCol, score: scoreCol } = columnMap;
  for (const [label, col] of [['Student ID', idCol], ['Score', scoreCol]]) {
    if (!Number.isInteger(col) || col < 0 || col >= headers.length) {
      throw new HttpError(400, `Pick which column has the ${label}`);
    }
  }
  if (idCol === scoreCol) throw new HttpError(400, 'Student ID and Score must be different columns');

  const ids = [...new Set(body.map((row) => normalizeStudentId(row[idCol])).filter(Boolean))];
  const students = await Student.find({ studentId: { $in: ids } }).select('_id studentId').lean();
  const byId = new Map(students.map((s) => [s.studentId, s._id]));

  const seen = new Set();
  const report = { imported: 0, absent: 0, unmatched: [], duplicates: [], invalid: [] };
  const ops = [];

  body.forEach((row, index) => {
    const rowNumber = index + 2; // +1 for header, +1 for 1-based rows like in Sheets
    const raw = String(row[idCol] ?? '').trim();
    const id = normalizeStudentId(raw);
    if (!id) return;
    const studentObjectId = byId.get(id);
    if (!studentObjectId) return report.unmatched.push({ row: rowNumber, value: raw });
    if (seen.has(id)) return report.duplicates.push({ row: rowNumber, value: raw });

    const marks = parseScore(row[scoreCol]);
    if (marks === null) {
      return report.invalid.push({ row: rowNumber, value: raw, reason: `No number in "${row[scoreCol] ?? ''}"` });
    }
    if (marks > exam.totalMarks) {
      return report.invalid.push({ row: rowNumber, value: raw, reason: `${marks} is more than total ${exam.totalMarks}` });
    }
    seen.add(id);
    report.imported += 1;
    ops.push({
      updateOne: {
        filter: { exam: exam._id, student: studentObjectId },
        // Keep the whole response row so question-wise analysis can be set up later
        update: { $set: { marks, isAbsent: false, source, row: row.map((cell) => String(cell ?? '').slice(0, 500)) } },
        upsert: true,
      },
    });
  });

  const presentIds = new Set([...seen].map((id) => String(byId.get(id))));
  const roster = await Student.find({ batch: { $in: exam.batches }, status: 'active' }).select('_id').lean();
  for (const s of roster) {
    if (presentIds.has(String(s._id))) continue;
    report.absent += 1;
    ops.push({
      updateOne: {
        filter: { exam: exam._id, student: s._id },
        update: { $set: { marks: null, isAbsent: true, rank: null, source, row: [] } },
        upsert: true,
      },
    });
  }

  if (ops.length) await Result.bulkWrite(ops, { ordered: false });

  exam.lastImport = { at: new Date(), ...report };
  // If the sheet's columns changed, the old question setup no longer fits
  const sameHeaders = JSON.stringify(exam.sheetHeaders || []) === JSON.stringify(headers);
  if (!sameHeaders) exam.questions = [];
  exam.sheetHeaders = headers;
  if (exam.status === 'draft') exam.status = 'imported';
  await exam.save();
  if (exam.status === 'published') await rankExam(exam._id);
  return report;
}

/** Offline exam: admin types marks for each student. */
export async function saveManualMarks(exam, entries) {
  const studentIds = entries.map((e) => e.student);
  const valid = await Student.countDocuments({ _id: { $in: studentIds } });
  if (valid !== new Set(studentIds).size) throw new HttpError(400, 'Some students were not found');

  const ops = entries.map((entry) => {
    if (!entry.isAbsent && entry.marks === null) {
      return { deleteOne: { filter: { exam: exam._id, student: entry.student } } };
    }
    if (!entry.isAbsent && entry.marks > exam.totalMarks) {
      throw new HttpError(400, `Marks cannot be more than ${exam.totalMarks}`);
    }
    return {
      updateOne: {
        filter: { exam: exam._id, student: entry.student },
        update: {
          $set: {
            marks: entry.isAbsent ? null : entry.marks,
            isAbsent: entry.isAbsent,
            source: 'manual',
            ...(entry.isAbsent ? { rank: null } : {}),
          },
        },
        upsert: true,
      },
    };
  });
  if (ops.length) await Result.bulkWrite(ops, { ordered: false });
  if (exam.status === 'draft') {
    exam.status = 'imported';
    await exam.save();
  }
  if (exam.status === 'published') await rankExam(exam._id);
}

/** Competition ranking: 95, 95, 90 → ranks 1, 1, 3. Absent students get no rank. */
export async function rankExam(examId) {
  const results = await Result.find({ exam: examId, isAbsent: false, marks: { $ne: null } })
    .sort({ marks: -1 })
    .select('_id marks')
    .lean();
  const ops = [];
  let rank = 0;
  results.forEach((r, i) => {
    if (i === 0 || r.marks !== results[i - 1].marks) rank = i + 1;
    ops.push({ updateOne: { filter: { _id: r._id }, update: { $set: { rank } } } });
  });
  ops.push({ updateMany: { filter: { exam: examId, isAbsent: true }, update: { $set: { rank: null } } } });
  await Result.bulkWrite(ops, { ordered: false });
}

/** Summary per exam: present, absent, average, highest, lowest, passed. */
export async function examStats(examIds, passMarksByExam = new Map()) {
  const ids = examIds.map((id) => new mongoose.Types.ObjectId(String(id)));
  const results = await Result.find({ exam: { $in: ids } }).select('exam marks isAbsent').lean();
  const stats = new Map(
    ids.map((id) => [String(id), { present: 0, absent: 0, average: null, highest: null, lowest: null, passed: 0, sum: 0 }]),
  );
  for (const r of results) {
    const s = stats.get(String(r.exam));
    if (r.isAbsent) {
      s.absent += 1;
      continue;
    }
    if (r.marks === null || r.marks === undefined) continue;
    s.present += 1;
    s.sum += r.marks;
    s.highest = s.highest === null ? r.marks : Math.max(s.highest, r.marks);
    s.lowest = s.lowest === null ? r.marks : Math.min(s.lowest, r.marks);
    if (r.marks >= (passMarksByExam.get(String(r.exam)) ?? 0)) s.passed += 1;
  }
  for (const s of stats.values()) {
    s.average = s.present ? Math.round((s.sum / s.present) * 100) / 100 : null;
    delete s.sum;
  }
  return stats;
}
