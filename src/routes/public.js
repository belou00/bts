const router = require('express').Router();
const Seat = require('../models/Seat');
const Zone = require('../models/Zone');
const Order = require('../models/Order');
const { splitInstallments } = require('../utils/money');
const { createCheckout } = require('../payments/helloasso');
const { orderNo } = require('../utils/ids');

router.get('/seats', async (req,res,next)=>{
  try{
    const { seasonCode } = req.query;
    const seats = await Seat.find({ seasonCode, status: { $in:['available','held'] } }, { seatId:1, zoneKey:1, status:1 });
    const zones = await Zone.find({ seasonCode, isActive:true });
    res.json({ seats, zones });
  }catch(e){ next(e); }
});

router.post('/checkout', async (req,res,next)=>{
  try{
    const { seasonCode, selections = [], installmentsCount = 1, buyer } = req.body;
    const total = selections.reduce((a,s)=>a + (s.unitPriceCents||0) * (s.quantity||1), 0);
    const order = await Order.create({
      orderNo: orderNo(),
      seasonCode, phase: 'public', buyer,
      items: selections,
      totals: { subtotalCents: total, discountCents:0, totalCents: total },
      installments: { count: installmentsCount, schedule: splitInstallments(total, installmentsCount) },
      status: 'pendingPayment'
    });
    const { checkoutUrl, checkoutSessionId } = await createCheckout({ order, returnUrl:`${process.env.APP_URL}/return/${order.orderNo}`, cancelUrl:`${process.env.APP_URL}/cancel/${order.orderNo}` });
    order.helloAsso = { checkoutSessionId };
    await order.save();
    res.json({ checkoutUrl });
  }catch(e){ next(e); }
});

module.exports = router;
