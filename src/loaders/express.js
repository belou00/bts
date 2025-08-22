// src/loaders/express.js (rappel)
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import routes from '../routes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export default function initExpress(app) {
  app.disable('x-powered-by');

  app.use(morgan(process.env.APP_ENV === 'production' ? 'combined' : 'dev'));
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use((req, res, next) => { res.setHeader('Cross-Origin-Resource-Policy', 'same-origin'); next(); });

  const allowedOrigin = process.env.FRONTEND_ORIGIN || '*';
  app.use(cors({ origin: allowedOrigin === '*' ? true : [allowedOrigin], credentials: true }));

  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  const PUBLIC_DIR = path.join(__dirname, '../public');
  const VIEWS_DIR  = path.join(__dirname, '../views');

  // Extrait le chemin de APP_URL pour servir sous /bts (ou autre)
  const basePath = (process.env.APP_URL || '/bts').replace(/^https?:\/\/[^/]+/i, '') || '/bts';

  app.use(`${basePath}/public`, express.static(PUBLIC_DIR));
  app.use(`${basePath}/views`,  express.static(VIEWS_DIR));

  app.get(['/favicon.ico', `${basePath}/favicon.ico`], (_req, res) => {
    res.type('image/x-icon').sendFile(path.join(PUBLIC_DIR, 'favicon.ico'));
  });

  app.get(`${basePath}/health`, (_req, res) => res.json({ ok: true }));

  // Toutes les routes applicatives sont montées sous basePath
  app.use(basePath, routes);

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found', path: req.originalUrl });
  });

  return app;
}
