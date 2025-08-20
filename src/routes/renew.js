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

function zoneFromSeatId(seatId) {
  const m = /^([A-Z]\d+[A-Z]?)-/.exec(String(seatId || ''));
  return (m && m[1]) || null;
}

/**
 * GET /s/renew
 * - HTML → renew.html
 * - JSON → données pour construire l’UI (tarifs, prix, sièges…)
 */
router.get('/s/renew', async (req, res) => {
  const wants = req.accepts(['html', 'json']);
  if (wants === 'html') return res.sendFile(RENEW_HTML);

  try {
    const seasonCode = req.query.season || '2025-2026';
    const venueSlug  = req.query.venue  || 'patinoire-blagnac';
    const email      = req.query.email  || '';
    const tokenSeats = (req.query.seats || '').split(',').map(s => s.trim()).filter(Boolean);

    // Catalogue Tariff
    const tariffs = await Tariff.find({ active: { $ne: false } })
      .sort({ sortOrder: 1, code: 1 })
      .lean();

    // Table des prix TariffPrice
    const tpRows = await TariffPrice.find({ seasonCode, venueSlug }).lean();
    // tableau pour le front (zoneKey, tariffCode, priceCents)
    const prices = tpRows.map(r => ({
      zoneKey: r.zoneKey || '*',
      tariffCode: String(r.tariffCode || '').toUpperCase(),
      priceCents: Number(r.priceCents || 0)
    }));

    // Seats (pour affichage) — si DB présente
    const seats = await Seat.find({ seasonCode, venueSlug }, { seatId:1, zoneKey:1, status:1, provisionedFor:1 }).lean();

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
      seats,
      tariffs,
      prices
    });
  } catch (e) {
    console.error('GET /s/renew error', e);
    return res.status(400).json({ error: e.message || 'Erreur' });
  }
});

/**
 * POST /s/renew
 * Payload:
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

    // compléter zoneKey depuis la DB si manquante
    const seatIds = items.map(it => it.seatId).filter(Boolean);
    const seatDocs = await Seat.find({ seasonCode, seatId: { $in: seatIds } }, { seatId:1, zoneKey:1 }).lean();
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

    // Construire un cache des prix TariffPrice à partir des combinaisons demandées
    const wanted = [];
    const seen = new Set();
    for (const it of norm) {
      const k1 = `${it.zoneKey}::${it.tariffCode}`;
      const k2 = `*::${it.tariffCode}`;
      if (!seen.has(k1)) { wanted.push({ zoneKey: it.zoneKey, tariffCode: it.tariffCode }); seen.add(k1); }
      if (!seen.has(k2)) { wanted.push({ zoneKey: '*',        tariffCode: it.tariffCode }); seen.add(k2); }
    }

    const prices = await TariffPrice.find({
      seasonCode, venueSlug,
      $or: wanted.map(w => ({ zoneKey: w.zoneKey, tariffCode: w.tariffCode }))
    }).lean();
    const priceMap = new Map(prices.map(p => [`${p.zoneKey || '*'}::${String(p.tariffCode).toUpperCase()}`, Number(p.priceCents || 0)]));

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
