require('dotenv').config();

const mongoose = require('mongoose');
const Venue = require('../../src/models/Venue');

(async () => {
  const [slug, name, svgPath] = process.argv.slice(2);
  if (!slug || !name || !svgPath) {
    console.error('Usage: node scripts/venues/register-venue.js <slug> "<name>" </public/venues/<slug>/plan.svg>');
    process.exit(1);
  }
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  await mongoose.connect(uri);

  const v = await Venue.findOneAndUpdate(
    { slug },
    { $set: { name, svgPath } },
    { upsert: true, new: true }
  );

  console.log('OK venue:', v);
  await mongoose.disconnect();
})();
