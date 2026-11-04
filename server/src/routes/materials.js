import { Router } from 'express';
import { z } from 'zod';
import { Batch, Material, Program } from '../models/index.js';
import { HttpError, assertObjectId, parse, parsePatch } from '../utils/http.js';

// Lecture sheets, notes and recorded classes. Admins and teachers can add them.
const router = Router();
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const fields = z.object({
  title: z.string().trim().min(2, 'Write a title').max(150),
  kind: z.enum(['sheet', 'video', 'link']).default('sheet'),
  url: z
    .string()
    .trim()
    .max(1000)
    .refine((v) => /^https:\/\/\S+$/.test(v), 'Paste a link that starts with https:// (Google Drive, YouTube...)'),
  note: z.string().trim().max(500).default(''),
  chapter: z.string().trim().max(80).default(''),
  program: objectId,
  batches: z.array(objectId).max(50).default([]),
});

async function check(program, batches) {
  if (!(await Program.exists({ _id: program }))) throw new HttpError(400, 'Program not found');
  if (batches.length && (await Batch.countDocuments({ _id: { $in: batches }, program })) !== new Set(batches).size) {
    throw new HttpError(400, 'All batches must belong to the chosen program');
  }
}

router.get('/', async (req, res) => {
  const filter = {};
  if (req.query.program) {
    assertObjectId(req.query.program, 'program');
    filter.program = req.query.program;
  }
  const items = await Material.find(filter).populate('program', 'name').populate('batches', 'name').sort({ createdAt: -1 }).limit(500).lean();
  res.json(items);
});

router.post('/', async (req, res) => {
  const data = parse(fields, req.body);
  await check(data.program, data.batches);
  res.status(201).json(await Material.create({ ...data, addedBy: req.user.id }));
});

router.patch('/:id', async (req, res) => {
  assertObjectId(req.params.id);
  const item = await Material.findById(req.params.id);
  if (!item) throw new HttpError(404, 'Not found');
  const data = parsePatch(fields, req.body);
  await check(data.program || item.program, data.batches || item.batches.map(String));
  Object.assign(item, data);
  await item.save();
  res.json(item);
});

router.delete('/:id', async (req, res) => {
  assertObjectId(req.params.id);
  await Material.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
});

export default router;
