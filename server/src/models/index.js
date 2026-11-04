import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const ObjectId = Schema.Types.ObjectId;

const adminSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    // admin: everything. teacher: attendance, exams, notices, calendar (no fees, backup or team)
    role: { type: String, enum: ['admin', 'teacher'], default: 'admin' },
    mustChangePassword: { type: Boolean, default: false },
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
    mode: { type: String, enum: ['google_form', 'offline', 'online'], required: true },
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
    // Online MCQ exam taken on this website
    mcq: [
      {
        _id: false,
        text: { type: String, required: true },
        options: [String],
        answer: Number, // index into options
        chapter: { type: String, default: '' },
        explanation: { type: String, default: '' },
      },
    ],
    opensAt: Date,
    closesAt: Date,
    durationMinutes: { type: Number, min: 1, max: 600, default: 30 },
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
    source: { type: String, enum: ['sheet', 'csv', 'manual', 'online'], required: true },
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

const inquirySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    guardianPhone: { type: String, trim: true, default: '' },
    program: { type: ObjectId, ref: 'Program' },
    college: { type: String, trim: true, default: '' },
    message: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['new', 'called', 'admitted', 'closed'], default: 'new' },
    note: { type: String, trim: true, default: '' }, // admin's own note
  },
  { timestamps: true },
);
inquirySchema.index({ status: 1, createdAt: -1 });

// Students shown on the public Achievements page (only with permission)
const achievementSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    result: { type: String, required: true, trim: true }, // e.g. "Dhaka Medical College"
    year: { type: String, trim: true, default: '' },
    quote: { type: String, trim: true, default: '' },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// One student's sitting of an online exam
const attemptSchema = new Schema(
  {
    exam: { type: ObjectId, ref: 'Exam', required: true },
    student: { type: ObjectId, ref: 'Student', required: true },
    startedAt: { type: Date, required: true },
    deadline: { type: Date, required: true },
    answers: [{ type: Number, default: null }], // chosen option index per question, null = skipped
    submittedAt: Date,
    marks: Number,
    correct: Number,
    wrong: Number,
  },
  { timestamps: true },
);
attemptSchema.index({ exam: 1, student: 1 }, { unique: true });

// Lecture sheets, class notes, recorded classes: links to Google Drive / YouTube / PDF
const materialSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    kind: { type: String, enum: ['sheet', 'video', 'link'], default: 'sheet' },
    url: { type: String, required: true, trim: true },
    note: { type: String, trim: true, default: '' },
    program: { type: ObjectId, ref: 'Program', required: true },
    batches: [{ type: ObjectId, ref: 'Batch' }], // empty = every batch of the program
    chapter: { type: String, trim: true, default: '' },
    addedBy: { type: ObjectId, ref: 'Admin' },
  },
  { timestamps: true },
);
materialSchema.index({ program: 1, createdAt: -1 });

// Money going out (rent, teacher salary...), to see income vs expense
const expenseSchema = new Schema(
  {
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    category: { type: String, enum: ['rent', 'salary', 'utilities', 'materials', 'marketing', 'other'], required: true },
    amount: { type: Number, required: true, min: 1 },
    paidTo: { type: String, trim: true, default: '' },
    note: { type: String, trim: true, default: '' },
    addedBy: { type: ObjectId, ref: 'Admin' },
  },
  { timestamps: true },
);
expenseSchema.index({ date: -1 });

// Every SMS the app tried to send (newest first on the SMS page)
const smsLogSchema = new Schema(
  {
    to: { type: String, required: true }, // 8801XXXXXXXXX
    message: { type: String, required: true },
    kind: { type: String, enum: ['absent', 'result', 'payment', 'manual', 'test', 'reset', 'due'], required: true },
    status: { type: String, enum: ['sent', 'failed'], required: true },
    error: { type: String, default: '' },
    requestId: { type: String, default: '' },
    student: { type: ObjectId, ref: 'Student', default: null },
    // What the SMS was about (e.g. "absent:<batch>:2026-11-03"), so the same news is never sent twice
    ref: { type: String, default: '' },
  },
  { timestamps: true },
);
smsLogSchema.index({ createdAt: -1 });
smsLogSchema.index({ ref: 1, student: 1 });

// Small key/value store for app-wide facts (e.g. when the last backup was taken)
const settingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    value: Schema.Types.Mixed,
  },
  { timestamps: true },
);

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
export const Setting = model('Setting', settingSchema);
export const Inquiry = model('Inquiry', inquirySchema);
export const Achievement = model('Achievement', achievementSchema);
export const SmsLog = model('SmsLog', smsLogSchema);
export const Attempt = model('Attempt', attemptSchema);
export const Material = model('Material', materialSchema);
export const Expense = model('Expense', expenseSchema);
