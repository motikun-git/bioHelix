import { env, smsEnabled } from '../config/env.js';
import { Batch, Exam, Result, Setting, SmsLog, Student } from '../models/index.js';
import { normalizePhone } from '../utils/helpers.js';

/**
 * SMS through sms.net.bd (Alpha SMS). Nothing is sent until SMS_API_KEY is set.
 * API: https://api.sms.net.bd/sendsms  (api_key, msg, to, sender_id)
 */
const API = 'https://api.sms.net.bd';

export const SMS_DEFAULTS = {
  onAbsent: false, // tell the guardian when the student is marked absent
  onResult: false, // send marks + merit position when an exam is published
  onPayment: false, // confirm a fee payment with the receipt number
  sendTo: 'guardian', // guardian | student | both
};

export async function smsSettings() {
  const doc = await Setting.findOne({ key: 'sms' }).lean();
  return { ...SMS_DEFAULTS, ...(doc?.value || {}) };
}

export async function saveSmsSettings(value) {
  const merged = { ...(await smsSettings()), ...value };
  await Setting.updateOne({ key: 'sms' }, { $set: { value: merged } }, { upsert: true });
  return merged;
}

/** "01712345678" → "8801712345678"; null if it isn't a Bangladeshi mobile number. */
export function toMsisdn(phone) {
  const local = normalizePhone(phone);
  return /^01[3-9]\d{8}$/.test(local) ? `88${local}` : null;
}

/** "8801712345678" → "01712•••678" (shown on the forgot-password page). */
export function maskPhone(phone) {
  const local = normalizePhone(phone);
  return local.length === 11 ? `${local.slice(0, 5)}•••${local.slice(8)}` : '';
}

/** Which phone numbers of this student get an SMS. */
export function recipients(student, sendTo = 'guardian') {
  const list =
    sendTo === 'student'
      ? [student.phone]
      : sendTo === 'both'
        ? [student.guardianPhone, student.phone]
        : [student.guardianPhone || student.phone]; // no guardian number: the student's own
  return [...new Set(list.map(toMsisdn).filter(Boolean))];
}

async function callApi(path, params) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ api_key: env.sms.apiKey, ...params }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({ error: res.status, msg: `HTTP ${res.status}` }));
  if (data.error !== 0) throw new Error(`SMS gateway: ${data.msg || `error ${data.error}`}`);
  return data;
}

/** Send one text to one number and log it. Never throws; returns the log entry. */
export async function sendOne({ to, message, kind, student = null, ref = '', logMessage = message }) {
  // logMessage: what goes into the log (password codes are hidden, except in test mode)
  const entry = { to, message: env.sms.dryRun ? message : logMessage, kind, student, ref, status: 'sent', error: '', requestId: '' };
  if (!smsEnabled) {
    entry.status = 'failed';
    entry.error = 'SMS is not set up (SMS_API_KEY missing)';
  } else if (env.sms.dryRun) {
    entry.requestId = 'dry-run';
  } else {
    try {
      const params = { msg: message, to };
      if (env.sms.senderId) params.sender_id = env.sms.senderId;
      const data = await callApi('/sendsms', params);
      entry.requestId = String(data.data?.request_id ?? '');
    } catch (err) {
      entry.status = 'failed';
      entry.error = err.message.slice(0, 300);
    }
  }
  return SmsLog.create(entry);
}

/** Send the same news to many students, skipping anyone who already got it (same ref). */
export async function sendToStudents(students, { kind, ref = '', sendTo = 'guardian', text }) {
  const already = ref
    ? new Set((await SmsLog.find({ ref, status: 'sent' }).select('student').lean()).map((l) => String(l.student)))
    : new Set();
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const student of students) {
    if (already.has(String(student._id))) {
      skipped += 1;
      continue;
    }
    const numbers = recipients(student, sendTo);
    if (!numbers.length) {
      skipped += 1;
      continue;
    }
    const message = typeof text === 'function' ? text(student) : text;
    for (const to of numbers) {
      const log = await sendOne({ to, message, kind, student: student._id, ref });
      if (log.status === 'sent') sent += 1;
      else failed += 1;
    }
  }
  return { sent, failed, skipped };
}

export async function smsBalance() {
  if (!env.sms.apiKey) return null;
  try {
    const data = await callApi('/user/balance/', {});
    return Number(data.data?.balance);
  } catch {
    return null;
  }
}

/** Bangla date "৩ নভেম্বর" for SMS text. */
function bnDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}
const bn = (n) => String(n).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);

// ---------- Automatic messages (run in the background, never break the request) ----------

function background(task) {
  if (!smsEnabled) return;
  setImmediate(() => task().catch((err) => console.error('SMS:', err.message)));
}

export function notifyAbsent(sheet) {
  background(async () => {
    const settings = await smsSettings();
    if (!settings.onAbsent) return;
    const absentIds = sheet.records.filter((r) => r.status === 'absent').map((r) => r.student);
    if (!absentIds.length) return;
    const students = await Student.find({ _id: { $in: absentIds }, status: 'active' }).select('name phone guardianPhone').lean();
    await sendToStudents(students, {
      kind: 'absent',
      ref: `absent:${sheet.batch}:${sheet.date}`,
      sendTo: settings.sendTo,
      text: (s) => `BioHelix: ${s.name} ${bnDate(sheet.date)} তারিখের ক্লাসে অনুপস্থিত ছিল।`,
    });
  });
}

export function notifyResult(examId) {
  background(async () => {
    const settings = await smsSettings();
    if (!settings.onResult) return;
    const exam = await Exam.findById(examId).select('title totalMarks').lean();
    const results = await Result.find({ exam: examId, isAbsent: false, marks: { $ne: null } })
      .populate('student', 'name phone guardianPhone status')
      .lean();
    const sat = results.length;
    const link = env.publicUrl ? ` ${env.publicUrl}/login` : '';
    await sendToStudents(
      results.filter((r) => r.student?.status === 'active').map((r) => ({ ...r.student, result: r })),
      {
        kind: 'result',
        ref: `result:${examId}`,
        sendTo: settings.sendTo,
        text: (s) =>
          `BioHelix ${exam.title}: ${s.name} পেয়েছে ${bn(s.result.marks)}/${bn(exam.totalMarks)}, মেধাক্রম ${bn(s.result.rank)}/${bn(sat)}।${link}`,
      },
    );
  });
}

const KIND_BN = { admission: 'ভর্তি ফি', monthly: 'মাসিক ফি', other: 'ফি' };

export function notifyPayment(payment) {
  background(async () => {
    const settings = await smsSettings();
    if (!settings.onPayment) return;
    const student = await Student.findById(payment.student).select('name phone guardianPhone').lean();
    if (!student) return;
    await sendToStudents([student], {
      kind: 'payment',
      ref: `payment:${payment._id}`,
      sendTo: settings.sendTo,
      text: `BioHelix: ${student.name} এর ${KIND_BN[payment.kind]} ${bn(payment.amount)} টাকা পাওয়া গেছে। রসিদ ${payment.receiptNo}। ধন্যবাদ।`,
    });
  });
}

/** Students of a batch (or of all active batches) for a manual SMS. */
export async function studentsForBulk({ batch, program }) {
  const filter = { status: 'active' };
  if (batch) filter.batch = batch;
  else if (program) filter.batch = { $in: await Batch.find({ program }).distinct('_id') };
  return Student.find(filter).select('name phone guardianPhone').lean();
}
