const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { errors } = require('celebrate');
const routes = require('../routes');
const { errorHandler } = require('../middlewares/error');

function buildApp() {
  const app = express();
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cors({ origin: process.env.FRONTEND_ORIGIN?.split(',') || '*', credentials: false }));

  const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 300 });
  app.use('/api', apiLimiter);

  app.get('/api/v1/health', (_req, res) => res.json({ ok: true, name: 'BTS', version: '0.1-DEV' }));

  // assets statiques
  app.use('/public', express.static(path.join(__dirname, '..', 'public')));
  app.use('/views', express.static(path.join(__dirname, '..', 'views')));

  // routes API
  app.use('/api/v1', routes);

  // entrées HTML simples (DEV)
  app.get('/s/renew', (_req,res)=> res.sendFile(path.join(__dirname, '..', 'views', 'renew', 'index.html')));
  app.get('/s/tbh7', (_req,res)=> res.sendFile(path.join(__dirname, '..', 'views', 'tbh7', 'index.html')));
  app.get('/s/public', (_req,res)=> res.sendFile(path.join(__dirname, '..', 'views', 'public', 'index.html')));
  app.get('/admin', (_req,res)=> res.sendFile(path.join(__dirname, '..', 'views', 'admin', 'index.html')));

  app.use(errors());
  app.use(errorHandler);

  return app;
}

module.exports = { buildApp };
