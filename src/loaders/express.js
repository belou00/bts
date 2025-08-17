// src/loaders/express.js
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const routes = require('../routes');

function buildApp() {
  const app = express();

  // sécurité basique
  app.use(helmet({
    contentSecurityPolicy: false
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // CORS
  const feOrigin = process.env.FRONTEND_ORIGIN || '*';
  app.use(cors({ origin: feOrigin === '*' ? true : feOrigin, credentials: false }));

  // rate-limit soft
  app.use('/api/', rateLimit({ windowMs: 15*60*1000, max: 1000 }));

  // STUB HelloAsso en DEV (ou si HELLOASSO_STUB=true)
  try {
    const stub = require('../routes/stub');
    app.use(stub); // placé avant routes => intercepte si actif
  } catch (_) {}

  // Statique (plan, assets, pages)
  app.use('/public', express.static(path.join(__dirname, '..', 'public')));
  app.use('/venues', express.static(path.join(__dirname, '..', 'public', 'venues')));
  app.use('/assets', express.static(path.join(__dirname, '..', 'public', 'assets')));

  // Routes applicatives (renew, admin, payments, etc.)
  app.use(routes);

  // Health
  app.get('/health', (_req, res) => res.json({ ok: true, env: process.env.APP_ENV || 'development' }));

  // 404
  app.use((req, res) => res.status(404).json({ error: 'not_found' }));

  // erreur
  app.use((err, _req, res, _next) => {
    console.error('[API ERROR]', err.stack || err);
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}

module.exports = buildApp;
