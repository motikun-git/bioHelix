import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const ObjectId = Schema.Types.ObjectId;

const adminSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    lastLoginAt: Date,
  },
  { timestamps: true },
);

const programSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    // One letter, used inside the Student ID: BH-H26-0001
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, match: /^[A-Z]$/ },
  },
  { timestamps: true },
);

const batchSchema = new Schema(
  {
    program: { type: ObjectId, ref: 'Program', required: true },
    name: { type: String, required: true, trim: true },
    session: { type: String, trim: true, default: '' },
    days: [{ type: String, enum: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'] }],
    startTime: { type: String, default: '' }, // "16:00"
    endTime: { type: String, default: '' },
    capacity: { type: Number, min: 0, default: 0 },
    isActive: { type: Boolean, default: true },
    // Fees (BDT). Monthly fee is charged from each student's admission month.
    admissionFee: { type: Number, min: 0, default: 0 },
    monthlyFee: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true },
);

const studentSchema = new Schema(
  {
    studentId: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    photo: { publicId: String, version: Number },
    phone: { type: String, trim: true, default: '' },
    guardianName: { type: String, trim: true, default: '' },
    guardianPhone: { type: String, trim: true, default: '' },
    college: { type: String, trim: true, default: '' },
    program: { type: ObjectId, ref: 'Program', required: true },
    batch: { type: ObjectId, ref: 'Batch', required: true },
    session: { type: String, trim: true, default: '' },
    admissionDate: { type: Date, default: Date.now },
    status: { type: String, enum: ['active', 'inactive', 'completed'], default: 'active' },
    // null = use the batch's monthly fee (set a lower number for a scholarship)
    monthlyFee: { type: Number, min: 0, default: null },
    passwordHash: { type: String, required: true },
    mustChangePassword: { type: Boolean, default: true },
  },
  { timestamps: true },
);
studentSchema.index({ batch: 1, status: 1 });
studentSchema.index({ name: 'text' });

const counterSchema = new Schema({
  name: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
});

const examSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    program: { type: ObjectId, ref: 'Program', required: true },
    batches: [{ type: ObjectId, ref: 'Batch', required: true }],
    date: { type: Date, required: true },
    mode: { type: String, enum: ['google_form', 'offline'], required: true },
    totalMarks: { type: Number, required: true, min: 1 },
    passMarks: { type: Number, min: 0, default: 0 },
    negativeMark: { type: Number, min: 0, default: 0 },
    sheetId: { type: String, default: '' },
    sheetRange: { type: String, default: '' },
    columnMap: { studentId: Number, score: Number },
    // Header row of the last imported sheet/CSV, used to set up question analysis
    sheetHeaders: [String],
    // Question analysis: which sheet column is which question, its answer and chapter
    questions: [{ _id: false, column: Number, text: String, answer: String, chapter: String }],
    status: { type: String, enum: ['draft', 'imported', 'published'], default: 'draft' },
    publishedAt: Date,
    lastImport: {
      at: Date,
      imported: Number,
      absent: Number,
      unmatched: [{ row: Number, value: String }],
      duplicates: [{ row: Number, value: String }],
      invalid: [{ row: Number, value: String, reason: String }],
    },
  },
  { timestamps: true },
);
examSchema.index({ program: 1, date: -1 });

const resultSchema = new Schema(
  {
    exam: { type: ObjectId, ref: 'Exam', required: true },
    student: { type: ObjectId, ref: 'Student', required: true },
    marks: { type: Number, default: null },
    isAbsent: { type: Boolean, default: false },
    rank: { type: Number, default: null },
    source: { type: String, enum: ['sheet', 'csv', 'manual'], required: true },
    // The student's full response row from the sheet (for question-wise analysis)
    row: [String],
  },
  { timestamps: true },
);
resultSchema.index({ exam: 1, student: 1 }, { unique: true });
resultSchema.index({ student: 1 });

const attendanceSchema = new Schema(
  {
    batch: { type: ObjectId, ref: 'Batch', required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, // local date, "2026-11-03"
    records: [
      {
        _id: false,
        student: { type: ObjectId, ref: 'Student', required: true },
        status: { type: String, enum: ['present', 'absent', 'late'], required: true },
      },
    ],
    takenBy: { type: ObjectId, ref: 'Admin' },
  },
  { timestamps: true },
);
attendanceSchema.index({ batch: 1, date: 1 }, { unique: true });
attendanceSchema.index({ 'records.student': 1, date: 1 });

const noticeSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, trim: true, default: '' },
    audience: { type: String, enum: ['all', 'program', 'batch'], default: 'all' },
    programs: [{ type: ObjectId, ref: 'Program' }],
    batches: [{ type: ObjectId, ref: 'Batch' }],
    pinned: { type: Boolean, default: false },
  },
  { timestamps: true },
);
noticeSchema.index({ pinned: -1, createdAt: -1 });

const eventSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: ['class', 'exam', 'holiday', 'other'], default: 'other' },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    startTime: { type: String, default: '' },
    endTime: { type: String, default: '' },
    batches: [{ type: ObjectId, ref: 'Batch' }], // empty = everyone
    note: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
);
eventSchema.index({ date: 1 });

const paymentSchema = new Schema(
  {
    student: { type: ObjectId, ref: 'Student', required: true },
    kind: { type: String, enum: ['admission', 'monthly', 'other'], required: true },
    month: { type: String, match: /^\d{4}-\d{2}$/ }, // for monthly fees, "2026-11"
    amount: { type: Number, required: true, min: 0 },
    discount: { type: Number, min: 0, default: 0 },
    method: { type: String, enum: ['cash', 'bkash', 'nagad', 'bank'], default: 'cash' },
    trxId: { type: String, trim: true, default: '' },
    note: { type: String, trim: true, default: '' },
    receiptNo: { type: String, required: true, unique: true },
    paidAt: { type: Date, default: Date.now },
    receivedBy: { type: ObjectId, ref: 'Admin' },
  },
  { timestamps: true },
);
paymentSchema.index({ student: 1, kind: 1, month: 1 });
paymentSchema.index({ paidAt: -1 });

export const Admin = model('Admin', adminSchema);
export const Program = model('Program', programSchema);
export const Batch = model('Batch', batchSchema);
export const Student = model('Student', studentSchema);
export const Counter = model('Counter', counterSchema);
export const Exam = model('Exam', examSchema);
export const Result = model('Result', resultSchema);
export const Attendance = model('Attendance', attendanceSchema);
export const Notice = model('Notice', noticeSchema);
export const Event = model('Event', eventSchema);
export const Payment = model('Payment', paymentSchema);
