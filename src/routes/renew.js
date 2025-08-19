// src/routes/renew.js
const express = require('express');
const jwt = require('jsonwebtoken');
const Seat = require('../models/Seat');
const Subscriber = require('../models/Subscriber');
const Season = require('../models/Season');
const Tariff = require('../models/Tariff');
const TariffPrice = require('../models/TariffPrice');
const Order = require('../models/Order'); // <- assure-toi que ce modèle existe
const router = express.Router();

function bad(res, msg = 'bad_request', code = 400) {
  return res.status(code).json({ error: msg });
}
function decodeToken(t) {
  try { return jwt.verify(t, process.env.JWT_SECRET); }
  catch { return null; }
}

router.get('/s/renew', async (req, res) => {
  const { id: token, seat } = req.query;
  if (!token) return bad(res, 'invalid_or_expired_token', 401);

  const payload = decodeToken(token);
  if (!payload) return bad(res, 'invalid_or_expired_token', 401);

  const { seasonCode, venueSlug, groupKey, email, seatIds = [] } = payload;

  // Saison / phase
  const season = await Season.findOne({ code: seasonCode }).lean();
  if (!season) return bad(res, 'season_not_found', 404);
  const renewalPhase = (season.phases || []).find(p => p.name === 'renewal' && p.enabled !== false);
  if (!renewalPhase) return bad(res, 'renewal_phase_closed', 403);

  // Si un siège précis demandé via ?seat=
  const focusSeatId = seat && typeof seat === 'string' ? seat : null;

  // Récup abonnés du groupe
  const subs = await Subscriber.find({ seasonCode, venueSlug, groupKey }).lean();

  // Si vide, on essaie par email (compat backward)
  const subsOrEmail = subs.length ? subs : await Subscriber.find({ seasonCode, venueSlug, email }).lean();

  // Récup sièges public (pour afficher plan + zones)
  const seats = await Seat.find({ seasonCode, venueSlug }).lean();
  const zonesSet = new Set(seats.map(s => s.zoneKey).filter(Boolean));
  const zones = Array.from(zonesSet).sort();

  // Tarifs (catalogue + prix par zone)
  const activeTariffs = await Tariff.find({ active: true }).sort({ sortOrder: 1, code: 1 }).lean();
  const prices = await TariffPrice.find({ seasonCode, venueSlug }).lean();

  const priceMap = new Map();
  for (const p of prices) priceMap.set(`${p.zoneKey}:${p.tariffCode}`, p.priceCents);

  // “Détail sièges” dans le token (préférences)
  const tokenSeatIds = (seatIds || []).filter(Boolean);

  // Réponse JSON si demandé
  if (req.get('Accept')?.includes('application/json')) {
    return res.json({
      ok: true,
      seasonCode, venueSlug, groupKey, email,
      tokenSeats: tokenSeatIds,
      focusSeatId,
      subscribers: subsOrEmail.map(s => ({
        firstName: s.firstName, lastName: s.lastName, prefSeatId: s.prefSeatId,
        previousSeasonSeats: s.previousSeasonSeats || []
      })),
      seats: seats.map(s => ({
        seatId: s.seatId, zoneKey: s.zoneKey, status: s.status
      })),
      tariffs: activeTariffs.map(t => ({
        code: t.code, label: t.label, requiresField: !!t.requiresField, fieldLabel: t.fieldLabel || '',
        requiresInfo: !!t.requiresInfo
      })),
      prices: Array.from(priceMap.entries()).map(([k, v]) => {
        const [zoneKey, tariffCode] = k.split(':');
        return { zoneKey, tariffCode, priceCents: v };
      })
    });
  }

  // Sinon: page HTML
  return res.sendFile('renew.html', { root: require('path').join(__dirname, '..', 'public', 'html') });
});

// === Guard anti double-commande + dispatch checkout ===
router.post('/s/renew', async (req, res) => {
  try {
    const { id: token } = req.query;
    if (!token) return bad(res, 'invalid_or_expired_token', 401);
    const payload = decodeToken(token);
    if (!payload) return bad(res, 'invalid_or_expired_token', 401);

    const { seasonCode, venueSlug, groupKey, email } = payload;

    // 1) déjà payé ?
    const already = await Order.exists({ seasonCode, venueSlug, groupKey, status: 'paid' });
    if (already) return bad(res, 'already_renewed', 409);

    // 2) seats choisis dans body
    const { lines = [], installments = 1, payer = {} } = req.body || {};
    if (!Array.isArray(lines) || lines.length === 0) return bad(res, 'empty_cart');

    // 3) disponibilité des sièges
    const seatIds = lines.map(l => l.seatId).filter(Boolean);
    const seats = await Seat.find({ seasonCode, venueSlug, seatId: { $in: seatIds } });
    if (seats.length !== seatIds.length) return bad(res, 'unknown_seat', 400);
    for (const s of seats) {
      if (s.status === 'booked') return bad(res, `seat_already_booked:${s.seatId}`, 409);
      if (s.status === 'held' && String(s.provisionedFor) !== String(payer.subscriberId || '')) {
        return bad(res, `seat_held_by_other:${s.seatId}`, 409);
      }
    }

    // 4) calcule total (prix par zone + tarif)
    const prices = await TariffPrice.find({ seasonCode, venueSlug }).lean();
    const priceMap = new Map();
    for (const p of prices) priceMap.set(`${p.zoneKey}:${p.tariffCode}`, p.priceCents);

    let totalCents = 0;
    for (const l of lines) {
      const zoneKey = seats.find(s => s.seatId === l.seatId)?.zoneKey;
      const pc = priceMap.get(`${zoneKey}:${(l.tariffCode || '').toUpperCase()}`);
      if (!Number.isFinite(pc)) return bad(res, `no_price_for:${zoneKey}:${l.tariffCode}`, 400);
      totalCents += pc;
    }

    // 5) dispatch paiement (HelloAsso / STUB)
    const payments = require('./payments/helloasso'); // module qui expose checkout()
    const result = await payments.checkout({
      seasonCode, venueSlug, groupKey, email,
      lines, totalCents, installments, payer
    });

    return res.json(result);
  } catch (e) {
    console.error('[renew POST] error', e);
    return bad(res, 'internal_error', 500);
  }
});

module.exports = router;
