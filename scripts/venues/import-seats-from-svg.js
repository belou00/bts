require('dotenv').config({ path: require('path').join(__dirname, '..','..', '.env') });
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const mongoose = require('mongoose');
const SeatCatalog = require('../../src/models/SeatCatalog');

(async () => {
  const [venueSlug, svgFile] = process.argv.slice(2);
  if (!venueSlug || !svgFile) {
    console.error('Usage: node scripts/venues/import-seats-from-svg.js <venueSlug> <path/to/plan.svg>');
    process.exit(1);
  }
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  await mongoose.connect(uri);

  const svg = fs.readFileSync(path.resolve(svgFile), 'utf8');
  const $ = cheerio.load(svg, { xmlMode: true });

  const nodes = $('[data-seat-id]');
  console.log(`Found ${nodes.length} seats in SVG`);
  let upserts = 0;

  await Promise.all(nodes.map((i, el) => {
    const seatId = $(el).attr('data-seat-id')?.trim();
    if (!seatId) return;
    const zoneAttr = $(el).attr('data-zone')?.trim();
    const zoneKey = zoneAttr || (seatId.split('-')[0].replace(/[0-9]/g,'') || 'Z');
    const row = $(el).attr('data-row')?.trim() || '';
    const number = $(el).attr('data-number')?.trim() || '';
    const selector = `[data-seat-id="${seatId.replace(/"/g,'&quot;')}"]`;

    return SeatCatalog.findOneAndUpdate(
      { venueSlug, seatId },
      { $set: { zoneKey, row, number, svgSelector: selector } },
      { upsert: true }
    ).then(()=> upserts++);
  }).get());

  console.log(`Upserted ${upserts} seats into catalog for venue ${venueSlug}`);
  await mongoose.disconnect();
})();

