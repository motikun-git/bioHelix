/**
 * Put a backup file back into the database. THIS REPLACES the current data.
 *
 * 1. Check the file first (changes nothing):
 *      npm run restore -- path\to\biohelix-backup-2026-11-03-1530.json
 * 2. Restore, typing the database name to confirm:
 *      npm run restore -- path\to\file.json --confirm biohelix
 *
 * A fresh backup of the current data is saved to backups/ before restoring,
 * so a wrong restore can itself be undone.
 */
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { createBackup, readBackup, restoreBackup } from '../src/services/backup.js';
import { localDate } from '../src/utils/helpers.js';

const file = process.argv[2];
const confirmIndex = process.argv.indexOf('--confirm');
const confirm = confirmIndex === -1 ? null : process.argv[confirmIndex + 1];

if (!file || file.startsWith('--')) {
  console.error('Give the backup file: npm run restore -- path\\to\\backup.json');
  process.exit(1);
}

let data;
try {
  data = readBackup(fs.readFileSync(path.resolve(file), 'utf8'));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

await connectDB();
const dbName = mongoose.connection.name;
console.log(`Backup from ${new Date(data.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' })}`);
console.log(Object.entries(data.counts).map(([k, v]) => `  ${k}: ${v}`).join('\n'));

if (confirm !== dbName) {
  console.log(`\nNothing changed. To replace ALL data in database "${dbName}" with this backup, run again with:  --confirm ${dbName}`);
  await mongoose.disconnect();
  process.exit(0);
}

const safety = await createBackup();
fs.mkdirSync('backups', { recursive: true });
const safetyFile = path.resolve('backups', `before-restore-${localDate()}-${Date.now()}.json`);
fs.writeFileSync(safetyFile, safety.text);
console.log(`\nCurrent data saved first: ${safetyFile}`);

const restored = await restoreBackup(data);
console.log('Restored:', Object.entries(restored).map(([k, v]) => `${k} ${v}`).join(', '));
await mongoose.disconnect();
