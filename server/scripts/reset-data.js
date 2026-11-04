/**
 * Clean start before going live: removes ALL students, batches, exams, results,
 * attendance, payments, notices, calendar events, inquiries and SMS logs.
 * Keeps the two programs and the admin/teacher accounts.
 *
 *   npm run reset-data                       → shows what would be deleted, changes nothing
 *   npm run reset-data -- --confirm biohelix → really deletes (a backup is saved first)
 *
 * Add --remove-staff to also delete every admin/teacher except the one given by
 * --keep you@example.com (use this to get rid of test admin accounts).
 */
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import * as models from '../src/models/index.js';
import { createBackup } from '../src/services/backup.js';
import { localDate } from '../src/utils/helpers.js';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1] ?? true;
};

const KEEP = new Set(['Program', 'Admin']);
const confirm = arg('confirm');
const removeStaff = process.argv.includes('--remove-staff');
const keepEmail = typeof arg('keep') === 'string' ? arg('keep').toLowerCase() : null;

await connectDB();
const dbName = mongoose.connection.name;
const targets = Object.entries(models).filter(([name, m]) => m?.collection && !KEEP.has(name));

console.log('Will delete everything in:');
for (const [name, Model] of targets) console.log(`  ${name}: ${await Model.countDocuments()}`);
if (removeStaff) {
  if (!keepEmail) {
    console.error('\n--remove-staff needs --keep your@email.com so at least one admin stays.');
    process.exit(1);
  }
  const keeper = await models.Admin.findOne({ email: keepEmail });
  if (!keeper) {
    console.error(`\nNo account with email ${keepEmail}. Create it first: npm run seed -- --name ... --email ${keepEmail} --password ...`);
    process.exit(1);
  }
  const others = await models.Admin.find({ email: { $ne: keepEmail } }).select('email').lean();
  console.log(`  Staff accounts to remove: ${others.map((a) => a.email).join(', ') || 'none'} (keeping ${keepEmail})`);
}

if (confirm !== dbName) {
  console.log(`\nNothing changed. To really delete, run again with:  --confirm ${dbName}`);
  await mongoose.disconnect();
  process.exit(0);
}

const { text } = await createBackup();
fs.mkdirSync('backups', { recursive: true });
const file = path.resolve('backups', `before-reset-${localDate()}-${Date.now()}.json`);
fs.writeFileSync(file, text);
console.log(`\nBackup saved first: ${file}`);

for (const [, Model] of targets) await Model.deleteMany({});
if (removeStaff) await models.Admin.deleteMany({ email: { $ne: keepEmail } });
console.log('Done. The database is ready for real data.');
await mongoose.disconnect();
