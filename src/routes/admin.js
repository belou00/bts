const router = require('express').Router();
const Zone = require('../models/Zone');
const Seat = require('../models/Seat');
const PriceTable = require('../models/PriceTable');
const { requireAdmin } = require('../middlewares/authz');

router.post('/zones', requireAdmin, async (req,res)=>{ res.json(await Zone.create(req.body)); });
router.get('/zones', requireAdmin, async (_req,res)=>{ res.json(await Zone.find({})); });

router.post('/seats/:seatId/block', requireAdmin, async (req,res)=>{
  const seat = await Seat.findOneAndUpdate({ seatId: req.params.seatId }, { $set:{ status:'blocked', blockerReason:req.body.reason } }, { new:true });
  res.json(seat);
});

router.post('/prices', requireAdmin, async (req,res)=>{ res.json(await PriceTable.create(req.body)); });
router.get('/prices', requireAdmin, async (_req,res)=>{ res.json(await PriceTable.find({})); });

module.exports = router;
