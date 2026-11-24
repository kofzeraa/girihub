import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = Number(process.env.PORT) || 3000;

export const config = {
  root,
  port,
  host: process.env.HOST || '0.0.0.0',
  publicUrl: (process.env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/$/, ''),
  dbFile: process.env.GIRIHUB_DB || path.join(root, 'data', 'girihub.db'),
  uploadDir: process.env.GIRIHUB_UPLOADS || path.join(root, 'data', 'uploads'),
  webDir: path.join(root, 'web'),
  extDir: path.join(root, 'extensions'),
  adminEmail: (process.env.GIRIHUB_ADMIN_EMAIL || '').trim().toLowerCase(),
  maxJsonBytes: 1_000_000,
  maxVideoBytes: (Number(process.env.GIRIHUB_MAX_VIDEO_MB) || 100) * 1024 * 1024,
  maxImageBytes: 5 * 1024 * 1024,
  sessionDays: 30,
  pageSize: 6,
};
