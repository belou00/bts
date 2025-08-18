// src/loaders/express.js
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// Ton index de routes doit faire: module.exports = router;
const routes = require('../routes');

function buildApp() {
  const app = express();

  // Sécurité / parsing
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // CORS (autorise plusieurs origines séparées par des virgules si besoin)
  const origins = (process.env.FRONTEND_ORIGIN || '').split(',')
    .map(s => s.trim()).filter(Boolean);
  app.use(cors({
    origin: origins.length ? origins : true,
    credentials: true,
  }));

  // Rate limit basique sur l'API publique
  app.use('/api', rateLimit({ windowMs: 60_000, max: 300 }));

  // Health
  app.get('/health', (_req, res) => res.json({ ok: true }));

  // Statique (CSS/JS), plans SVG et HTML
  app.use('/static', express.static(path.join(__dirname, '..', 'public', 'static')));
  app.use('/venues', express.static(path.join(__dirname, '..', 'public', 'venues')));
  app.use('/html',   express.static(path.join(__dirname, '..', 'public', 'html')));

  // Routes applicatives (API + pages /s/renew etc.)
  app.use('/', routes);

  // 404
  app.use((req, res) => {
    res.status(404).json({ error: 'not_found', path: req.originalUrl });
  });

  // Handler d'erreurs
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    console.error('[API ERROR]', err);
    res.status(err.status || 500).json({ error: err.message || 'internal_error' });
  });

  return app;
}

// 👉 export par défaut : server.js peut faire `const buildApp = require('./loaders/express');`
module.exports = buildApp;
