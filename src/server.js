// src/server.js
require('dotenv').config();

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const http = require('http');

// -------- Chargement .env selon APP_ENV --------
function resolveEnvFile() {
  const env = (process.env.APP_ENV || 'development').toLowerCase();
  const candidates = [
    process.env.DOTENV_PATH,                // si tu veux forcer un fichier
    `.env.${env}`,                          // .env.development | .env.integration | .env.production
    env === 'development' ? '.env.dev' : null, // compat .env.dev
    '.env',
  ].filter(Boolean);

  for (const p of candidates) {
    const abs = path.resolve(process.cwd(), p);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}
const envFile = resolveEnvFile();
if (envFile) {
  require('dotenv').config({ path: envFile });
  console.log(`[BTS] Loaded env file: ${path.basename(envFile)} (APP_ENV=${process.env.APP_ENV || 'development'})`);
} else {
  require('dotenv').config(); // fallback silencieux
}

// -------- Imports app & mongo --------
const { buildApp } = require('./loaders/express'); // IMPORTANT: déstructuration
const connectMongo = require('./loaders/mongo');   // exporte une fonction (connectMongo)

// -------- Démarrage --------
async function start() {
  const app = buildApp(); // <-- ici c'est une fonction
  const port = parseInt(process.env.PORT, 10) || 8080;
  const env = (process.env.APP_ENV || 'development').toLowerCase();

  // Choix de l'URI Mongo selon l'env
  const mongoUri =
    env === 'production'  ? process.env.MONGO_URI_PROD :
    env === 'integration' ? process.env.MONGO_URI_INT  :
    process.env.MONGO_URI_DEV || process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error(`Missing Mongo URI for env=${env} (MONGO_URI_DEV / MONGO_URI_INT / MONGO_URI_PROD)`);
  }

  await connectMongo(mongoUri);

  http.createServer(app).listen(port, () => {
    const basePath = app.get('basePath') || '';
    console.log(`[BTS] API listening on http://localhost:${port}${basePath}`);
  });
}

start().catch(err => {
  console.error('Fatal start error', err);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('[BTS] Received SIGINT, shutting down...');
  process.exit(0);
});
