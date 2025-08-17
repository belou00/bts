// src/server.js
const loadEnv = require('./config/env');
loadEnv();

const http = require('http');
const connectMongo = require('./loaders/mongo');
const buildApp = require('./loaders/express');

async function start() {
  try {
    await connectMongo();
    const app = buildApp();
    const port = Number(process.env.PORT || 8080);
    const server = http.createServer(app);
    server.listen(port, () => {
      console.log(`[BTS] API listening on http://localhost:${port}`);
    });

    const shutdown = () => {
      console.log('[BTS] Received SIGINT, shutting down...');
      server.close(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    console.error('Fatal start error', err);
    process.exit(1);
  }
}

start();
