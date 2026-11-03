import crypto from 'node:crypto';
import { Counter } from '../models/index.js';

// No 0/O, 1/l/i so passwords are easy to read out to students
const PASSWORD_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';

export function generateTempPassword(length = 8) {
  let out = '';
  for (let i = 0; i < length; i += 1) out += PASSWORD_CHARS[crypto.randomInt(PASSWORD_CHARS.length)];
  return out;
}

/** BH-{programCode}{yy}-{serial}, e.g. BH-H26-0042. Serial restarts per program per year. */
export async function nextStudentId(programCode, date = new Date()) {
  const yy = String(date.getFullYear()).slice(-2);
  const counter = await Counter.findOneAndUpdate(
    { name: `student-${programCode}-${yy}` },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  );
  return `BH-${programCode}${yy}-${String(counter.seq).padStart(4, '0')}`;
}

export function normalizeStudentId(value) {
  return String(value ?? '').toUpperCase().replace(/\s+/g, '').trim();
}

/** "01712-345678", "+8801712345678" → "01712345678". Returns '' for empty input. */
export function normalizePhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('880') ? `0${digits.slice(3)}` : digits;
}

export const BD_PHONE = /^01[3-9]\d{8}$/;

/** Google Form quiz scores look like "18 / 25"; take the first number. */
export function parseScore(value) {
  const match = String(value ?? '').match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------- Dates (always in Bangladesh time, even if the server runs in UTC) ----------
export const TIME_ZONE = 'Asia/Dhaka';
const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** "2026-11-03" for a Date (default: now) in Dhaka time. */
export function localDate(date = new Date()) {
  return ymd.format(date);
}

/** "2026-11" in Dhaka time. */
export function localMonth(date = new Date()) {
  return localDate(date).slice(0, 7);
}

export const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Every month from start to end inclusive: ("2026-10", "2026-12") → ["2026-10", "2026-11", "2026-12"] */
export function monthsBetween(start, end) {
  const out = [];
  let [y, m] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m === 13) {
      m = 1;
      y += 1;
    }
    if (out.length > 120) break;
  }
  return out;
}

/** First and last date of a month: "2026-02" → ["2026-02-01", "2026-02-28"] */
export function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [`${month}-01`, `${month}-${String(last).padStart(2, '0')}`];
}
