// src/routes/venues.js
const router = require('express').Router();
const Venue = require('../models/Venue');
const SeatCatalog = require('../models/SeatCatalog');

router.get('/', async (_req,res,next)=>{
  try {
    const venues = await Venue.find({}, { _id:0, slug:1, name:1, svgPath:1, zones:1 }).lean();
    res.json({ venues });
  } catch(e){ next(e); }
});

router.get('/:slug/seats', async (req,res,next)=>{
  try {
    const catalog = await SeatCatalog.find(
      { venueSlug: req.params.slug },
      { _id:0, seatId:1, zoneKey:1, row:1, number:1 }
    ).lean();
    res.json({ seats: catalog });
  } catch(e){ next(e); }
});

module.exports = router;
