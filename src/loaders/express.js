// src/loaders/express.js
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const routes = require('../routes');

function buildApp() {
  const app = express();

  // Sécurité & parsers
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // CORS
  const feOrigin = process.env.FRONTEND_ORIGIN || '*';
  app.use(cors({ origin: feOrigin === '*' ? true : feOrigin, credentials: false }));

  // Rate limit
  app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 }));

  // Stub HelloAsso en DEV (intercepteur)
  try {
    const stub = require('../routes/stub');
    app.use(stub);
  } catch (_) {}

  // ---------- STATIQUE (NOUVEAU) ----------
  // Nouveau préfixe unique pour tout le front statique
  app.use('/static', express.static(path.join(__dirname, '..', 'public', 'static')));
  // Plans SVG par lieu
  app.use('/venues', express.static(path.join(__dirname, '..', 'public', 'venues')));
  // Pages d’admin statiques (pricing.html)
  app.use('/admin', express.static(path.join(__dirname, '..', 'public', 'admin')));

  // Aliases rétro-compat (pendant la transition)
  app.use('/assets', express.static(path.join(__dirname, '..', 'public', 'static'))); // /assets -> /static
  app.use('/styles', express.static(path.join(__dirname, '..', 'public', 'static', 'css'))); // /styles -> /static/css
  app.use('/public', express.static(path.join(__dirname, '..', 'public'))); // vieux liens éventuels

  // Routes applicatives
  app.use(routes);

  // Health
  app.get('/health', (_req, res) => res.json({ ok: true, env: process.env.APP_ENV || 'development' }));

  // 404
  app.use((req, res) => res.status(404).json({ error: 'not_found' }));

  // Erreur
  app.use((err, _req, res, _next) => {
    console.error('[API ERROR]', err.stack || err);
    res.status(500).json({ error: 'internal_error' });
    return undefined;
  });

  return app;
}

module.exports = buildApp;
