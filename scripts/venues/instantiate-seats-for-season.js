require('dotenv').config({ path: require('path').join(__dirname, '..','..', '.env') });
const mongoose = require('mongoose');
const SeatCatalog = require('../../src/models/SeatCatalog');
const Seat = require('../../src/models/Seat');

(async () => {
  const [venueSlug, seasonCode] = process.argv.slice(2);
  if (!venueSlug || !seasonCode) {
    console.error('Usage: node scripts/venues/instantiate-seats-for-season.js <venueSlug> <seasonCode>');
    process.exit(1);
  }
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  await mongoose.connect(uri);

  const cur = SeatCatalog.find({ venueSlug }).cursor();
  let created = 0, skipped = 0;
  for await (const c of cur) {
    const exists = await Seat.exists({ seasonCode, seatId: c.seatId });
    if (exists) { skipped++; continue; }
    await Seat.create({
      seasonCode,
      venueSlug,
      seatId: c.seatId,
      zoneKey: c.zoneKey,
      status: 'available'
    });
    created++;
  }
  console.log(`Instantiated seats for season ${seasonCode} @ ${venueSlug}: created=${created}, skipped=${skipped}`);
  await mongoose.disconnect();
})();
