// src/routes/renew.js (SERVER — Express router)
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import { Order, Seat, Tariff, TariffPrice, Subscriber } from '../models/index.js';
import { initCheckout } from '../services/helloasso.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const RENEW_HTML = path.resolve(__dirname, '../views/renew/index.html');

const APP_ENV = (process.env.APP_ENV || '').toLowerCase();
const isProd  = APP_ENV === 'production';

// ---------- helpers ----------
function zoneKeyFromSeatId(seatId) {
  const s = String(seatId || ''); const i = s.indexOf('-');
  return i > 0 ? s.slice(0, i) : (s || '*');
}
function zoneKeyFromSeatDoc(seat) {
  const z = seat?.zoneKey ? String(seat.zoneKey) : '';
  if (z) { const i = z.indexOf('-'); return i > 0 ? z.slice(0,i) : z; }
  return zoneKeyFromSeatId(seat?.seatId);
}
function seasonVenueFilter({ seasonCode, venueSlug }) {
  const season = String(seasonCode || '').trim();
  const venue  = String(venueSlug  || '').trim();
  const clauses = [];
  if (season && venue) {
    clauses.push(
      { seasonCode: season, venueSlug: venue },
      { seasonCode: season, venue: venue },
      { season: season,     venueSlug: venue },
      { season: season,     venue: venue },
    );
  } else if (season) {
    clauses.push({ seasonCode: season }, { season: season });
  } else if (venue) {
    clauses.push({ venueSlug: venue }, { venue: venue });
  }
  return clauses.length ? { $or: clauses } : {};
}
function normalizeTokenPayload(p) {
  if (!p || typeof p !== 'object') return { seats: [], subscriber: null };
  let seats = [];
  if (Array.isArray(p.seats)) seats = p.seats;
  else if (Array.isArray(p.seatIds)) seats = p.seatIds;
  else if (typeof p.seats === 'string') seats = p.seats.split(',').map(s => s.trim()).filter(Boolean);
  else if (typeof p.seatIds === 'string') seats = p.seatIds.split(',').map(s => s.trim()).filter(Boolean);
  else if (typeof p.s === 'string') seats = p.s.split(',').map(s => s.trim()).filter(Boolean);

  const email = p.email || p.mail || p.groupKey || '';
  const sub = p.subscriber || {
    id: p.subscriberId || p.sid || null,
    firstName: p.firstName || p.fn || '',
    lastName:  p.lastName  || p.ln || '',
    email
  };
  return {
    seats: seats.map(String),
    subscriber: (sub && (sub.id || sub.email || sub.firstName || sub.lastName)) ? sub : null
  };
}
function decodeTokenRaw(id) {
  try {
    const b64 = id.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(b64, 'base64').toString('utf8');
    const payload = JSON.parse(json);
    return { ...normalizeTokenPayload(payload), source: 'base64json' };
  } catch {}
  if (id.includes('-') || id.includes(',')) {
    const arr = id.split(',').map(s => s.trim()).filter(Boolean);
    if (arr.length) return { seats: arr, subscriber: null, source: 'csv' };
  }
  return { seats: [], subscriber: null, source: 'unknown' };
}
function decodeToken(id) {
  if (!id) return { seats: [], subscriber: null, source: 'none' };
  const secret = process.env.JWT_SECRET;
  if (secret) {
    try {
      const payload = jwt.verify(id, secret);
      return { ...normalizeTokenPayload(payload), source: 'jwt' };
    } catch {
      if (!isProd) {
        try {
          const payload = jwt.decode(id);
          if (payload && typeof payload === 'object') {
            return { ...normalizeTokenPayload(payload), source: 'jwt-decoded' };
          }
        } catch {}
      }
      return decodeTokenRaw(id);
    }
  }
  return decodeTokenRaw(id);
}
function derivePriceFlags(row) {
  const code = String(row.tariffCode || '').toUpperCase();
  const isNormal = code === 'NORMAL' || code === 'ADULT' || code === 'PLEIN';
  const withDefaults = { ...row };
  if (typeof withDefaults.requiresField !== 'boolean') {
    if (/^ETUD/i.test(code)) {
      withDefaults.requiresField = true;
      withDefaults.fieldLabel = withDefaults.fieldLabel || 'Numéro d’étudiant';
    } else if (/LICEN[CS]I/i.test(code) || code === 'LICENCIE' || code === 'LICENCE') {
      withDefaults.requiresField = true;
      withDefaults.fieldLabel = withDefaults.fieldLabel || 'Numéro de licence';
    } else {
      withDefaults.requiresField = false;
    }
  }
  if (typeof withDefaults.requiresInfo !== 'boolean') {
    withDefaults.requiresInfo = !isNormal;
    if (withDefaults.requiresInfo && !withDefaults.infoLabel) {
      withDefaults.infoLabel = 'Présentez le justificatif avec votre billet';
    }
  }
  return withDefaults;
}

// ---------- routes ----------
router.get('/s/renew', async (req, res) => {
  const wants = req.accepts(['html', 'json']);
  if (wants === 'html') return res.sendFile(RENEW_HTML);

  try {
    const seasonCode = req.query.season || '2025-2026';
    const venueSlug  = req.query.venue  || 'patinoire-blagnac';
    const idToken    = req.query.id || '';
    const seatsQuery = (req.query.seats || '').split(',').map(s => s.trim()).filter(Boolean);

    // Commande déjà payée pour ce token ?
    const paidOrder = idToken
      ? await Order.findOne({ groupKey: idToken, status: { $in: ['paid', 'authorized'] } }).lean()
      : null;
    const consumed = !!paidOrder;

    // Tarifs / Prix
    let tariffDocs = await Tariff.find({ active: { $ne: false } }).sort({ sortOrder: 1, code: 1 }).lean();
    const tpRows = await TariffPrice.find(seasonVenueFilter({ seasonCode, venueSlug })).lean();
    if (!tariffDocs?.length && tpRows.length) {
      const codes = Array.from(new Set(tpRows.map(r => String(r.tariffCode || '').toUpperCase()).filter(Boolean)));
      tariffDocs = codes.map((code, i) => ({ code, label: code, active: true, sortOrder: 100 + i }));
    }
    const tariffs = (tariffDocs || []).map(t => ({
      code: String(t.code || '').toUpperCase(),
      label: t.label || String(t.code || '').toUpperCase(),
      sortOrder: t.sortOrder ?? 0
    }));
    const prices = (tpRows || []).map(r => derivePriceFlags({
      zoneKey: r.zoneKey || '*',
      tariffCode: String(r.tariffCode || '').toUpperCase(),
      priceCents: Number(r.priceCents || 0),
      requiresField: r.requiresField,
      fieldLabel: r.fieldLabel,
      requiresInfo:  r.requiresInfo,
      infoLabel:     r.infoLabel
    }));

    // Sièges (avec holder* si dispo) + zone canonique
    const seatRowsRaw = await Seat.find(
      seasonVenueFilter({ seasonCode, venueSlug }),
      { seatId:1, zoneKey:1, status:1, provisionedFor:1, holderFirstName:1, holderLastName:1, lastTariffCode:1 }
    ).lean();
    const seatRows = seatRowsRaw.map(s => ({ ...s, zone: zoneKeyFromSeatDoc(s) }));

    // Décodage + enrichissement subscriber
    const decoded = decodeToken(idToken);
    let allowedSeats = decoded.seats || [];
    let subscriber   = decoded.subscriber || null;
    if (!allowedSeats.length && seatsQuery.length) allowedSeats = seatsQuery;

    let subDoc = null;
    if (subscriber?.id) subDoc = await Subscriber.findById(subscriber.id).lean();
    else if (subscriber?.email) subDoc = await Subscriber.findOne({ email: subscriber.email }).lean();
    if (subDoc) {
      subscriber = {
        id: String(subDoc._id),
        firstName: subscriber.firstName || subDoc.firstName || '',
        lastName:  subscriber.lastName  || subDoc.lastName  || '',
        email:     subscriber.email     || subDoc.email     || ''
      };
    }

    if (!allowedSeats.length && subscriber?.id) {
      allowedSeats = seatRows
        .filter(s => s.status === 'provisioned' && String(s.provisionedFor || '') === String(subscriber.id))
        .map(s => s.seatId);
    }

    // Pré-remplissage noms depuis Subscriber si manquants (pour sièges autorisés)
    const holdersBySeat = new Map();
    if (allowedSeats.length) {
      const subs = await Subscriber.find(
        {
          seasonCode, venueSlug,
          $or: [{ prefSeatId: { $in: allowedSeats } }, { previousSeasonSeats: { $in: allowedSeats } }]
        },
        { firstName:1, lastName:1, prefSeatId:1, previousSeasonSeats:1 }
      ).lean();
      for (const sub of subs) {
        if (sub.prefSeatId && allowedSeats.includes(sub.prefSeatId)) {
          holdersBySeat.set(sub.prefSeatId, { firstName: sub.firstName || '', lastName: sub.lastName || '' });
        }
        for (const sid of (sub.previousSeasonSeats || [])) {
          if (allowedSeats.includes(sid) && !holdersBySeat.has(sid)) {
            holdersBySeat.set(sid, { firstName: sub.firstName || '', lastName: sub.lastName || '' });
          }
        }
      }
    }
    const seatRowsEnriched = seatRows.map(s => {
      if (!allowedSeats.includes(s.seatId)) return s;
      const h = holdersBySeat.get(s.seatId);
      return {
        ...s,
        holderFirstName: s.holderFirstName || h?.firstName || '',
        holderLastName:  s.holderLastName  || h?.lastName  || ''
      };
    });

    const effectiveAllowed = consumed ? [] : allowedSeats;
    const emailTop = req.query.email || subscriber?.email || '';

    return res.json({
      seasonCode, venueSlug,
      email: emailTop,
      consumed,
      tokenSeats: effectiveAllowed,
      allowedSeats: effectiveAllowed,
      focusSeatId: effectiveAllowed[0] || null,
      subscriber: subscriber || null,
      subscribers: subscriber ? [subscriber] : [],
      seats: seatRowsEnriched,
      tariffs, prices
    });
  } catch (e) {
    console.error('GET /s/renew error', e);
    return res.status(400).json({ error: e.message || 'Erreur' });
  }
});

router.post('/s/renew', async (req, res) => {
  try {
    const { seasonCode, venueSlug, items, payer, formSlug, installments } = req.body || {};
    if (!seasonCode || !venueSlug) return res.status(400).json({ error: 'seasonCode et venueSlug sont requis' });
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items est requis' });
    if (!payer?.email) return res.status(400).json({ error: 'payer.email est requis' });

    const idToken    = req.query.id || '';
    const seatsQuery = (req.query.seats || '').split(',').map(s => s.trim()).filter(Boolean);

    if (idToken) {
      const paid = await Order.findOne({ groupKey: idToken, status: { $in: ['paid', 'authorized'] } }).lean();
      if (paid) return res.status(409).json({ error: 'Ce lien a déjà été utilisé (commande payée).' });
    }

    const decoded = decodeToken(idToken);
    let allowedSet = new Set((decoded.seats || []).map(String));
    if (!allowedSet.size && seatsQuery.length) allowedSet = new Set(seatsQuery.map(String));
    if (!allowedSet.size) return res.status(400).json({ error: 'Aucun siège autorisé par ce lien de renouvellement.' });

    const filtered = items.filter(it => allowedSet.has(String(it.seatId || '')));
    if (!filtered.length) return res.status(400).json({ error: 'Aucun des sièges sélectionnés n’est autorisé.' });

    const seatDocs = await Seat.find(
      { seasonCode, venueSlug, seatId: { $in: filtered.map(i => i.seatId) } },
      { seatId:1, zoneKey:1, status:1 }
    ).lean();
    const notProvisioned = seatDocs.filter(s => s.status !== 'provisioned').map(s => s.seatId);
    if (notProvisioned.length) {
      return res.status(409).json({ error: `Sièges non disponibles pour renouvellement: ${notProvisioned.join(', ')}` });
    }

    const bySeatZone = new Map(seatDocs.map(s => [s.seatId, zoneKeyFromSeatDoc(s)]));
    const wanted = new Set();
    for (const it of filtered) {
      const z = bySeatZone.get(it.seatId) || zoneKeyFromSeatId(it.seatId) || '*';
      const t = String(it.tariffCode || 'ADULT').toUpperCase();
      wanted.add(`${z}::${t}`); wanted.add(`*::${t}`);
    }
    const tpRows = await TariffPrice.find({
      ...seasonVenueFilter({ seasonCode, venueSlug }),
      $or: Array.from(wanted).map(k => { const [z,t] = k.split('::'); return { zoneKey: z, tariffCode: t }; })
    }).lean();
    const priceMap = new Map(tpRows.map(p => [
      `${(p.zoneKey || '*')}::${String(p.tariffCode).toUpperCase()}`,
      Number(p.priceCents || 0)
    ]));

    let totalCents = 0;
    const lines = filtered.map(it => {
      const z = bySeatZone.get(it.seatId) || zoneKeyFromSeatId(it.seatId) || '*';
      const t = String(it.tariffCode || 'ADULT').toUpperCase();
      const unit = priceMap.get(`${z}::${t}`) ?? priceMap.get(`*::${t}`) ?? 0;
      totalCents += unit;
      return {
        seatId: it.seatId,
        tariffCode: t,
        priceCents: unit,
        holderFirstName: it.firstName || '',
        holderLastName:  it.lastName  || '',
        justificationField: it.justification || '',
        info: it.info || ''
      };
    });

    const order = await Order.create({
      seasonCode, venueSlug,
      groupKey: idToken || null,
      payerEmail: payer.email,
      lines, totalCents,
      status: 'pending',
      paymentProvider: 'helloasso',
      paymentSplit: Number(installments || 1)
    });

    const { redirectUrl, provider, intentId } = await initCheckout({ order, formSlug });
    return res.json({ redirectUrl, provider, intentId, orderId: order._id });
  } catch (e) {
    console.error('POST /s/renew error', e);
    return res.status(400).json({ error: e.message || 'Erreur' });
  }
});

router.get('/debug/renew-token', async (req, res) => {
  const idToken    = req.query.id || '';
  const seatsQuery = (req.query.seats || '').split(',').map(s=>s.trim()).filter(Boolean);
  const decoded = decodeToken(idToken);
  res.json({ source: decoded.source, tokenSeats: decoded.seats, seatsQuery, subscriber: decoded.subscriber });
});

export default router;
