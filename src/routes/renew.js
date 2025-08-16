// src/routes/renew.js
const router = require('express').Router();
const jwt = require('jsonwebtoken');

const Subscriber = require('../models/Subscriber');
const Seat = require('../models/Seat');
const Order = require('../models/Order');

const { splitInstallments } = require('../utils/money');
const { orderNo } = require('../utils/ids');
const { priceForLine, needJustification } = require('../utils/pricing');
const { holdSeat } = require('../controllers/seat');
const { checkPhase } = require('../middlewares/phase');

// --- utils
function decodeTokenOrThrow(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    const err = new Error('invalid or expired token');
    err.status = 401;
    throw err;
  }
}

// GET /s/renew?id=JWT&seat=A1-001   (utilisé par la page de renouvellement)
router.get('/', async (req, res, next) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'missing id' });

    const payload = decodeTokenOrThrow(id); // { subscriberId, seasonCode, phase:'renewal' }
    const sub = await Subscriber.findById(payload.subscriberId);
    if (!sub) return res.status(404).json({ error: 'subscriber not found' });

    // Siège préféré passé dans l’URL
    const seatFromUrl = (req.query.seat || '').trim();

    // On renvoie les sièges liés à la saison et aux références N-1
    const seats = await Seat.find(
      { seatId: { $in: sub.previousSeasonSeats }, seasonCode: payload.seasonCode },
      { seatId: 1, zoneKey: 1, status: 1, provisionedFor: 1 }
    );

    // Ne pré-sélectionner que si ce siège fait bien partie du N-1 du subscriber
    let prefSeatId = null;
    if (seatFromUrl && sub.previousSeasonSeats.includes(seatFromUrl)) {
      prefSeatId = seatFromUrl;
    }

    res.json({
      seasonCode: payload.seasonCode,
      subscriber: { id: sub._id, firstName: sub.firstName, lastName: sub.lastName, email: sub.email },
      seats,
      prefSeatId
    });
  } catch (e) { next(e); }
});

// POST /s/renew?id=JWT   (crée la commande + redirige vers Checkout HelloAsso)
router.post('/', checkPhase('renewal'), async (req, res, next) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'missing id' });

    const payload = decodeTokenOrThrow(id); // { subscriberId, seasonCode, phase:'renewal' }
    const sub = await Subscriber.findById(payload.subscriberId);
    if (!sub) return res.status(404).json({ error: 'subscriber not found' });

    const { selections = [], installmentsCount = 1, buyer } = req.body;
    if (!Array.isArray(selections) || selections.length === 0) {
      return res.status(400).json({ error: 'no selections' });
    }

    // Validation + pricing côté serveur
    const items = [];
    for (const s of selections) {
      if (!s.seatId || !s.tariffCode) {
        return res.status(400).json({ error: 'invalid selection item' });
      }

      // sécurité : le siège choisi doit faire partie des places N-1 du subscriber
      if (!sub.previousSeasonSeats.includes(s.seatId)) {
        return res.status(403).json({ error: `seat ${s.seatId} not eligible for renewal` });
      }

      // calcule le prix via la grille (et applique les règles éventuelles)
      const pr = await priceForLine({
        seasonCode: payload.seasonCode,
        seatId: s.seatId,
        tariffCode: s.tariffCode,
        context: 'renewal'
      });

      // justificatif si tarif réduit
      if (needJustification(s.tariffCode) && !s.justification) {
        return res.status(400).json({ error: `justification required for ${s.tariffCode} on seat ${s.seatId}` });
      }

      items.push({
        kind: 'SEAT',
        seatId: s.seatId,
        tariffCode: s.tariffCode,
        unitPriceCents: pr.amountCents,
        justification: s.justification || null
      });
    }

    const total = items.reduce((a, it) => a + it.unitPriceCents, 0);

    // Crée la commande
    const order = await Order.create({
      orderNo: orderNo(),
      seasonCode: payload.seasonCode,
      phase: 'renewal',
      buyer,
      items,
      totals: { subtotalCents: total, discountCents: 0, totalCents: total },
      installments: { count: installmentsCount, schedule: splitInstallments(total, installmentsCount) },
      status: 'pendingPayment'
    });

    // HOLD des sièges — autorisé si 'provisioned' pour CE subscriber
    for (const it of items) {
      await holdSeat({
        seatId: it.seatId,
        seasonCode: payload.seasonCode,
        orderId: order._id,
        ttlMinutes: 10,
        subscriberId: payload.subscriberId
      });
    }

    // Paiement : appel à notre endpoint interne HelloAsso (gère env & OAuth2)
    const payRes = await fetch(`${process.env.APP_URL}/api/payments/helloasso/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderNo: order.orderNo,
        subscriberId: payload.subscriberId,
        seasonCode: order.seasonCode,
        totalCents: order.totals.totalCents,
        itemName: 'Abonnement',
        installments: installmentsCount,
        payer: {
          email: buyer?.email,
          firstName: buyer?.firstName,
          lastName:  buyer?.lastName
        }
      })
    });

    if (!payRes.ok) {
      const errTxt = await payRes.text().catch(() => '');
      // Best-effort : si l'init paiement échoue, on remet le statut 'provisioned'
      for (const it of items) {
        try {
          const seat = await Seat.findOne({ seatId: it.seatId, seasonCode: payload.seasonCode });
          if (seat && seat.status === 'held') {
            seat.status = 'provisioned';
            seat.provisionedFor = payload.subscriberId;
            await seat.save();
          }
        } catch {}
      }
      return res.status(502).json({ error: `checkout init failed`, details: errTxt });
    }

    const { redirectUrl, checkoutIntentId } = await payRes.json();
    order.helloAsso = { checkoutIntentId };
    await order.save();

    return res.json({ checkoutUrl: redirectUrl });
  } catch (e) { next(e); }
});

module.exports = router;
