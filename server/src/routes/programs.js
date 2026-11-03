import { Router } from 'express';
import { z } from 'zod';
import { Batch, Program } from '../models/index.js';
import { HttpError, assertObjectId, parse, parsePatch } from '../utils/http.js';

const router = Router();

const DAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24h time like 16:30').or(z.literal(''));

// ---------- Programs ----------
router.get('/programs', async (req, res) => {
  res.json(await Program.find().sort({ code: 1 }).lean());
});

const programSchema = z.object({
  name: z.string().trim().min(2).max(80),
  code: z.string().trim().toUpperCase().regex(/^[A-Z]$/, 'Code must be one letter'),
});

router.post('/programs', async (req, res) => {
  res.status(201).json(await Program.create(parse(programSchema, req.body)));
});

router.patch('/programs/:id', async (req, res) => {
  assertObjectId(req.params.id);
  // Code is part of every Student ID already issued, so only the name can change
  const { name } = parse(programSchema.pick({ name: true }), req.body);
  const program = await Program.findByIdAndUpdate(req.params.id, { name }, { returnDocument: 'after' });
  if (!program) throw new HttpError(404, 'Program not found');
  res.json(program);
});

// ---------- Batches ----------
const batchSchema = z.object({
  program: z.string().refine((v) => /^[a-f\d]{24}$/i.test(v), 'Pick a program'),
  name: z.string().trim().min(1).max(80),
  session: z.string().trim().max(40).default(''),
  days: z.array(z.enum(DAYS)).default([]),
  startTime: time.default(''),
  endTime: time.default(''),
  capacity: z.coerce.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(true),
  admissionFee: z.coerce.number().min(0).max(1_000_000).default(0),
  monthlyFee: z.coerce.number().min(0).max(1_000_000).default(0),
});

router.get('/batches', async (req, res) => {
  const filter = {};
  if (req.query.program) {
    assertObjectId(req.query.program, 'program');
    filter.program = req.query.program;
  }
  if (req.query.active === 'true') filter.isActive = true;
  const batches = await Batch.find(filter).populate('program', 'name code').sort({ isActive: -1, name: 1 }).lean();
  const counts = await Batch.db.model('Student').aggregate([
    { $match: { batch: { $in: batches.map((b) => b._id) }, status: 'active' } },
    { $group: { _id: '$batch', count: { $sum: 1 } } },
  ]);
  const countBy = new Map(counts.map((c) => [String(c._id), c.count]));
  res.json(batches.map((b) => ({ ...b, studentCount: countBy.get(String(b._id)) || 0 })));
});

router.post('/batches', async (req, res) => {
  const data = parse(batchSchema, req.body);
  if (!(await Program.exists({ _id: data.program }))) throw new HttpError(400, 'Program not found');
  res.status(201).json(await Batch.create(data));
});

router.patch('/batches/:id', async (req, res) => {
  assertObjectId(req.params.id);
  const data = parsePatch(batchSchema, req.body);
  const batch = await Batch.findById(req.params.id);
  if (!batch) throw new HttpError(404, 'Batch not found');
  if (data.program && String(data.program) !== String(batch.program)) {
    const used = await Batch.db.model('Student').exists({ batch: batch._id });
    if (used) throw new HttpError(400, 'This batch has students, so its program cannot change');
  }
  Object.assign(batch, data);
  await batch.save();
  res.json(batch);
});

router.delete('/batches/:id', async (req, res) => {
  assertObjectId(req.params.id);
  const used = await Batch.db.model('Student').exists({ batch: req.params.id });
  if (used) throw new HttpError(400, 'This batch has students. Move them or mark the batch inactive instead.');
  const usedInExam = await Batch.db.model('Exam').exists({ batches: req.params.id });
  if (usedInExam) throw new HttpError(400, 'This batch has exams. Mark it inactive instead.');
  await Batch.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

export default router;
