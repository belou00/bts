// src/routes/renew.js
const express = require('express');
const jwt = require('jsonwebtoken');

const Subscriber = require('../models/Subscriber');
const Seat = require('../models/Seat');
const Season = require('../models/Season');
const Tariff = require('../models/Tariff');
const TariffPrice = require('../models/TariffPrice');

const router = express.Router();

function isPhaseOpen(seasonDoc, phaseName = 'renewal') {
  if (!seasonDoc || !Array.isArray(seasonDoc.phases)) return false;
  const p = seasonDoc.phases.find(x => x.name === phaseName && x.enabled !== false);
  if (!p) return false;
  const now = new Date();
  if (p.openAt && now < new Date(p.openAt)) return false;
  if (p.closeAt && now > new Date(p.closeAt)) return false;
  return true;
}
function basePath(req) {
  return req.app.get('basePath') || '';
}
function upper(s){ return String(s||'').toUpperCase(); }

// Déduction zone depuis seatId, ex: "S1-A-001" => "S1"; tolère "S-A-001" => "S"
function deriveZoneFromSeatId(seatId) {
  const id = String(seatId || '');
  let m = /^([A-Z]\d+)-/.exec(id);  // S1-...
  if (m) return m[1];
  m = /^([A-Z])-/.exec(id);         // S-...
  return m ? m[1] : null;
}

// Nettoyage robuste du token (quotes, espaces, zero-width, guillemets typographiques)
function cleanToken(raw) {
  return String(raw || '')
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, '')
    .replace(/[\u200B\u200C\u200D\u2060\uFEFF]+/g, '');
}

router.get('/s/renew', async (req, res, next) => {
  try {
    const raw = req.query.id;
    if (!raw) return res.status(400).json({ error: 'missing_token' });
    const id = cleanToken(raw);

    let payload;
    try {
      const ignoreExp = process.env.RENEW_JWT_IGNORE_EXP === 'true';
      payload = jwt.verify(id, process.env.JWT_SECRET, ignoreExp ? { ignoreExpiration: true } : undefined);
    } catch {
      return res.status(401).json({ error: 'invalid_or_expired_token' });
    }

    const { email, groupKey, seasonCode, venueSlug, seatIds = [] } = payload || {};
    if (!seasonCode || !venueSlug) return res.status(400).json({ error: 'bad_token_payload' });

    const season = await Season.findOne({ code: seasonCode }).lean();
    if (!season) return res.status(404).json({ error: 'season_not_found' });

    // Récup sièges : priorité aux seatIds du token
    let seats = [];
    if (Array.isArray(seatIds) && seatIds.length) {
      seats = await Seat.find({ seasonCode, venueSlug, seatId: { $in: seatIds } }).lean();
    } else {
      seats = await Seat.find({ seasonCode, venueSlug, status: 'provisioned' }).lean();

      // fallback: précédents par email
      if (!seats.length && email) {
        const subs = await Subscriber.find({ email }).lean();
        const allPrev = subs.flatMap(s => Array.isArray(s.previousSeasonSeats) ? s.previousSeasonSeats : []);
        const uniq = [...new Set(allPrev)];
        if (uniq.length) {
          seats = await Seat.find({ seasonCode, venueSlug, seatId: { $in: uniq } }).lean();
        }
      }
    }

    const seatsOut = seats.map(s => {
      const z = deriveZoneFromSeatId(s.seatId) || s.zoneKey || null;
      return { seatId: s.seatId, zoneKey: z, status: s.status };
    });
    const zones = [...new Set(seatsOut.map(s => s.zoneKey).filter(Boolean))];

    // Tarifs dédupliqués par code (UPPER), ordre par sortOrder puis code
    const catalogRaw = await Tariff.find({ active: true }).sort({ sortOrder: 1, code: 1 }).lean();
    const byCode = new Map();
    for (const t of catalogRaw) {
      const code = upper(t.code);
      if (!byCode.has(code)) byCode.set(code, t);
    }
    const catalog = Array.from(byCode.values());

    const prices = zones.length
      ? await TariffPrice.find({ seasonCode, venueSlug, zoneKey: { $in: zones } }).lean()
      : [];

    const pricesByZone = {};
    for (const p of prices) {
      if (!pricesByZone[p.zoneKey]) pricesByZone[p.zoneKey] = {};
      pricesByZone[p.zoneKey][upper(p.tariffCode)] = p.priceCents;
    }

    // Remonter titulaires par siège :
    // - priorité à groupKey s'il est dans le token, sinon email
    let subs = [];
    if (groupKey) subs = await Subscriber.find({ groupKey }).lean();
    else if (email) subs = await Subscriber.find({ email }).lean();

    const holdersBySeat = {};
    if (subs.length && seatsOut.length) {
      for (const s of seatsOut) {
        const hit = subs.find(u =>
          u.prefSeatId === s.seatId ||
          (Array.isArray(u.previousSeasonSeats) && u.previousSeasonSeats.includes(s.seatId))
        );
        if (hit) {
          holdersBySeat[s.seatId] = {
            firstName: hit.firstName || '',
            lastName: hit.lastName || ''
          };
        }
      }
    }

    const planUrl = `${basePath(req)}/venues/${venueSlug}/plan.svg`;

    res.json({
      ok: true,
      seasonCode,
      venueSlug,
      email: email || null,
      phase: isPhaseOpen(season, 'renewal') ? 'open' : 'closed',
      seats: seatsOut,
      holdersBySeat,
      tariffs: catalog.map(t => ({
        code: upper(t.code),
        label: t.label,
        requiresField: !!t.requiresField,
        fieldLabel: t.fieldLabel || null,
        requiresInfo: !!t.requiresInfo,
        sortOrder: t.sortOrder || 0
      })),
      pricesByZone,
      venuePlanUrl: planUrl
    });
  } catch (err) {
    next(err);
  }
});

// POST /s/renew : stub paiement si HELLOASSO_STUB=true
router.post('/s/renew', async (req, res, next) => {
  try {
    const { seasonCode, venueSlug, contactEmail, installments = 1, lines = [] } = req.body || {};
    if (!seasonCode || !venueSlug || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: 'bad_request' });
    }

    // Recalcul du total depuis la base
    const zones = [...new Set(lines.map(l => l.zoneKey || deriveZoneFromSeatId(l.seatId)).filter(Boolean))];
    const prices = zones.length
      ? await TariffPrice.find({ seasonCode, venueSlug, zoneKey: { $in: zones } }).lean()
      : [];

    const priceMap = {};
    for (const p of prices) priceMap[`${p.zoneKey}::${upper(p.tariffCode)}`] = p.priceCents;

    let totalCents = 0;
    for (const l of lines) {
      const zone = l.zoneKey || deriveZoneFromSeatId(l.seatId);
      const code = upper(l.tariffCode);
      if (!zone || !code) return res.status(400).json({ error: 'invalid_line', seatId: l.seatId });
      const cents = priceMap[`${zone}::${code}`];
      if (typeof cents !== 'number') return res.status(400).json({ error: 'price_not_found', seatId: l.seatId, zone, code });
      totalCents += cents;
    }

    // STUB
    if (String(process.env.HELLOASSO_STUB).toLowerCase() === 'true') {
      const result = String(process.env.HELLOASSO_STUB_RESULT || 'success').toLowerCase();
      if (result === 'success') {
        return res.json({
          ok: true,
          stub: true,
          totalCents,
          redirectUrl: `${basePath(req)}/stub-checkout?amount=${totalCents}&email=${encodeURIComponent(contactEmail||'')}`
        });
      } else {
        return res.status(400).json({ error: 'stub_payment_failed' });
      }
    }

    return res.status(501).json({ error: 'helloasso_not_wired_here' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
