const router = require('express').Router();
const Order = require('../models/Order');
const { splitInstallments } = require('../utils/money');
const { createCheckout } = require('../payments/helloasso');
const { orderNo } = require('../utils/ids');
const { getPriceFor } = require('../services/pricing');
const { holdSeat } = require('../controllers/seat');
const { checkPhase } = require('../middlewares/phase');

router.get('/seats', async (req,res,next)=>{ /* inchangé */ });

router.post('/checkout', checkPhase('public'), async (req,res,next)=>{
  try{
    const { seasonCode, selections = [], installmentsCount = 1, buyer } = req.body;
    const items = [];

    for (const s of selections) {
      if (s.seatId) {
        const pr = await getPriceFor({ seasonCode, seatId: s.seatId, tariffCode: s.tariffCode || 'ADULT', context: 'public' });
        if (pr.requiresJustification && !s.justification) {
          return res.status(400).json({ error: `justification required for ${s.tariffCode} on seat ${s.seatId}` });
        }
        items.push({ kind:'SEAT', seatId: s.seatId, tariffCode: s.tariffCode || 'ADULT', unitPriceCents: pr.unitPriceCents, justification: s.justification || null });
      } else if (s.zoneKey && s.quantity) {
        // Standing (ex: DEBOUT) — on prix via la grille de la zone
        const pr = await getPriceFor({ seasonCode, zoneKey: s.zoneKey, tariffCode: s.tariffCode || 'ADULT', context: 'public' });
        items.push({ kind:'STANDING', zoneKey: s.zoneKey, quantity: s.quantity, tariffCode: s.tariffCode || 'ADULT', unitPriceCents: pr.unitPriceCents });
      } else {
        return res.status(400).json({ error: 'invalid selection item' });
      }
    }

    const total = items.reduce((a,i)=> a + i.unitPriceCents * (i.quantity || 1), 0);

    const order = await Order.create({
      orderNo: orderNo(),
      seasonCode,
      phase: 'public',
      buyer, items,
      totals: { subtotalCents: total, discountCents:0, totalCents: total },
      installments: { count: installmentsCount, schedule: splitInstallments(total, installmentsCount) },
      status: 'pendingPayment'
    });

    // Hold seulement pour les sièges individuels
    for (const it of items) {
      if (it.kind === 'SEAT') await holdSeat({ seatId: it.seatId, orderId: order._id, ttlMinutes: 10 });
    }

    const { checkoutUrl, checkoutSessionId } = await createCheckout({
      order, returnUrl:`${process.env.APP_URL}/return/${order.orderNo}`, cancelUrl:`${process.env.APP_URL}/cancel/${order.orderNo}`
    });
    order.helloAsso = { checkoutSessionId };
    await order.save();

    res.json({ checkoutUrl });
  }catch(e){ next(e); }
});

module.exports = router;
