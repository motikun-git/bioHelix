import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Achievement, Batch, Inquiry, Program, Setting, Student } from '../models/index.js';
import { HttpError, assertObjectId, parse, parsePatch } from '../utils/http.js';
import { BD_PHONE, normalizePhone } from '../utils/helpers.js';

// What the public website shows by default, until an admin edits it
export const DEFAULT_SITE = {
  tagline: 'Biology is easy if you know how much to read.',
  about:
    'BioHelix Academic and Admission is an offline coaching for HSC Biology and the Medical Admission Test. Small batches, a clear plan for exactly how much to read, and regular exams with detailed results.',
  phone: '',
  whatsapp: '',
  email: '',
  address: 'Dhaka 1219, Bangladesh',
  mapUrl: '',
  facebook: '',
  admissionOpen: true,
  admissionNote: '',
  showFees: true,
  showMeritList: true, // top 10 names on each published result in the student portal
};

export async function getSite() {
  const doc = await Setting.findOne({ key: 'site' }).lean();
  return { ...DEFAULT_SITE, ...(doc?.value || {}) };
}

const phone = (required) =>
  z
    .string()
    .optional()
    .transform((v) => normalizePhone(v))
    .refine((v) => (required ? BD_PHONE.test(v) : v === '' || BD_PHONE.test(v)), 'Enter a Bangladeshi mobile number like 01712345678');

// ================= Public (no login) =================
export const publicRouter = Router();

publicRouter.get('/site', async (req, res) => {
  const site = await getSite();
  const [programs, batches, achievements] = await Promise.all([
    Program.find().sort({ code: 1 }).lean(),
    Batch.find({ isActive: true }).sort({ name: 1 }).lean(),
    Achievement.find().sort({ order: 1, createdAt: -1 }).lean(),
  ]);
  const counts = await Student.aggregate([
    { $match: { batch: { $in: batches.map((b) => b._id) }, status: 'active' } },
    { $group: { _id: '$batch', count: { $sum: 1 } } },
  ]);
  const countBy = new Map(counts.map((c) => [String(c._id), c.count]));
  res.set('Cache-Control', 'public, max-age=60');
  res.json({
    site,
    programs: programs.map((p) => ({
      _id: p._id,
      name: p.name,
      batches: batches
        .filter((b) => String(b.program) === String(p._id))
        .map((b) => ({
          name: b.name,
          session: b.session,
          days: b.days,
          startTime: b.startTime,
          endTime: b.endTime,
          ...(site.showFees && { admissionFee: b.admissionFee, monthlyFee: b.monthlyFee }),
          seatsLeft: b.capacity > 0 ? Math.max(0, b.capacity - (countBy.get(String(b._id)) || 0)) : null,
        })),
    })),
    achievements: achievements.map(({ name, result, year, quote, _id }) => ({ _id, name, result, year, quote })),
  });
});

// 5 inquiries per hour per network, so the form can't be used to flood the list
const inquiryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many requests. Please call or WhatsApp us instead.' },
});

publicRouter.post('/inquiries', inquiryLimiter, async (req, res) => {
  // Hidden "website" field: people never fill it, spam bots do
  if (req.body?.website) return res.status(201).json({ ok: true });
  const site = await getSite();
  if (!site.admissionOpen) throw new HttpError(400, 'Admission is closed right now.');
  const data = parse(
    z.object({
      name: z.string().trim().min(2, 'Enter the student’s name').max(100),
      phone: phone(true),
      guardianPhone: phone(false),
      program: z.string().refine((v) => /^[a-f\d]{24}$/i.test(v), 'Pick a program').optional(),
      college: z.string().trim().max(120).default(''),
      message: z.string().trim().max(1000).default(''),
    }),
    req.body,
  );
  if (data.program && !(await Program.exists({ _id: data.program }))) delete data.program;
  await Inquiry.create(data);
  res.status(201).json({ ok: true });
});

// ================= Admin =================
export const siteAdminRouter = Router();

const siteSchema = z.object({
  tagline: z.string().trim().max(160),
  about: z.string().trim().max(3000),
  phone: z.string().trim().max(40),
  whatsapp: z.string().trim().max(40),
  email: z.string().trim().max(120),
  address: z.string().trim().max(300),
  mapUrl: z.string().trim().max(500).refine((v) => v === '' || /^https:\/\//.test(v), 'Map link must start with https://'),
  facebook: z.string().trim().max(300).refine((v) => v === '' || /^https:\/\//.test(v), 'Facebook link must start with https://'),
  admissionOpen: z.boolean(),
  admissionNote: z.string().trim().max(300),
  showFees: z.boolean(),
  showMeritList: z.boolean(),
});

siteAdminRouter.get('/', async (req, res) => {
  res.json(await getSite());
});

siteAdminRouter.put('/', async (req, res) => {
  const data = parsePatch(siteSchema, req.body);
  const value = { ...(await getSite()), ...data };
  await Setting.updateOne({ key: 'site' }, { $set: { value } }, { upsert: true });
  res.json(value);
});

const achievementSchema = z.object({
  name: z.string().trim().min(2).max(100),
  result: z.string().trim().min(2).max(150),
  year: z.string().trim().max(20).default(''),
  quote: z.string().trim().max(300).default(''),
  order: z.coerce.number().int().min(0).max(10000).default(0),
});

siteAdminRouter.get('/achievements', async (req, res) => {
  res.json(await Achievement.find().sort({ order: 1, createdAt: -1 }).lean());
});
siteAdminRouter.post('/achievements', async (req, res) => {
  res.status(201).json(await Achievement.create(parse(achievementSchema, req.body)));
});
siteAdminRouter.patch('/achievements/:id', async (req, res) => {
  assertObjectId(req.params.id);
  const a = await Achievement.findByIdAndUpdate(req.params.id, parsePatch(achievementSchema, req.body), { returnDocument: 'after', runValidators: true });
  if (!a) throw new HttpError(404, 'Not found');
  res.json(a);
});
siteAdminRouter.delete('/achievements/:id', async (req, res) => {
  assertObjectId(req.params.id);
  await Achievement.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// ----- Admission inquiries -----
export const inquiryRouter = Router();

inquiryRouter.get('/', async (req, res) => {
  const filter = {};
  if (['new', 'called', 'admitted', 'closed'].includes(req.query.status)) filter.status = req.query.status;
  const items = await Inquiry.find(filter).populate('program', 'name').sort({ createdAt: -1 }).limit(300).lean();
  const newCount = await Inquiry.countDocuments({ status: 'new' });
  res.json({ items, newCount });
});

inquiryRouter.patch('/:id', async (req, res) => {
  assertObjectId(req.params.id);
  const data = parsePatch(z.object({ status: z.enum(['new', 'called', 'admitted', 'closed']), note: z.string().trim().max(1000) }), req.body);
  const item = await Inquiry.findByIdAndUpdate(req.params.id, data, { returnDocument: 'after', runValidators: true });
  if (!item) throw new HttpError(404, 'Inquiry not found');
  res.json(item);
});

inquiryRouter.delete('/:id', async (req, res) => {
  assertObjectId(req.params.id);
  await Inquiry.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});
