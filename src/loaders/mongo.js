// src/loaders/mongo.js
const mongoose = require('mongoose');

function pickMongoUri() {
  const env = (process.env.APP_ENV || process.env.NODE_ENV || 'development').toLowerCase();
  if (env === 'production') {
    return process.env.MONGO_URI_PROD || process.env.MONGO_URI || process.env.MONGODB_URI;
  }
  if (env === 'integration' || env === 'int' || env === 'staging' || env === 'preprod') {
    return process.env.MONGO_URI_DEV || process.env.MONGO_URI || process.env.MONGODB_URI;
  }
  // development (local)
  return process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bts_dev';
}

async function connectMongo() {
  const uri = pickMongoUri();
  if (!uri) throw new Error('Mongo URI not provided');
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { autoIndex: true, maxPoolSize: 10 });
  console.log(`[BTS] Mongo connected → db="${mongoose.connection.name}"`);
}

module.exports = connectMongo;
