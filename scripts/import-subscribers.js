// scripts/import-subscribers.js
// usage: node scripts/import-subscribers.js data/subscribers.csv 2025-2026
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Subscriber = require('../src/models/Subscriber');

function parseCSV(text) {
  // CSV basique: pas de virgules dans les champs, séparateur ','
  const [headerLine, ...lines] = text.split(/\r?\n/).filter(Boolean);
  const headers = headerLine.split(',').map(h => h.trim());
  return lines.map(line => {
    const cols = line.split(',').map(c => c.trim());
    const row = {};
    headers.forEach((h,i)=> row[h] = cols[i] || '');
    return row;
  });
}

(async () => {
  const file = process.argv[2];
  const seasonCode = process.argv[3];
  if (!file || !seasonCode) {
    console.error('usage: node scripts/import-subscribers.js <csv> <seasonCode>');
    process.exit(1);
  }
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGO_URI/MONGODB_URI manquant');
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET manquant');

  await mongoose.connect(uri);
  const csv = fs.readFileSync(path.resolve(file), 'utf8');
  const rows = parseCSV(csv);

  console.log(`Importing ${rows.length} subscribers...`);
  for (const r of rows) {
    const doc = await Subscriber.findOneAndUpdate(
      { email: r.email },
      {
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        phone: r.phone || '',
        previousSeasonSeats: (r.previousSeasonSeats||'').split(';').filter(Boolean),
        status: 'invited'
      },
      { upsert: true, new: true }
    );
    const token = jwt.sign(
      { subscriberId: doc._id.toString(), seasonCode, phase: 'renewal' },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    const url = `${process.env.APP_URL}/s/renew?id=${encodeURIComponent(token)}`;
    console.log(`${doc.email}; ${url}`);
  }

  await mongoose.disconnect();
  console.log('Done.');
})().catch(e => { console.error(e); process.exit(1); });
