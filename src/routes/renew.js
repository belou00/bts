// src/routes/renew.js
const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');

const Season = require('../models/Season');
const Subscriber = require('../models/Subscriber');
const Seat = require('../models/Seat');

const {
  getTariffCatalog,
  getZonePriceTable,
  computeSubscriptionPriceCents,
  requiresJustifFromCatalog
} = require('../utils/pricing');

const router = express.Router();

function getBasePath() {
  try {
    const u = new URL(process.env.APP_URL || 'http://localhost:8080');
    const p = u.pathname || '/';
    return p === '/' ? '' : p.replace(/\/$/, '');
  } catch { return ''; }
}
function wantsJson(req) {
  const a = (req.headers['accept'] || '').toLowerCase();
  return a.includes('application/json') || req.xhr;
}

/** GET /s/renew?id=<JWT>[&seat=<prefSeatId>] */
router.get('/s/renew', async (req, res, next) => {
  const asJson = wantsJson(req);
  try {
    const token = req.query.id;
    if (!token) return asJson ? res.status(400).json({ error: 'missing_token' }) : sendRenewHtml(res);

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return asJson ? res.status(401).json({ error: 'invalid_or_expired_token' }) : sendRenewHtml(res);
    }
    if (payload.phase !== 'renewal') return asJson ? res.status(400).json({ error: 'wrong_phase' }) : sendRenewHtml(res);

    const season = await Season.findOne({ code: payload.seasonCode }).lean();
    if (!season) return asJson ? res.status(404).json({ error: 'season_not_found' }) : sendRenewHtml(res);

    // groupKey
    let groupKey = payload.groupKey || null;
    if (!groupKey) {
      if (!payload.subscriberId) return asJson ? res.status(400).json({ error: 'missing_subscriber_or_group' }) : sendRenewHtml(res);
      const sub = await Subscriber.findById(payload.subscriberId, { email:1, groupKey:1 }).lean();
      if (!sub) return asJson ? res.status(404).json({ error: 'subscriber_not_found' }) : sendRenewHtml(res);
      groupKey = sub.groupKey || sub.email;
    }

    // Membres + sièges N-1
    const members = await Subscriber.find(
      { $or: [ { groupKey }, { $and: [{ groupKey: null }, { email: groupKey }] } ] },
      { firstName:1, lastName:1, email:1, previousSeasonSeats:1 }
    ).lean();

    const seatOwner = new Map();
    const seatIds = [];
    for (const m of members) {
      for (const sid of (m.previousSeasonSeats || [])) {
        const id = String(sid).trim().toUpperCase();
        if (!seatOwner.has(id)) seatOwner.set(id, m.email);
        seatIds.push(id);
      }
    }
    const uniqSeatIds = Array.from(new Set(seatIds));

    const q = { seasonCode: season.code };
    if (uniqSeatIds.length) q.seatId = { $in: uniqSeatIds };
    if (season.venueSlug) q.venueSlug = season.venueSlug;
    const seatDocs = uniqSeatIds.length
      ? await Seat.find(q, { seatId:1, zoneKey:1, status:1, provisionedFor:1 }).lean()
      : [];
    const byId = new Map(seatDocs.map(s => [s.seatId, s]));
    const seatsView = uniqSeatIds.map(seatId => {
      const s = byId.get(seatId);
      return {
        seatId,
        ownerEmail: seatOwner.get(seatId) || null,
        exists: !!s,
        status: s ? s.status : 'missing',
        provisioned: !!(s && s.status === 'provisioned'),
        zoneKey: s?.zoneKey || null,
        provisionedFor: s?.provisionedFor || null
      };
    });

    const basePath = getBasePath();
    const venuePlanUrl = season.venueSlug ? `${basePath}/venues/${season.venueSlug}/plan.svg` : null;

    // 🔎 Catalogue + table des prix (DB si présents, sinon fallback)
    const tariffs = await getTariffCatalog();
    const prices = await getZonePriceTable({ seasonCode: season.code, venueSlug: season.venueSlug || null });

    const response = {
      seasonCode: season.code,
      venueSlug: season.venueSlug || null,
      venuePlanUrl,
      groupKey,
      members: members.map(m => ({ firstName: m.firstName || '', lastName: m.lastName || '', email: m.email })),
      seats: seatsView,
      prefSeatId: req.query.seat ? String(req.query.seat).trim().toUpperCase() : null,
      tariffs,
      prices,
      token
    };

    return asJson ? res.json(response) : sendRenewHtml(res);
  } catch (err) {
    return next(err);
  }
});

/** POST /s/renew?id=<JWT> */
router.post('/s/renew', async (req, res, next) => {
  try {
    const token = req.query.id || req.body?.id;
    if (!token) return res.status(400).json({ error: 'missing_token' });

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'invalid_or_expired_token' });
    }
    if (payload.phase !== 'renewal') return res.status(400).json({ error: 'wrong_phase' });

    const season = await Season.findOne({ code: payload.seasonCode }).lean();
    if (!season) return res.status(404).json({ error: 'season_not_found' });

    let groupKey = payload.groupKey || null;
    let sub = null;
    if (!groupKey) {
      if (!payload.subscriberId) return res.status(400).json({ error: 'missing_subscriber_or_group' });
      sub = await Subscriber.findById(payload.subscriberId, { email:1, groupKey:1 }).lean();
      if (!sub) return res.status(404).json({ error: 'subscriber_not_found' });
      groupKey = sub.groupKey || sub.email;
    }

    const members = await Subscriber.find(
      { $or: [ { groupKey }, { $and: [ { groupKey: null }, { email: groupKey } ] } ] },
      { _id:1, email:1, previousSeasonSeats:1 }
    ).lean();
    const memberIds = new Set(members.map(m => String(m._id)));
    const allowedSeatIds = new Set(members.flatMap(m => (m.previousSeasonSeats || []).map(s => String(s).trim().toUpperCase())));

    const linesIn = Array.isArray(req.body?.lines) ? req.body.lines : [];
    if (!linesIn.length) return res.status(400).json({ error: 'empty_lines' });

    const reqSeatIds = Array.from(new Set(linesIn.map(l => String(l.seatId || '').trim().toUpperCase()).filter(Boolean)));
    const seatDocs = await Seat.find(
      {
        seasonCode: season.code,
        seatId: { $in: reqSeatIds },
        ...(season.venueSlug ? { venueSlug: season.venueSlug } : {})
      },
      { seatId:1, zoneKey:1, status:1, provisionedFor:1 }
    ).lean();
    const seatsById = new Map(seatDocs.map(s => [s.seatId, s]));

    const invalid = [];
    for (const sid of reqSeatIds) {
      const s = seatsById.get(sid);
      if (!s) { invalid.push({ seatId: sid, reason: 'missing_in_season' }); continue; }
      if (!allowedSeatIds.has(sid)) { invalid.push({ seatId: sid, reason: 'not_in_group' }); continue; }
      if (s.status !== 'provisioned') { invalid.push({ seatId: sid, reason: `status_${s.status}` }); continue; }
      if (!s.provisionedFor || !memberIds.has(String(s.provisionedFor))) {
        invalid.push({ seatId: sid, reason: 'provisioned_for_other' }); continue;
      }
    }
    if (invalid.length) return res.status(400).json({ error: 'invalid_seats', details: invalid });

    const pricedLines = linesIn.map(l => {
      const sid = String(l.seatId || '').trim().toUpperCase();
      const s = seatsById.get(sid);
      return {
        seatId: sid,
        zoneKey: s?.zoneKey || null,
        tariffCode: String(l.tariffCode || '').trim(),
        justification: (l.justification || '').trim()
      };
    });

    // ✅ justification selon le catalogue DB
    const catalog = await getTariffCatalog();
    for (const ln of pricedLines) {
      if (requiresJustifFromCatalog(catalog, ln.tariffCode) && !ln.justification) {
        return res.status(400).json({ error: 'justification_required', seatId: ln.seatId, tariffCode: ln.tariffCode });
      }
    }

    const totalCents = await computeSubscriptionPriceCents(
      pricedLines,
      { seasonCode: season.code, venueSlug: season.venueSlug }
    );

    const installments = Math.max(1, Math.min(3, Number(req.body?.installments || 1)));
    const payerEmail =
      (req.body?.payer && String(req.body.payer.email || '').trim()) ||
      (sub?.email) ||
      (members[0]?.email) ||
      null;
    if (!payerEmail) return res.status(400).json({ error: 'missing_payer_email' });

    const apiBase = process.env.SELF_API_BASE || 'http://127.0.0.1:8080';
    const resp = await fetch(`${apiBase.replace(/\/$/,'')}/api/payments/helloasso/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscriberId: sub?._id || null,
        seasonCode: season.code,
        totalCents,
        itemName: 'Renouvellement abonnement (groupe)',
        installments,
        payer: { email: payerEmail },
        meta: {
          groupKey,
          seats: pricedLines.map(x => ({ seatId: x.seatId, zoneKey: x.zoneKey, tariffCode: x.tariffCode }))
        }
      })
    });

    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      return res.status(502).json({ error: 'helloasso_error', status: resp.status, body: t.slice(0, 500) });
    }
    const data = await resp.json();
    return res.json({ checkoutUrl: data.redirectUrl, checkoutIntentId: data.checkoutIntentId, totalCents });
  } catch (err) {
    return next(err);
  }
});

function sendRenewHtml(res) {
  res.sendFile(path.join(__dirname, '..', 'public', 'renew.html'));
}
module.exports = router;
