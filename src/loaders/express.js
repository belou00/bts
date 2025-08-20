// src/loaders/express.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import compression from 'compression';

import renewRouter from '../routes/renew.js';
import haRouter from '../routes/ha.js';
import debugRouter from '../routes/debug.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Base path from APP_URL (default /bts)
const basePath = (() => {
  try {
    const u = new URL(process.env.APP_URL || 'http://localhost:8080/bts');
    return u.pathname.endsWith('/') ? u.pathname.slice(0, -1) : u.pathname;
  } catch {
    return '/bts';
  }
})();

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || true, credentials: true }));
app.use(compression());
app.use(morgan('dev'));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Static under /bts/public
app.use(`${basePath}/public`, express.static(path.resolve(__dirname, '../public')));

// Health
app.get(`${basePath}/health`, (_req, res) => res.json({ ok: true }));

// Routers
app.use(basePath, renewRouter); // /s/renew (GET/POST)
app.use(basePath, haRouter);    // /ha/return|back|error
app.use(basePath, debugRouter); // /debug/renew-scan

// 404 JSON
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

export default app;
