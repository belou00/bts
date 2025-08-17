// src/loaders/express.js
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { errors: celebrateErrors } = require('celebrate');

/** Déduit le basePath depuis APP_URL (ex: "/bts" ou "") */
function getBasePath() {
  try {
    const u = new URL(process.env.APP_URL || 'http://localhost:8080');
    const p = u.pathname || '/';
    return p === '/' ? '' : p.replace(/\/$/, '');
  } catch {
    return '';
  }
}

/** Construit la whitelist CORS */
function buildCorsOrigins() {
  const set = new Set();

  const fe = process.env.FRONTEND_ORIGIN;
  if (fe) {
    try { set.add(new URL(fe).origin); } catch {}
  }

  const appUrl = process.env.APP_URL;
  if (appUrl) {
    try { set.add(new URL(appUrl).origin); } catch {}
  }

  // Dev locaux
  set.add('http://localhost:8080');
  set.add('http://127.0.0.1:8080');

  // Domaines probables
  set.add('https://billetterie-dev.belougas.fr');
  set.add('https://billetterie.belougas.fr');

  return set;
}

module.exports = (app) => {
  const publicDir = path.join(__dirname, '..', 'public');
  const basePath = getBasePath(); // ex: "/bts" ou ""

  // Basiques & sécurité
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: false, // on durcira plus tard si besoin d'iframe HA
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  }));

  // CORS
  const allowed = buildCorsOrigins();
  const corsOptions = {
    origin(origin, cb) {
      if (!origin) return cb(null, true); // curl/outils internes
      try {
        const o = new URL(origin).origin;
        if (allowed.has(o)) return cb(null, true);
      } catch {}
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: false,
    methods: ['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization']
  };
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));

  // Parsers
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Rate limit léger pour /api/
  app.use(
    '/api/',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 600,
      standardHeaders: true,
      legacyHeaders: false
    })
  );

  // Health
  app.get('/health', (_req, res) => res.json({ ok: true, env: process.env.NODE_ENV || 'dev' }));

  // ===== Statics =====
  // Sert /venues/... à la racine (utile en local)
  app.use(express.static(publicDir));
  // Sert aussi derrière le préfixe (ex: /bts/venues/...)
  if (basePath) app.use(basePath, express.static(publicDir));
  // Alias historique /public/...
  app.use('/public', express.static(publicDir));

  // ===== Routes applicatives =====
  const routes = require('../routes'); // <-- PAS d'auto-require !
  app.use(routes);

  // Celebrate -> 400 propres
  app.use(celebrateErrors());

  // ===== Error handler JSON =====
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    console.error('[API ERROR]', err && (err.stack || err.message || err));
    const status =
      err?.status || err?.statusCode || err?.output?.statusCode || 500;
    const payload = {
      error: err?.code ? String(err.code) : 'server_error',
      message: err?.message || 'Unexpected error'
    };
    if ((process.env.NODE_ENV || 'development') !== 'production') {
      payload.stack = err?.stack;
    }
    res.status(status).json(payload);
  });

  return app;
};
