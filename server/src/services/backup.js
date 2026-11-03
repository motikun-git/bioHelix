import mongoose from 'mongoose';
import * as models from '../models/index.js';

const { EJSON } = mongoose.mongo.BSON;

export const BACKUP_APP = 'biohelix-portal';
export const BACKUP_VERSION = 1;

/** Every model whose data belongs in a backup, keyed by collection name. */
function backupModels() {
  return Object.values(models)
    .filter((m) => m?.collection?.collectionName)
    .reduce((acc, m) => ({ ...acc, [m.collection.collectionName]: m }), {});
}

/**
 * The whole database as one JSON text. Extended JSON ("relaxed" mode: plain
 * numbers, readable dates) keeps ObjectIds and dates exact, so a restore gives
 * back identical data, logins included.
 */
export async function createBackup() {
  const collections = {};
  const counts = {};
  for (const [name, Model] of Object.entries(backupModels())) {
    const docs = await Model.collection.find({}).toArray();
    collections[name] = docs;
    counts[name] = docs.length;
  }
  const createdAt = new Date();
  const text = EJSON.stringify({ app: BACKUP_APP, version: BACKUP_VERSION, createdAt, counts, collections }, { relaxed: true });
  await models.Setting.updateOne(
    { key: 'lastBackup' },
    { $set: { value: { at: createdAt, counts, bytes: Buffer.byteLength(text) } } },
    { upsert: true },
  );
  return { text, createdAt, counts };
}

/** Check a backup file and return what it contains, without changing anything. */
export function readBackup(text) {
  let data;
  try {
    data = EJSON.parse(text, { relaxed: true });
  } catch {
    throw new Error('This is not a valid backup file (could not read JSON).');
  }
  if (data?.app !== BACKUP_APP || !data.collections) throw new Error('This file is not a BioHelix backup.');
  if (data.version > BACKUP_VERSION) throw new Error('This backup was made by a newer version of the app.');
  const known = backupModels();
  const unknown = Object.keys(data.collections).filter((name) => !known[name]);
  if (unknown.length) throw new Error(`Backup has unknown collections: ${unknown.join(', ')}`);
  return data;
}

/**
 * Replace the database contents with a backup. Every collection in the
 * backup is emptied and refilled; collections not in the backup are left alone.
 */
export async function restoreBackup(data) {
  const known = backupModels();
  const restored = {};
  for (const [name, docs] of Object.entries(data.collections)) {
    const Model = known[name];
    await Model.collection.deleteMany({});
    if (docs.length) await Model.collection.insertMany(docs, { ordered: false });
    restored[name] = docs.length;
  }
  for (const Model of Object.values(known)) await Model.syncIndexes().catch(() => {});
  return restored;
}

export async function lastBackupInfo() {
  const doc = await models.Setting.findOne({ key: 'lastBackup' }).lean();
  return doc?.value || null;
}
