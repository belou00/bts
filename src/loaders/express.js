// src/loaders/express.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import morgan from 'morgan';

// Routes applicatives
import renewRoutes from '../routes/renew.js';
import haRoutes from '../routes/ha.js';

// ===== ENV / Config =====
const APP_ENV = (process.env.APP_ENV || 'development').toLowerCase(); // development|integration|production
const APP_URL = process.env.APP_URL || 'http://localhost:8080';        // ex: https://billetterie-test.belougas.fr/bts
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:8080';

// Déduit le "basePath" à partir d'APP_URL (ex: https://site/bts -> /bts)
function computeBasePath(urlStr) {
  try {
    const u = new URL(urlStr);
    const p = u.pathname.replace(/\/+$/, '');
    return p === '' ? '/' : p;
  } catch {
    return '/';
  }
}
const BASE_PATH = computeBasePath(APP_URL);

// Resolve __dirname (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== App instance =====
const app = express();

// Sécurité + perf
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false })); // CSP fine à ajouter si besoin
app.use(compression());

// CORS (autorise le(s) front(s) défini(s) par FRONTEND_ORIGIN, séparation par virgules possible)
const allowedOrigins = FRONTEND_ORIGIN.split(',').map(s => s.trim());
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // outils locaux (curl, tests)
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS: ' + origin));
  },
  credentials: false
}));

// Logs
app.use(morgan(APP_ENV === 'development' ? 'dev' : 'combined'));

// Parsers (les webhooks HA qui nécessitent body "raw" seront montés dans leur route dédiée)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Statiques : sert /src/public sous BASE_PATH (ex: /bts)
const publicDir = path.resolve(__dirname, '../public');
app.use(BASE_PATH, express.static(publicDir, {
  etag: true,
  maxAge: APP_ENV === 'production' ? '1d' : 0,
  index: false
}));

// Health
app.get(path.posix.join(BASE_PATH, '/health'), (_req, res) => {
  res.json({ ok: true, env: APP_ENV, basePath: BASE_PATH });
});

// Routes applicatives sous BASE_PATH
app.use(BASE_PATH, renewRoutes);
app.use(BASE_PATH, haRoutes);

// 404
app.use((req, res, _next) => {
  if (req.path.startsWith(BASE_PATH)) {
    return res.status(404).json({ error: 'Not found' });
  }
  return res.status(404).send('Not found');
});

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(400).json({ error: err.message || 'Bad request' });
});

export { BASE_PATH };
export default app;
