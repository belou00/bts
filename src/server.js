// src/server.js
import 'dotenv/config';
import app from './loaders/express.js';
import './loaders/mongo.js';

const HOST = process.env.HOST || '127.0.0.1';
const PORT = parseInt(process.env.PORT || '8080', 10);
const basePath = (() => {
  try {
    const u = new URL(process.env.APP_URL || 'http://localhost:8080/bts');
    return u.pathname.endsWith('/') ? u.pathname.slice(0, -1) : u.pathname;
  } catch {
    return '/bts';
  }
})();

app.listen(PORT, HOST, () => {
  console.log(`[bts] listening on http://${HOST}:${PORT}${basePath} (env=${process.env.APP_ENV || 'development'})`);
  console.log(`[bts] MONGO_URI=${process.env.MONGO_URI || '(default) mongodb://127.0.0.1:27017/bts'}`);
});
