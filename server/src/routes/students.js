import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Batch, Exam, Result, Student } from '../models/index.js';
import { HttpError, assertObjectId, parse, parsePatch } from '../utils/http.js';
import {
  BD_PHONE,
  escapeRegex,
  generateTempPassword,
  nextStudentId,
  normalizePhone,
} from '../utils/helpers.js';
import { csvUpload, imageUpload } from '../middleware/upload.js';
import { readCsv } from '../services/sheets.js';
import { photoUrl, uploadStudentPhoto } from '../services/photos.js';
import { attendanceCounts } from '../services/attendance.js';
import { feeAccount } from '../services/fees.js';

const router = Router();

const phone = z
  .string()
  .optional()
  .transform((v) => normalizePhone(v))
  .refine((v) => v === '' || BD_PHONE.test(v), 'Phone must be a Bangladeshi mobile number like 01712345678');

const studentSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(100),
  phone,
  guardianName: z.string().trim().max(100).default(''),
  guardianPhone: phone,
  college: z.string().trim().max(120).default(''),
  batch: z.string().refine((v) => /^[a-f\d]{24}$/i.test(v), 'Pick a batch'),
  session: z.string().trim().max(40).default(''),
  admissionDate: z.coerce.date().optional(),
  status: z.enum(['active', 'inactive', 'completed']).default('active'),
  // Empty = use the batch fee; a number = this student's own monthly fee (scholarship)
  monthlyFee: z
    .union([z.literal(''), z.null(), z.coerce.number().min(0).max(1_000_000)])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v)),
});

async function loadBatch(batchId) {
  const batch = await Batch.findById(batchId).populate('program', 'code name');
  if (!batch) throw new HttpError(400, 'Batch not found');
  return batch;
}

/** Creates one student with a fresh ID and temporary password. */
async function createStudent(data, batch) {
  const tempPassword = generateTempPassword();
  const studentId = await nextStudentId(batch.program.code, data.admissionDate || new Date());
  const student = await Student.create({
    ...data,
    studentId,
    program: batch.program._id,
    session: data.session || batch.session,
    passwordHash: await bcrypt.hash(tempPassword, 10),
    mustChangePassword: true,
  });
  return { student, tempPassword };
}

function publicStudent(s) {
  const { passwordHash, photo, ...rest } = s.toObject ? s.toObject() : s;
  return { ...rest, photoUrl: photoUrl(photo) };
}

router.get('/', async (req, res) => {
  const filter = {};
  const { q, batch, program, status } = req.query;
  if (batch) {
    assertObjectId(batch, 'batch');
    filter.batch = batch;
  }
  if (program) {
    assertObjectId(program, 'program');
    filter.program = program;
  }
  if (status && ['active', 'inactive', 'completed'].includes(status)) filter.status = status;
  if (q?.trim()) {
    const term = new RegExp(escapeRegex(q.trim()), 'i');
    filter.$or = [{ name: term }, { studentId: term }, { phone: term }, { guardianPhone: term }];
  }
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
  const [items, total] = await Promise.all([
    Student.find(filter)
      .select('-passwordHash')
      .populate('batch', 'name')
      .populate('program', 'name code')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Student.countDocuments(filter),
  ]);
  res.json({ items: items.map(publicStudent), total, page, pages: Math.ceil(total / limit) });
});

router.post('/', async (req, res) => {
  const data = parse(studentSchema, req.body);
  const batch = await loadBatch(data.batch);
  const { student, tempPassword } = await createStudent(data, batch);
  res.status(201).json({ student: publicStudent(student), tempPassword });
});

/**
 * Bulk import from CSV. Columns (header names are flexible):
 * name, phone, guardianName, guardianPhone, college, session
 * All rows go into the batch chosen in the form.
 */
router.post('/import', csvUpload, async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Choose a CSV file');
  assertObjectId(req.body.batch, 'batch');
  const batch = await loadBatch(req.body.batch);
  const rows = readCsv(req.file.buffer);
  if (rows.length < 2) throw new HttpError(400, 'The CSV has no student rows');
  if (rows.length > 501) throw new HttpError(400, 'Import at most 500 students at a time');

  const key = (h) => String(h).toLowerCase().replace(/[^a-z]/g, '');
  const aliases = {
    name: ['name', 'studentname', 'fullname'],
    phone: ['phone', 'mobile', 'studentphone', 'contact'],
    guardianName: ['guardianname', 'guardian', 'fathername', 'parentname'],
    guardianPhone: ['guardianphone', 'guardianmobile', 'parentphone', 'fatherphone'],
    college: ['college', 'institution', 'school'],
    session: ['session', 'year'],
  };
  const headers = rows[0].map(key);
  const col = Object.fromEntries(
    Object.entries(aliases).map(([field, names]) => [field, headers.findIndex((h) => names.includes(h))]),
  );
  if (col.name === -1) throw new HttpError(400, 'The CSV needs a "name" column');

  const created = [];
  const errors = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const raw = Object.fromEntries(
      Object.entries(col).map(([field, idx]) => [field, idx === -1 ? '' : String(row[idx] ?? '').trim()]),
    );
    if (!raw.name) continue;
    const result = studentSchema.safeParse({ ...raw, batch: String(batch._id) });
    if (!result.success) {
      errors.push({ row: i + 1, name: raw.name, reason: result.error.issues.map((x) => x.message).join('; ') });
      continue;
    }
    const { student, tempPassword } = await createStudent(result.data, batch);
    created.push({ studentId: student.studentId, name: student.name, phone: student.phone, tempPassword });
  }
  res.status(201).json({ created, errors });
});

router.get('/:id', async (req, res) => {
  assertObjectId(req.params.id);
  const student = await Student.findById(req.params.id)
    .select('-passwordHash')
    .populate('batch', 'name days startTime endTime')
    .populate('program', 'name code')
    .lean();
  if (!student) throw new HttpError(404, 'Student not found');
  const results = await Result.find({ student: student._id })
    .populate({ path: 'exam', select: 'title date totalMarks status', model: Exam })
    .lean();
  results.sort((a, b) => new Date(b.exam?.date) - new Date(a.exam?.date));
  const [attendance, fees] = await Promise.all([attendanceCounts(student._id), feeAccount(student)]);
  const { days, ...attendanceTotals } = attendance;
  res.json({
    ...publicStudent(student),
    results: results.map(({ row, ...r }) => r),
    attendance: { ...attendanceTotals, recent: days.slice(-30).reverse() },
    fees: { monthlyFee: fees.monthlyFee, totalDue: fees.totalDue, admission: fees.admission, months: fees.months.slice(0, 6) },
  });
});

router.patch('/:id', async (req, res) => {
  assertObjectId(req.params.id);
  const data = parsePatch(studentSchema, req.body);
  const student = await Student.findById(req.params.id);
  if (!student) throw new HttpError(404, 'Student not found');
  if (data.batch && String(data.batch) !== String(student.batch)) {
    const batch = await loadBatch(data.batch);
    if (String(batch.program._id) !== String(student.program)) {
      throw new HttpError(400, 'Student can only move to a batch of the same program');
    }
  }
  Object.assign(student, data);
  await student.save();
  res.json(publicStudent(student));
});

router.post('/:id/photo', imageUpload, async (req, res) => {
  assertObjectId(req.params.id);
  if (!req.file) throw new HttpError(400, 'Choose a photo');
  const student = await Student.findById(req.params.id);
  if (!student) throw new HttpError(404, 'Student not found');
  student.photo = await uploadStudentPhoto(req.file.buffer, student.studentId, student.photo?.publicId);
  await student.save();
  res.json({ photoUrl: photoUrl(student.photo) });
});

router.post('/:id/reset-password', async (req, res) => {
  assertObjectId(req.params.id);
  const student = await Student.findById(req.params.id);
  if (!student) throw new HttpError(404, 'Student not found');
  const tempPassword = generateTempPassword();
  student.passwordHash = await bcrypt.hash(tempPassword, 10);
  student.mustChangePassword = true;
  await student.save();
  res.json({ studentId: student.studentId, tempPassword });
});

export default router;
