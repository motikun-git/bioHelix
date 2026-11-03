/**
 * Save the whole database to a file (same format as "Download backup" in the admin panel).
 *
 *   npm run backup                 → backups/biohelix-backup-2026-11-03-1530.json
 *   npm run backup -- --out D:\backups
 */
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { createBackup } from '../src/services/backup.js';
import { localDate } from '../src/utils/helpers.js';

const outIndex = process.argv.indexOf('--out');
const outDir = outIndex === -1 ? path.resolve('backups') : path.resolve(process.argv[outIndex + 1]);

await connectDB();
const { text, createdAt, counts } = await createBackup();
fs.mkdirSync(outDir, { recursive: true });
const stamp = `${localDate(createdAt)}-${createdAt.toISOString().slice(11, 16).replace(':', '')}`;
const file = path.join(outDir, `biohelix-backup-${stamp}.json`);
fs.writeFileSync(file, text);
console.log(`Saved ${file} (${Math.round(text.length / 1024)} KB)`);
console.log(Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(', '));
await mongoose.disconnect();
