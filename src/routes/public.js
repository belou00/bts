
import express from 'express';

import Seat from '../models/Seat.js';
import Zone from '../models/Zone.js';
import Order from '../models/Order.js';
import { splitInstallments } from '../utils/money.js';
import { orderNo } from '../utils/ids.js';
import { priceForLine, needJustification } from '../utils/pricing.js';
import { holdSeat } from '../controllers/seat.js';
import { checkPhase } from '../middlewares/phase.js';

const router = express.Router();

router.get('/seats', async (req,res,next)=>{
  try{
    const { seasonCode } = req.query;
    // on renvoie toutes les places non "booked" pour l’affichage
    const seats = await Seat.find({ seasonCode, status: { $in:['available','held','provisioned'] } }, { seatId:1, zoneKey:1, status:1, provisionedFor:1 });
    const zones = await Zone.find({ seasonCode, isActive:true });
    res.json({ seats, zones });
  }catch(e){ next(e); }
});

router.post('/checkout', checkPhase('public'), async (req,res,next)=>{
  try{
    const { seasonCode, selections = [], installmentsCount = 1, buyer } = req.body;
    const items = [];

    for (const s of selections) {
      if (s.seatId) {
        const seat = await Seat.findOne({ seatId: s.seatId, seasonCode });
        if (!seat) return res.status(404).json({ error: `seat ${s.seatId} not found` });
        if (seat.status !== 'available') {
          return res.status(409).json({ error: `seat ${s.seatId} is not available (${seat.status})` });
        }
        const pr = await priceForLine({ seasonCode, seatId: s.seatId, tariffCode: s.tariffCode || 'ADULT', context:'public' });
        if (needJustification(s.tariffCode) && !s.justification) {
          return res.status(400).json({ error: `justification required for ${s.tariffCode} on seat ${s.seatId}` });
        }
        items.push({ kind:'SEAT', seatId: s.seatId, tariffCode: s.tariffCode || 'ADULT', unitPriceCents: pr.amountCents, justification: s.justification || null });
      } else if (s.zoneKey && s.quantity) {
        const pr = await priceForLine({ seasonCode, zoneKey: s.zoneKey, tariffCode: s.tariffCode || 'ADULT', context:'public' });
        items.push({ kind:'STANDING', zoneKey: s.zoneKey, quantity: s.quantity, tariffCode: s.tariffCode || 'ADULT', unitPriceCents: pr.amountCents });
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

    // Hold (uniquement sur seats disponibles)
    for (const it of items) {
      if (it.kind === 'SEAT') await holdSeat({ seatId: it.seatId, seasonCode, orderId: order._id, ttlMinutes: 10 });
    }

    // Paiement : délégué au service /api/payments/helloasso/checkout (déjà en place)
    const payRes = await fetch(`${process.env.APP_URL}/api/payments/helloasso/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderNo: order.orderNo,
        subscriberId: null,
        seasonCode,
        totalCents: order.totals.totalCents,
        itemName: 'Abonnement',
        installments: installmentsCount,
        payer: { email: buyer?.email, firstName: buyer?.firstName, lastName:  buyer?.lastName }
      })
    });
    if (!payRes.ok) return res.status(502).send(await payRes.text());
    const { redirectUrl, checkoutIntentId } = await payRes.json();
    order.helloAsso = { checkoutIntentId };
    await order.save();
    res.json({ checkoutUrl: redirectUrl });
  }catch(e){ next(e); }
});

module.exports = router;
