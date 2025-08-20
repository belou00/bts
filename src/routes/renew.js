// src/routes/renew.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { Order, Seat, Tariff, TariffPrice } from '../models/index.js';
import { initCheckout } from '../services/helloasso.js';

const router = express.Router();

// __dirname (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RENEW_HTML = path.resolve(__dirname, '../public/html/renew.html');

// Helpers
function zoneFromSeatId(seatId) {
  const m = /^([A-Z]\d+[A-Z]?)-/.exec(String(seatId || ''));
  return (m && m[1]) || null;
}

// Construit un filtre tolérant aux variantes de champs (season/seasonCode, venue/venueSlug)
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

/**
 * GET /s/renew
 * - HTML → renew.html
 * - JSON → données UI (tarifs, prix, sièges…)
 */
router.get('/s/renew', async (req, res) => {
  const wants = req.accepts(['html', 'json']);
  if (wants === 'html') return res.sendFile(RENEW_HTML);

  try {
    const seasonCode = req.query.season || '2025-2026';
    const venueSlug  = req.query.venue  || 'patinoire-blagnac';
    const email      = req.query.email  || '';
    const tokenSeats = (req.query.seats || '').split(',').map(s => s.trim()).filter(Boolean);

    // 1) Tarifs (catalogue). Si vide, fallback sur les codes vus dans TariffPrice.
    let tariffs = await Tariff.find({ active: { $ne: false } })
      .sort({ sortOrder: 1, code: 1 })
      .lean();

    // 2) Table des prix (TariffPrice) – tolère season/venue alternatifs
    const tpRows = await TariffPrice.find(seasonVenueFilter({ seasonCode, venueSlug })).lean();

    if (!tariffs?.length && tpRows.length) {
      const codes = Array.from(new Set(tpRows.map(r => String(r.tariffCode || '').toUpperCase()).filter(Boolean)));
      tariffs = codes.map((code, i) => ({ code, label: code, active: true, sortOrder: 100 + i }));
    }

    // 3) Prix à plat pour le front
    const prices = tpRows.map(r => ({
      zoneKey: r.zoneKey || '*',
      tariffCode: String(r.tariffCode || '').toUpperCase(),
      priceCents: Number(r.priceCents || 0)
    }));

    // 4) Seats (tolère season/venue alternatifs)
    const seatRows = await Seat.find(seasonVenueFilter({ seasonCode, venueSlug }), {
      seatId: 1, zoneKey: 1, status: 1, provisionedFor: 1
    }).lean();

    const subscribers = (tokenSeats.length ? tokenSeats : [null]).map(() => ({
      firstName: '', lastName: ''
    }));

    return res.json({
      seasonCode,
      venueSlug,
      email,
      tokenSeats,
      focusSeatId: tokenSeats[0] || null,
      subscribers,
      seats: seatRows,
      tariffs,
      prices
    });
  } catch (e) {
    console.error('GET /s/renew error', e);
    return res.status(400).json({ error: e.message || 'Erreur' });
  }
});

/**
 * GET /debug/renew-scan  (outil de diag)
 * Retourne des infos sur ce qui est trouvé (counts, exemples) avec les 2 variantes de champs.
 * Ex: /debug/renew-scan?season=2025-2026&venue=patinoire-blagnac
 */
router.get('/debug/renew-scan', async (req, res) => {
  try {
    const seasonCode = req.query.season || '2025-2026';
    const venueSlug  = req.query.venue  || 'patinoire-blagnac';

    const f = seasonVenueFilter({ seasonCode, venueSlug });

    const [tpCount, tpOne, seatCount, seatOne, tariffCount] = await Promise.all([
      TariffPrice.countDocuments(f),
      TariffPrice.findOne(f).lean(),
      Seat.countDocuments(f),
      Seat.findOne(f, { seatId:1, zoneKey:1, status:1, season:1, seasonCode:1, venue:1, venueSlug:1 }).lean(),
      Tariff.countDocuments({ active: { $ne: false } })
    ]);

    res.json({
      input: { seasonCode, venueSlug },
      filter: f,
      tariffCount,
      tariffPrice: { count: tpCount, sample: tpOne },
      seats: { count: seatCount, sample: seatOne }
    });
  } catch (e) {
    console.error('GET /debug/renew-scan error', e);
    res.status(400).json({ error: e.message || 'Erreur' });
  }
});

/**
 * POST /s/renew
 * { seasonCode, venueSlug, items:[{ seatId, zoneKey?, tariffCode, justification?, firstName?, lastName? }...], payer:{ email }, formSlug? }
 */
router.post('/s/renew', async (req, res) => {
  try {
    const { seasonCode, venueSlug, items, payer, formSlug } = req.body || {};

    if (!seasonCode || !venueSlug) {
      return res.status(400).json({ error: 'seasonCode et venueSlug sont requis' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items est requis (au moins 1 place)' });
    }
    if (!payer || !payer.email) {
      return res.status(400).json({ error: 'payer.email est requis' });
    }

    // compléter zoneKey depuis la DB si manquante (tolérant aux variantes)
    const seatIds = items.map(it => it.seatId).filter(Boolean);
    const seatDocs = await Seat.find(
      { ...seasonVenueFilter({ seasonCode, venueSlug }), seatId: { $in: seatIds } },
      { seatId:1, zoneKey:1 }
    ).lean();
    const bySeat = new Map(seatDocs.map(s => [s.seatId, s.zoneKey]));

    // normalisation des lignes
    const norm = items.map(it => ({
      zoneKey: it.zoneKey || bySeat.get(it.seatId) || zoneFromSeatId(it.seatId) || '*',
      tariffCode: String(it.tariffCode || 'ADULT').trim().toUpperCase(),
      seatId: it.seatId,
      firstName: it.firstName || '',
      lastName:  it.lastName  || '',
      justification: it.justification || '',
      info: it.info || ''
    }));

    // Construire un cache des prix TariffPrice (tolérant aux variantes season/venue)
    const wanted = [];
    const seen = new Set();
    for (const it of norm) {
      const k1 = `${it.zoneKey}::${it.tariffCode}`;
      const k2 = `*::${it.tariffCode}`;
      if (!seen.has(k1)) { wanted.push({ zoneKey: it.zoneKey, tariffCode: it.tariffCode }); seen.add(k1); }
      if (!seen.has(k2)) { wanted.push({ zoneKey: '*',        tariffCode: it.tariffCode }); seen.add(k2); }
    }

    const tpRows = await TariffPrice.find({
      ...seasonVenueFilter({ seasonCode, venueSlug }),
      $or: wanted.map(w => ({ zoneKey: w.zoneKey, tariffCode: w.tariffCode }))
    }).lean();
    const priceMap = new Map(tpRows.map(p => [`${p.zoneKey || '*'}::${String(p.tariffCode).toUpperCase()}`, Number(p.priceCents || 0)]));

    // total + lignes d’order
    let totalCents = 0;
    const lines = norm.map(it => {
      const keyZ = `${it.zoneKey}::${it.tariffCode}`;
      const keyW = `*::${it.tariffCode}`;
      const unit = priceMap.get(keyZ) ?? priceMap.get(keyW) ?? 0;
      totalCents += unit;
      return {
        seatId: it.seatId,
        tariffCode: it.tariffCode,
        priceCents: unit,
        holderFirstName: it.firstName,
        holderLastName:  it.lastName,
        justificationField: it.justification,
        info: it.info
      };
    });

    const order = await Order.create({
      seasonCode,
      venueSlug,
      groupKey: req.query.id || null,
      payerEmail: payer.email,
      lines,
      totalCents,
      status: 'pending',
      paymentProvider: 'helloasso'
    });

    const { redirectUrl, provider, intentId } = await initCheckout({ order, formSlug });
    return res.json({ redirectUrl, provider, intentId, orderId: order._id });
  } catch (e) {
    console.error('POST /s/renew error', e);
    return res.status(400).json({ error: e.message || 'Erreur' });
  }
});

export default router;
