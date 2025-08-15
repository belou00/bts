require('dotenv').config();
const { connectMongo } = require('./loaders/mongo');
const { buildApp } = require('./loaders/express');

const PORT = process.env.PORT || 8080;

async function start() {
  await connectMongo(process.env.MONGO_URI);
  const app = buildApp();
  app.listen(PORT, () => console.log(`[BTS] API listening on http://localhost:${PORT}`));
}

start().catch((e)=>{
  console.error('Fatal start error', e);
  process.exit(1);
});
