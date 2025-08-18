// src/server.js
require('dotenv').config();

const http = require('http');
const connectMongo = require('./loaders/mongo');
const buildApp = require('./loaders/express');

async function start() {
  try {
    await connectMongo();

    const app = buildApp();
    const port = Number(process.env.PORT || 8080);
    const host = process.env.HOST || '0.0.0.0'; // accessible depuis le réseau/VPS

    const server = http.createServer(app);
    server.listen(port, host, () => {
      console.log(`[BTS] API listening on http://${host}:${port}`);
    });

    const shutdown = () => {
      console.log('[BTS] Received shutdown signal, closing...');
      server.close(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    process.on('unhandledRejection', (err) => {
      console.error('[BTS] UnhandledRejection:', err);
    });
    process.on('uncaughtException', (err) => {
      console.error('[BTS] UncaughtException:', err);
      process.exit(1);
    });
  } catch (err) {
    console.error('Fatal start error', err);
    process.exit(1);
  }
}

start();
