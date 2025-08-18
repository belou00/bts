// src/loaders/express.js
require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const routes = require('../routes');

function resolveBasePath() {
  const explicit = process.env.APP_BASE_PATH || process.env.BASE_PATH;
  if (explicit != null) return explicit;
  const env = (process.env.APP_ENV || 'development').toLowerCase();
  return (env === 'integration' || env === 'production') ? '/bts' : '';
}

function buildApp() {
  const app = express();

  const basePath = resolveBasePath();
  const appEnv = (process.env.APP_ENV || 'development').toLowerCase();
  app.set('basePath', basePath);
  app.set('envName', appEnv);
  app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  }));

  const allowedOrigin = process.env.FRONTEND_ORIGIN || '*';
  app.use(cors({ origin: allowedOrigin, credentials: false }));

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false
  });
  app.use(basePath + '/', limiter);

  // -------- Static assets (toujours /static, même en DEV) --------
  app.use(
    path.posix.join(basePath, '/static'),
    express.static(path.join(__dirname, '..', 'public', 'static'), {
      index: false,
      fallthrough: true,
      etag: true,
      maxAge: '1h',
      setHeaders: (res) => res.set('Cache-Control', 'public, max-age=3600')
    })
  );

  // (Compat facultative si tu avais encore l’ancien chemin /styles)
  app.use(
    path.posix.join(basePath, '/styles'),
    express.static(path.join(__dirname, '..', 'public', 'styles'), {
      index: false,
      fallthrough: true,
    })
  );

  // -------- Plans SVG --------
  app.get(path.posix.join(basePath, '/venues/:slug/plan.svg'), (req, res) => {
    const { slug } = req.params;
    const svgPath = path.join(__dirname, '..', 'public', 'venues', slug, 'plan.svg');
    res.sendFile(svgPath, (err) => {
      if (err) res.status(err.statusCode || 404).send('Plan indisponible pour cette saison.');
    });
  });

  // -------- Page HTML Renew (sert l’HTML seulement si Accept=html) --------
  app.get(path.posix.join(basePath, '/s/renew'), (req, res, next) => {
    const preferred = req.accepts(['html', 'json']);
    if (preferred === 'html') {
      const htmlPath = path.join(__dirname, '..', 'public', 'html', 'renew.html');
      return res.sendFile(htmlPath);
    }
    return next();
  });

  // Health
  app.get(path.posix.join(basePath, '/health'), (_req, res) => {
    res.json({ ok: true, env: app.get('envName'), basePath: app.get('basePath') });
  });

  // Routes applicatives
  app.use(basePath, routes);

  app.use((req, res) => {
    res.status(404).json({ error: 'not_found', path: req.originalUrl });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    console.error('[API ERROR]', err && (err.stack || err.message || err));
    const code = err.status || err.statusCode || 500;
    res.status(code).json({ error: err.message || 'internal_error' });
  });

  return app;
}

module.exports = { buildApp };
