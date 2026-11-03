import { Router } from 'express';
import { z } from 'zod';
import { Batch, Event, Exam, Notice } from '../models/index.js';
import { HttpError, assertObjectId, parse, parsePatch } from '../utils/http.js';
import { DATE_RE, localDate } from '../utils/helpers.js';

const router = Router();
const objectId = z.string().refine((v) => /^[a-f\d]{24}$/i.test(v), 'Invalid id');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24h time like 16:30').or(z.literal(''));

// ---------- Notices ----------
const noticeSchema = z
  .object({
    title: z.string().trim().min(2, 'Title is too short').max(150),
    body: z.string().trim().max(5000).default(''),
    audience: z.enum(['all', 'program', 'batch']).default('all'),
    programs: z.array(objectId).default([]),
    batches: z.array(objectId).default([]),
    pinned: z.boolean().default(false),
  })
  .refine((n) => n.audience !== 'program' || n.programs.length, { message: 'Pick at least one program', path: ['programs'] })
  .refine((n) => n.audience !== 'batch' || n.batches.length, { message: 'Pick at least one batch', path: ['batches'] });

function cleanTargets(data) {
  return {
    ...data,
    programs: data.audience === 'program' ? data.programs : [],
    batches: data.audience === 'batch' ? data.batches : [],
  };
}

router.get('/notices', async (req, res) => {
  const notices = await Notice.find()
    .populate('programs', 'name')
    .populate('batches', 'name')
    .sort({ pinned: -1, createdAt: -1 })
    .limit(200)
    .lean();
  res.json(notices);
});

router.post('/notices', async (req, res) => {
  res.status(201).json(await Notice.create(cleanTargets(parse(noticeSchema, req.body))));
});

router.patch('/notices/:id', async (req, res) => {
  assertObjectId(req.params.id);
  const notice = await Notice.findById(req.params.id);
  if (!notice) throw new HttpError(404, 'Notice not found');
  // Merge the saved notice with what was sent, then validate the whole thing
  const current = {
    title: notice.title,
    body: notice.body,
    audience: notice.audience,
    programs: notice.programs.map(String),
    batches: notice.batches.map(String),
    pinned: notice.pinned,
  };
  const sent = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => key in current));
  const data = cleanTargets(parse(noticeSchema, { ...current, ...sent }));
  Object.assign(notice, data);
  await notice.save();
  res.json(notice);
});

router.delete('/notices/:id', async (req, res) => {
  assertObjectId(req.params.id);
  await Notice.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// ---------- Calendar ----------
const eventFields = z.object({
  title: z.string().trim().min(2).max(150),
  type: z.enum(['class', 'exam', 'holiday', 'other']).default('other'),
  date: z.string().regex(DATE_RE, 'Pick a date'),
  startTime: time.default(''),
  endTime: time.default(''),
  batches: z.array(objectId).default([]),
  note: z.string().trim().max(1000).default(''),
});

/**
 * Calendar items between two dates: custom events plus every exam (exams are
 * created on the Exams page, so they show up here automatically).
 */
export async function calendarItems({ from, to, batchIds }) {
  const eventFilter = { date: { $gte: from, $lte: to } };
  if (batchIds) eventFilter.$or = [{ batches: { $size: 0 } }, { batches: { $in: batchIds } }];
  const events = await Event.find(eventFilter).populate('batches', 'name').lean();

  const examFilter = { date: { $gte: new Date(`${from}T00:00:00+06:00`), $lte: new Date(`${to}T23:59:59+06:00`) } };
  if (batchIds) examFilter.batches = { $in: batchIds };
  const exams = await Exam.find(examFilter).select('title date batches status totalMarks').populate('batches', 'name').lean();

  return [
    ...events.map((e) => ({ ...e, kind: 'event' })),
    ...exams.map((e) => ({
      _id: e._id,
      kind: 'exam',
      type: 'exam',
      title: e.title,
      date: localDate(e.date),
      batches: e.batches,
      status: e.status,
      note: `Out of ${e.totalMarks}`,
    })),
  ].sort((a, b) => (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || '')));
}

router.get('/events', async (req, res) => {
  const from = req.query.from;
  const to = req.query.to;
  if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '')) throw new HttpError(400, 'Give from and to dates');
  let batchIds;
  if (req.query.batch) {
    assertObjectId(req.query.batch, 'batch');
    batchIds = [req.query.batch];
  }
  res.json(await calendarItems({ from, to, batchIds }));
});

async function checkBatches(ids) {
  if (!ids.length) return;
  const count = await Batch.countDocuments({ _id: { $in: ids } });
  if (count !== new Set(ids).size) throw new HttpError(400, 'Some batches were not found');
}

router.post('/events', async (req, res) => {
  const data = parse(eventFields, req.body);
  await checkBatches(data.batches);
  res.status(201).json(await Event.create(data));
});

router.patch('/events/:id', async (req, res) => {
  assertObjectId(req.params.id);
  const data = parsePatch(eventFields, req.body);
  if (data.batches) await checkBatches(data.batches);
  const event = await Event.findByIdAndUpdate(req.params.id, data, { returnDocument: 'after', runValidators: true });
  if (!event) throw new HttpError(404, 'Event not found');
  res.json(event);
});

router.delete('/events/:id', async (req, res) => {
  assertObjectId(req.params.id);
  await Event.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

export default router;
