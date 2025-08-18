#!/usr/bin/env node
require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) { console.error('Missing MONGO_URI in .env'); process.exit(1); }

  // sécurité : exiger --force
  if (!process.argv.includes('--force')) {
    console.error('Refusé: ajoute --force pour confirmer la suppression de la base.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const dbName = mongoose.connection.name;
  console.warn(`⚠️  Suppression de la base "${dbName}" sur ${mongoose.connection.host} …`);
  await mongoose.connection.dropDatabase();
  console.log('✓ Base supprimée');
  await mongoose.disconnect();
})();
