/**
 * One-time setup. Creates the two programs and an admin account.
 *
 *   npm run seed -- --name "Shuvo" --email shuvo@example.com --password "a-strong-password"
 *
 * Run it once per admin (2 times for 2 admins). Running it again with the
 * same email resets that admin's password.
 */
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { Admin, Program } from '../src/models/index.js';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const PROGRAMS = [
  { code: 'H', name: 'HSC Academic' },
  { code: 'M', name: 'Medical Admission' },
];

await connectDB();

for (const p of PROGRAMS) {
  await Program.updateOne({ code: p.code }, { $setOnInsert: p }, { upsert: true });
}
console.log('Programs ready:', PROGRAMS.map((p) => `${p.code} = ${p.name}`).join(', '));

const name = arg('name');
const email = arg('email')?.toLowerCase();
const password = arg('password');

if (email) {
  if (!name || !password) {
    console.error('Give --name, --email and --password together.');
    process.exitCode = 1;
  } else if (password.length < 10) {
    console.error('Admin password must be at least 10 characters.');
    process.exitCode = 1;
  } else {
    const passwordHash = await bcrypt.hash(password, 12);
    const existing = await Admin.findOne({ email });
    if (existing) {
      existing.name = name;
      existing.passwordHash = passwordHash;
      existing.role = 'admin';
      existing.mustChangePassword = false;
      await existing.save();
      console.log(`Admin ${email} updated (password reset).`);
    } else {
      await Admin.create({ name, email, passwordHash, role: 'admin' });
      console.log(`Admin ${email} created.`);
    }
  }
} else {
  console.log('No admin created. Add --name --email --password to create one.');
}

await mongoose.disconnect();
