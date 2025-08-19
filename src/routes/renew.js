// src/routes/renew.js
const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');

const Seat = require('../models/Seat');
const Subscriber = require('../models/Subscriber');
const Season = require('../models/Season');
const Tariff = require('../models/Tariff');
const TariffPrice = require('../models/TariffPrice');
const Order = require('../models/Order');

const payments = require('../payments/helloasso'); // STUB/HA
const router = express.Router();

function bad(res, msg = 'bad_request', code = 400) {
  return res.status(code).json({ error: msg });
}
function decodeToken(t) {
  try { return jwt.verify(t, process.env.JWT_SECRET); }
  catch { return null; }
}

// Déduit un zoneKey cohérent depuis un seatId du type "S1-A-001", "N1-H-015", etc.
function zoneFromSeatId(seatId) {
  if (!seatId) return null;
  return String(seatId).split('-')[0].toUpperCase(); // tout ce qui est avant le 1er '-'
}

router.get('/s/renew', async (req, res) => {
  const { id: token, seat } = req.query;
  if (!token) return bad(res, 'invalid_or_expired_token', 401);

  const payload = decodeToken(token);
  if (!payload) return bad(res, 'invalid_or_expired_token', 401);

  const { seasonCode, venueSlug, groupKey, email, seatIds = [] } = payload;

  // Saison / phase renewal
  const season = await Season.findOne({ code: seasonCode }).lean();
  if (!season) return bad(res, 'season_not_found', 404);
  const renewalPhase = (season.phases || []).find(p => p.name === 'renewal' && p.enabled !== false);
  if (!renewalPhase) return bad(res, 'renewal_phase_closed', 403);

  const focusSeatId = seat && typeof seat === 'string' ? seat : null;

  // Abonnés du groupe
  const subs = await Subscriber.find({ seasonCode, venueSlug, groupKey }).lean();
  const subsOrEmail = subs.length ? subs : await Subscriber.find({ seasonCode, venueSlug, email }).lean();

  // Sièges de la saison/lieu
  const seats = await Seat.find({ seasonCode, venueSlug }).lean();

  // Zones distinctes (au cas où certains sièges aient encore "S" → on le garde tel quel pour l’affichage brut)
  const zones = Array.from(new Set(seats.map(s => s.zoneKey).filter(Boolean))).sort();

  // Tarifs actifs + prix
  const activeTariffs = await Tariff.find({ active: true }).sort({ sortOrder: 1, code: 1 }).lean();
  const prices = await TariffPrice.find({ seasonCode, venueSlug }).lean();
  const priceMap = new Map(prices.map(p => [`${p.zoneKey}:${p.tariffCode}`, p.priceCents]));

  const tokenSeatIds = (seatIds || []).filter(Boolean);

  // JSON → données brutes pour le front
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
      seats: seats.map(s => ({ seatId: s.seatId, zoneKey: s.zoneKey, status: s.status })),
      tariffs: activeTariffs.map(t => ({
        code: t.code, label: t.label,
        requiresField: !!t.requiresField, fieldLabel: t.fieldLabel || '',
        requiresInfo: !!t.requiresInfo
      })),
      prices: Array.from(priceMap.entries()).map(([k,v]) => {
        const [zoneKey, tariffCode] = k.split(':'); return { zoneKey, tariffCode, priceCents: v };
      })
    });
  }

  // Sinon HTML
  return res.sendFile('renew.html', { root: path.join(__dirname, '..', 'public', 'html') });
});

// POST: checkout (STUB/HA) + fallback zoneKey si incohérence
router.post('/s/renew', async (req, res) => {
  try {
    const { id: token } = req.query;
    if (!token) return bad(res, 'invalid_or_expired_token', 401);
    const payload = decodeToken(token);
    if (!payload) return bad(res, 'invalid_or_expired_token', 401);

    const { seasonCode, venueSlug, groupKey, email } = payload;

    // déjà payé ?
    const already = await Order.exists({ seasonCode, venueSlug, groupKey, status: 'paid' });
    if (already) return bad(res, 'already_renewed', 409);

    const { lines = [], installments = 1, payer = {} } = req.body || {};
    if (!Array.isArray(lines) || lines.length === 0) return bad(res, 'empty_cart');

    const seatIds = lines.map(l => l.seatId).filter(Boolean);
    const seats = await Seat.find({ seasonCode, venueSlug, seatId: { $in: seatIds } });
    if (seats.length !== seatIds.length) return bad(res, 'unknown_seat', 400);

    // prix
    const prices = await TariffPrice.find({ seasonCode, venueSlug }).lean();
    const priceMap = new Map(prices.map(p => [`${p.zoneKey}:${p.tariffCode}`, p.priceCents]));

    let totalCents = 0;
    for (const l of lines) {
      const seatId = l.seatId;
      const tcode = String(l.tariffCode || '').toUpperCase();

      const s = seats.find(x => x.seatId === seatId);
      if (!s) return bad(res, `unknown_seat:${seatId}`, 400);

      // 1) essaie avec zoneKey stocké
      let z = s.zoneKey;
      let pc = priceMap.get(`${z}:${tcode}`);

      // 2) fallback: déduire depuis seatId (S1-A-001 → S1) si pas trouvé
      if (!Number.isFinite(pc)) {
        const derived = zoneFromSeatId(seatId);
        if (derived && derived !== z) {
          z = derived;
          pc = priceMap.get(`${z}:${tcode}`);
        }
      }

      if (!Number.isFinite(pc)) {
        return bad(res, `no_price_for:${z || 'unknown'}:${tcode}`, 400);
      }
      totalCents += pc;
    }

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
