import { sheets as sheetsApi, auth } from '@googleapis/sheets';
import { parse as parseCsv } from 'csv-parse/sync';
import { env, googleEnabled } from '../config/env.js';
import { HttpError } from '../utils/http.js';

let client;
function getClient() {
  if (!googleEnabled) {
    throw new HttpError(
      503,
      'Google Sheets is not set up yet (add GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY to .env). You can upload a CSV instead.',
    );
  }
  if (!client) {
    const googleAuth = new auth.GoogleAuth({
      credentials: { client_email: env.google.email, private_key: env.google.privateKey },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    client = sheetsApi({ version: 'v4', auth: googleAuth });
  }
  return client;
}

/** Accepts a full Google Sheets link or a bare spreadsheet ID. */
export function extractSheetId(input) {
  const text = String(input ?? '').trim();
  const fromUrl = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (fromUrl) return fromUrl[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(text)) return text;
  throw new HttpError(400, 'That does not look like a Google Sheets link');
}

/** Returns all rows (array of arrays). Uses the first tab when no range is given. */
export async function readSheet(sheetId, range) {
  const sheets = getClient();
  try {
    let target = range;
    if (!target) {
      const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: 'sheets.properties.title' });
      target = meta.data.sheets?.[0]?.properties?.title;
    }
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: target });
    return { rows: res.data.values || [], range: target };
  } catch (err) {
    const status = err?.code || err?.response?.status;
    if (status === 403 || status === 404) {
      throw new HttpError(
        400,
        `Cannot open this sheet. Share it with ${env.google.email} as Viewer, then try again.`,
      );
    }
    if (status === 400) throw new HttpError(400, `Google Sheets error: ${err.message}`);
    throw err;
  }
}

export function readCsv(buffer) {
  try {
    return parseCsv(buffer, { bom: true, relax_column_count: true, skip_empty_lines: true, trim: true });
  } catch (err) {
    throw new HttpError(400, `Could not read the CSV file: ${err.message}`);
  }
}

/** Split rows into headers + body and guess which columns hold the Student ID and score. */
export function describeRows(rows) {
  if (!rows.length) throw new HttpError(400, 'The sheet is empty');
  const headers = rows[0].map((h) => String(h ?? '').trim());
  const body = rows.slice(1).filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''));
  const find = (pattern) => headers.findIndex((h) => pattern.test(h));
  return {
    headers,
    body,
    guess: {
      studentId: find(/student\s*id|roll|registration|\bid\b/i),
      score: find(/^score$|total\s*score|marks?|obtained/i),
    },
  };
}
