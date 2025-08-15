const mongoose = require('mongoose');

async function connectMongo(uri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log('[BTS] Mongo connected');
}

module.exports = { connectMongo };
