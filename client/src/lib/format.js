const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function formatDate(value) {
  if (!value) return '';
  return dateFmt.format(new Date(value));
}

export function toDateInput(value) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

/** "16:30" → "4:30 pm" */
export function formatTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function schedule(batch) {
  if (!batch) return '';
  const days = batch.days?.length ? batch.days.join(', ') : '';
  const time = batch.startTime ? `${formatTime(batch.startTime)}${batch.endTime ? ` – ${formatTime(batch.endTime)}` : ''}` : '';
  return [days, time].filter(Boolean).join(', ');
}

export function ordinal(n) {
  if (n === null || n === undefined) return '';
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;
}

export function num(value, digits = 1) {
  if (value === null || value === undefined) return '–';
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

/** Download rows as a CSV file (used for student login sheets). */
export function downloadCsv(filename, rows) {
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const text = rows.map((row) => row.map(escape).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Dates in Bangladesh time ----------
const dhakaYmd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Today's date in Dhaka as "2026-11-03". */
export function today() {
  return dhakaYmd.format(new Date());
}

export function thisMonth() {
  return today().slice(0, 7);
}

/** "2026-11" → "November 2026" */
export function monthLabel(month, short = false) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleString('en-GB', { month: short ? 'short' : 'long', year: 'numeric', timeZone: 'UTC' });
}

/** shiftMonth("2026-01", -1) → "2025-12" */
export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** "2026-11-03" → "Tue, 3 Nov" */
export function dayLabel(date, withYear = false) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(withYear && { year: 'numeric' }),
    timeZone: 'UTC',
  });
}

const takaFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** 12500 → "৳12,500" */
export function taka(value) {
  return `৳${takaFmt.format(value || 0)}`;
}
