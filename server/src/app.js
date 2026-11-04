import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env } from './config/env.js';
import { requireAdmin, requireStaff, requireStudent, teacherReadOnly } from './middleware/auth.js';
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
import smsRoutes from './routes/sms.js';
import materialRoutes from './routes/materials.js';
import accountRoutes from './routes/accounts.js';
import teamRoutes from './routes/team.js';
import { inquiryRouter, publicRouter, siteAdminRouter } from './routes/site.js';

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
  api.use('/public', publicRouter); // public website, no login
  api.use('/me', requireStudent, meRoutes);

  // Staff area. Teachers: attendance, exams, notices, calendar, and read-only students/batches.
  // Admins only: fees, backup, team.
  api.use('/dashboard', requireStaff, dashboardRoutes);
  api.use('/students', requireStaff, teacherReadOnly, studentRoutes);
  api.use('/exams', requireStaff, examRoutes);
  api.use('/attendance', requireStaff, attendanceRoutes);
  api.use(['/notices', '/events'], requireStaff);
  api.use(['/programs', '/batches'], requireStaff, teacherReadOnly);
  api.use('/fees', requireAdmin, feeRoutes);
  api.use('/backup', requireAdmin, backupRoutes);
  api.use('/team', requireAdmin, teamRoutes);
  api.use('/site', requireAdmin, siteAdminRouter);
  api.use('/inquiries', requireAdmin, inquiryRouter);
api.use('/sms', requireAdmin, smsRoutes);
api.use('/materials', requireStaff, materialRoutes);
api.use('/accounts', requireAdmin, accountRoutes);
  // These two routers hold /notices, /events, /programs and /batches (guarded just above)
  api.use('/', noticeRoutes, programRoutes);
  api.use(notFound);
  app.use('/api', api);

  // In production the same server also serves the React app, so there is
  // one URL, one deploy, and no cross-site cookie problems.
  if (fs.existsSync(clientDist)) {
    const indexHtml = fs.readFileSync(path.join(clientDist, 'index.html'), 'utf8');
    // Facebook/WhatsApp previews and Google need full links, so fill in this site's address
    const origin = (req) => env.publicUrl || `${req.protocol}://${req.get('host')}`;

    app.get('/robots.txt', (req, res) => {
      res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /portal\nDisallow: /api\n\nSitemap: ${origin(req)}/sitemap.xml\n`);
    });
    app.get('/sitemap.xml', (req, res) => {
      const urls = ['/', '/admission', '/login'].map((p) => `  <url><loc>${origin(req)}${p}</loc></url>`).join('\n');
      res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
    });

    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get('/{*path}', (req, res) => {
      const html = indexHtml.replaceAll('%SITE_URL%', origin(req)).replace('%PAGE_URL%', origin(req) + req.path);
      const privatePage = /^\/(admin|portal)(\/|$)/.test(req.path);
      res.set('Cache-Control', 'no-cache');
      res.type('html').send(privatePage ? html.replace('<meta charset="UTF-8" />', '<meta charset="UTF-8" />\n    <meta name="robots" content="noindex" />') : html);
    });
  }

  app.use(errorHandler);
  return app;
}
