const router = require('express').Router();
const jwt = require('jsonwebtoken');
const Subscriber = require('../models/Subscriber');
const Seat = require('../models/Seat');
const Order = require('../models/Order');
const { splitInstallments } = require('../utils/money');
const { createCheckout } = require('../payments/helloasso');
const { orderNo } = require('../utils/ids');

function decodeToken(token) { return jwt.verify(token, process.env.JWT_SECRET); }

router.get('/', async (req,res,next)=>{
  try{
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'missing id' });
    const payload = decodeToken(id);
    const sub = await Subscriber.findById(payload.subscriberId);
    if (!sub) return res.status(404).json({ error: 'subscriber not found' });
    const seats = await Seat.find({ seatId: { $in: sub.previousSeasonSeats }, seasonCode: payload.seasonCode });
    res.json({ subscriber: { firstName: sub.firstName, lastName: sub.lastName, email: sub.email }, seats });
  }catch(e){ next(e); }
});

router.post('/', async (req,res,next)=>{
  try{
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'missing id' });
    const payload = decodeToken(id);
    const { selections = [], installmentsCount = 1, buyer } = req.body;
    const total = selections.reduce((a,s)=>a + (s.unitPriceCents||0), 0);
    const order = await Order.create({
      orderNo: orderNo(),
      seasonCode: payload.seasonCode,
      phase: 'renewal',
      buyer,
      items: selections.map(s=>({ kind:'SEAT', seatId: s.seatId, tariffCode: s.tariffCode, unitPriceCents: s.unitPriceCents, justification: s.justification })),
      totals: { subtotalCents: total, discountCents:0, totalCents: total },
      installments: { count: installmentsCount, schedule: splitInstallments(total, installmentsCount) },
      status: 'pendingPayment'
    });
    const { checkoutSessionId, checkoutUrl } = await createCheckout({
      order, returnUrl: `${process.env.APP_URL}/return/${order.orderNo}`, cancelUrl: `${process.env.APP_URL}/cancel/${order.orderNo}`
    });
    order.helloAsso = { checkoutSessionId };
    await order.save();
    res.json({ checkoutUrl });
  }catch(e){ next(e); }
});

module.exports = router;
