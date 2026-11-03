import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env } from './config/env.js';
import { requireAdmin, requireStudent } from './middleware/auth.js';
import { errorHandler, notFound } from './utils/http.js';
import authRoutes from './routes/auth.js';
import programRoutes from './routes/programs.js';
import studentRoutes from './routes/students.js';
import examRoutes from './routes/exams.js';
import meRoutes from './routes/me.js';
import dashboardRoutes from './routes/dashboard.js';
import attendanceRoutes from './routes/attendance.js';
import noticeRoutes from './routes/notices.js';
import feeRoutes from './routes/fees.js';
import backupRoutes from './routes/backup.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, '../../client/dist');

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Render/Railway sit behind a proxy
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'"],
        },
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  if (!env.isProd) app.use(morgan('dev'));

  const api = express.Router();
  api.get('/health', (req, res) => res.json({ ok: true }));
  api.use('/auth', authRoutes);
  api.use('/me', requireStudent, meRoutes);
  api.use('/dashboard', requireAdmin, dashboardRoutes);
  api.use('/students', requireAdmin, studentRoutes);
  api.use('/exams', requireAdmin, examRoutes);
  api.use('/attendance', requireAdmin, attendanceRoutes);
  api.use('/fees', requireAdmin, feeRoutes);
  api.use('/backup', requireAdmin, backupRoutes);
  api.use('/', requireAdmin, noticeRoutes); // /notices and /events
  api.use('/', requireAdmin, programRoutes); // /programs and /batches
  api.use(notFound);
  app.use('/api', api);

  // In production the same server also serves the React app, so there is
  // one URL, one deploy, and no cross-site cookie problems.
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get('/{*path}', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
