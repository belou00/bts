// src/server.js (ESM)
import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import initExpress from './loaders/express.js';

const APP_ENV  = (process.env.APP_ENV || 'development').toLowerCase();
const HOST     = process.env.HOST || '127.0.0.1';
const PORT     = Number(process.env.PORT || 8080);
const MONGO_URI= process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bts';

async function start() {
  // 1) instance express
  const app = express();

  // 2) middlewares, statiques et routes (montés sous /bts)
  initExpress(app);

  // 3) Mongo (optionnel si tu as déjà un loader dédié ; sinon garde ce bloc)
  try {
    await mongoose.connect(MONGO_URI, { autoIndex: true });
    console.log('[mongo] connected');
  } catch (err) {
    console.error('[mongo] connection error:', err.message);
  }

  // 4) écoute HTTP
  app.listen(PORT, HOST, () => {
    console.log(`[server] ${APP_ENV} listening on http://${HOST}:${PORT}`);
  });
}

start().catch((err) => {
  console.error('[server] fatal error', err);
  process.exit(1);
});
