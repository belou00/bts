// src/loaders/mongo.js
const mongoose = require('mongoose');

module.exports = async function connectMongo(uri) {
  if (!uri) {
    throw new Error('Missing MongoDB URI (MONGO_URI ou MONGODB_URI)');
  }

  // Réglages recommandés
  mongoose.set('strictQuery', true);

  // Connexion
  await mongoose.connect(uri, {
    // options par défaut OK avec Mongoose 8 / MongoDB 6+
    // serverSelectionTimeoutMS: 10000,
  });

  // Logs utiles (optionnel)
  mongoose.connection.on('error', (err) => {
    console.error('[Mongo] connection error:', err);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('[Mongo] disconnected');
  });

  return mongoose.connection;
};
