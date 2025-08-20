// src/server.js
import mongoose from 'mongoose';
import app, { BASE_PATH } from './loaders/express.js';

const APP_ENV = (process.env.APP_ENV || 'development').toLowerCase(); // development|integration|production
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || (APP_ENV === 'development' ? 8080 : 8081));
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bts';

async function start() {
  try {
    await mongoose.connect(MONGO_URI, { autoIndex: APP_ENV !== 'production' });
    app.listen(PORT, HOST, () => {
      console.log(`[BTS] ${APP_ENV} listening on http://${HOST}:${PORT}${BASE_PATH}`);
    });
  } catch (e) {
    console.error('Startup failure:', e);
    process.exit(1);
  }
}

start();
export default app; // utile pour supertest
