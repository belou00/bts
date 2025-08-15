const router = require('express').Router();
const Campaign = require('../models/Campaign');
const Zone = require('../models/Zone');
const Order = require('../models/Order');
const { splitInstallments } = require('../utils/money');
const { createCheckout } = require('../payments/helloasso');
const { orderNo } = require('../utils/ids');
const { getPriceFor } = require('../services/pricing');
const { checkPhase } = require('../middlewares/phase');

router.get('/', checkPhase('tbh7'), async (req,res,next)=>{ /* ... */ });

router.post('/', checkPhase('tbh7'), async (req,res,next)=>{
  try{
    const { id } = req.query;
    const { zoneKey, persons = [], installmentsCount = 1, buyer } = req.body;
    const camp = await Campaign.findOne({ code: id, phase:'tbh7' });
    if (!camp) return res.status(404).json({ error: 'campaign not found' });
    const zone = await Zone.findOne({ key: zoneKey, seasonCode: camp.seasonCode });
    if (!zone) return res.status(404).json({ error: 'zone not found' });

    const items = [];
    for (const p of persons) {
      const pr = await getPriceFor({ seasonCode: camp.seasonCode, zoneKey, tariffCode: p.tariffCode || 'ADULT', context: 'tbh7' });
      items.push({ kind:'SEAT', zoneKey, quantity:1, tariffCode: p.tariffCode || 'ADULT', unitPriceCents: pr.unitPriceCents });
    }

    const total = items.reduce((a,i)=>a+i.unitPriceCents,0);

    const order = await Order.create({
      orderNo: orderNo(),
      seasonCode: camp.seasonCode,
      phase: 'tbh7',
      buyer, items,
      totals: { subtotalCents: total, discountCents:0, totalCents: total },
      installments: { count: installmentsCount, schedule: splitInstallments(total, installmentsCount) },
      status: 'pendingPayment'
    });

    const { checkoutUrl, checkoutSessionId } = await createCheckout({
      order, returnUrl:`${process.env.APP_URL}/return/${order.orderNo}`, cancelUrl:`${process.env.APP_URL}/cancel/${order.orderNo}`
    });
    order.helloAsso = { checkoutSessionId };
    await order.save();
    res.json({ checkoutUrl });
  }catch(e){ next(e); }
});

module.exports = router;
