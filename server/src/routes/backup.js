import { Router } from 'express';
import { createBackup, lastBackupInfo } from '../services/backup.js';
import { localDate } from '../utils/helpers.js';

const router = Router();

router.get('/info', async (req, res) => {
  res.json({ last: await lastBackupInfo() });
});

/** Download the whole database as one file. */
router.get('/download', async (req, res) => {
  const { text, createdAt } = await createBackup();
  const stamp = `${localDate(createdAt)}-${createdAt.toISOString().slice(11, 16).replace(':', '')}`;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="biohelix-backup-${stamp}.json"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(text);
});

export default router;
