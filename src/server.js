// src/server.js
require('dotenv').config();

const http = require('http');
const express = require('express');

const buildApp = require('./loaders/express'); // export = fonction (pas de déstructuration)
const connectMongo = require('./loaders/mongo');

const PORT = Number(process.env.PORT) || 8080;

async function start() {
  try {
    // Connexion Mongo
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    await connectMongo(uri);
    console.log('[BTS] Mongo connected');

    // Application Express
    const app = express();
    buildApp(app); // monte middlewares, statiques et routes

    // Serveur HTTP
    const server = http.createServer(app);
    server.listen(PORT, () => {
      const advertised = process.env.APP_URL || `http://localhost:${PORT}`;
      console.log(`[BTS] API listening on ${advertised}`);
    });

    // Arrêt propre
    const shutdown = (sig) => () => {
      console.log(`[BTS] Received ${sig}, shutting down...`);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 5000).unref();
    };
    process.on('SIGINT', shutdown('SIGINT'));
    process.on('SIGTERM', shutdown('SIGTERM'));

    // Sécurité: gestion des erreurs non catchées
    process.on('unhandledRejection', (reason) => {
      console.error('[BTS] UnhandledRejection:', reason);
    });
    process.on('uncaughtException', (err) => {
      console.error('[BTS] UncaughtException:', err);
    });
  } catch (err) {
    console.error('Fatal start error', err);
    process.exit(1);
  }
}

start();
