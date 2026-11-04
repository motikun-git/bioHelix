import mongoose from 'mongoose';

// Forgot-password codes. Kept out of models/index.js on purpose so they are
// never written into backups. MongoDB deletes them by itself after they expire.
const resetSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  codeHash: { type: String, required: true },
  tries: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});
resetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordReset = mongoose.model('PasswordReset', resetSchema);
