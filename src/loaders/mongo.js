// src/loaders/mongo.js
const mongoose = require('mongoose');

async function connectMongo() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bts';
  if (!uri) throw new Error('Mongo URI not provided');
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { autoIndex: true, maxPoolSize: 10 });
  console.log(`[BTS] Mongo connected → db="${mongoose.connection.name}"`);
}

module.exports = connectMongo;
