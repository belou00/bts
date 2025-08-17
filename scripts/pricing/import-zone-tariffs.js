// scripts/pricing/import-zone-tariffs.js
// Usage:
//   node scripts/pricing/import-zone-tariffs.js <seasonCode> <venueSlug> <csvPath>
// CSV attendu (en-têtes insensibles à la casse) :
//   zoneKey, tariffCode, priceCents   (optionnel: priceEuro)
// - priceEuro peut contenir virgule ou point (ex: "180,00" -> 18000)

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mongoose = require('mongoose');
const TariffPrice = require('../../src/models/TariffPrice');

function parseEuroToCents(s) {
  if (s == null || s === '') return null;
  const cleaned = String(s).trim().replace(/\s/g, '').replace(',','.');
  const n = Number(cleaned);
  if (Number.isFinite(n)) return Math.round(n * 100);
  return null;
}

(async () => {
  const [,, seasonCode, venueSlug, csvPath] = process.argv;
  if (!seasonCode || !venueSlug || !csvPath) {
    console.error('Usage: node scripts/pricing/import-zone-tariffs.js <seasonCode> <venueSlug> <csvPath>');
    process.exit(1);
  }
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) { console.error('Missing MONGO_URI'); process.exit(1); }
  await mongoose.connect(mongoUri);

  const full = path.resolve(csvPath);
  if (!fs.existsSync(full)) { console.error('CSV not found:', full); process.exit(1); }

  const rl = readline.createInterface({ input: fs.createReadStream(full, 'utf8'), crlfDelay: Infinity });
  let header = null, count = 0, upserts = 0;
  for await (const raw of rl) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim()) continue;
    if (!header) {
      header = line.split(',').map(h => h.trim().toLowerCase());
      continue;
    }
    const cells = line.split(',').map(x => x.trim());
    const row = Object.fromEntries(header.map((h,i) => [h, cells[i] ?? '']));
    const zoneKey = row.zonekey || row.zone || row['zone_key'];
    const tariffCode = (row.tariffcode || row.tariff || row['tariff_code'] || '').toUpperCase();
    let priceCents = row.pricecents ? Number(row.pricecents) : null;
    if (!Number.isFinite(priceCents)) priceCents = parseEuroToCents(row.priceeuro || row.prix || row['prix_euro']);

    if (!zoneKey || !tariffCode || !Number.isFinite(priceCents)) {
      console.warn('SKIP invalid row:', row);
      continue;
    }

    await TariffPrice.findOneAndUpdate(
      { seasonCode, venueSlug, zoneKey, tariffCode },
      { $set: { priceCents } },
      { upsert: true, new: true }
    );
    upserts += 1;
    count += 1;
  }

  console.log(`Imported ${upserts} price rows for season=${seasonCode} venue=${venueSlug}`);
  await mongoose.disconnect();
})();
