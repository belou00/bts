// src/routes/renew.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { Order, Seat } from '../models/index.js';
import { initCheckout } from '../services/helloasso.js';
import * as pricing from '../utils/pricing.js';

const router = express.Router();

// __dirname (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Chemin vers le HTML (servi quand le navigateur demande text/html)
const RENEW_HTML = path.resolve(__dirname, '../public/html/renew.html');

function zoneFromSeatId(seatId) {
  const m = /^([A-Z]\d+[A-Z]?)-/.exec(String(seatId || ''));
  return (m && m[1]) || null;
}

/**
 * GET /s/renew
 * - Accept: text/html  -> sert la page HTML (renew.html)
 * - Accept: application/json -> renvoie les données JSON pour le front
 * DEV-friendly: accepte ?season=...&venue=...&email=...&seats=S1-A-001,S1-A-002
 */
router.get('/s/renew', async (req, res) => {
  const wants = req.accepts(['html', 'json']);
  if (wants === 'html') {
    // Renvoie la page; les scripts du front feront ensuite un fetch JSON sur la même URL
    return res.sendFile(RENEW_HTML);
  }

  try {
    const seasonCode = req.query.season || '2025-2026';
    const venueSlug  = req.query.venue  || 'patinoire-blagnac';
    const email      = req.query.email  || '';
    const tokenSeats = (req.query.seats || '').split(',').map(s => s.trim()).filter(Boolean);

    // Tarifs (catalogue)
    let tariffs = [];
    try {
      tariffs = await pricing.getTariffCatalog();
    } catch { tariffs = pricing.getTariffCatalogSync(); }

    // Prix par zone
    const table = await pricing.getZonePriceTable({ seasonCode, venueSlug });
    const prices = [];
    for (const [zoneKey, map] of Object.entries(table)) {
      if (zoneKey === '*') continue; // on évite de pousser le wildcard en premier
      for (const [tariffCode, priceCents] of Object.entries(map)) {
        prices.push({ zoneKey, tariffCode, priceCents });
      }
    }
    // fallback wildcard
    if (!prices.length && table['*']) {
      for (const [tariffCode, priceCents] of Object.entries(table['*'])) {
        prices.push({ zoneKey: '*', tariffCode, priceCents });
      }
    }

    // Seats pour affichage (si dispo)
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
 * {
 *   seasonCode, venueSlug,
 *   items: [{ seatId, zoneKey?, tariffCode, justification?, firstName?, lastName? }, ...],
 *   payer: { email, firstName?, lastName? },
 *   formSlug?
 * }
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

    const linesForPrice = items.map(it => ({
      zoneKey: it.zoneKey || bySeat.get(it.seatId) || zoneFromSeatId(it.seatId) || '*',
      tariffCode: String(it.tariffCode || 'NORMAL').trim().toUpperCase()
    }));

    const totalCents = await pricing.computeSubscriptionPriceCents(linesForPrice, { seasonCode, venueSlug });

    const lines = items.map(it => ({
      seatId: it.seatId,
      tariffCode: String(it.tariffCode || 'NORMAL').trim().toUpperCase(),
      priceCents: null,
      holderFirstName: it.firstName || '',
      holderLastName:  it.lastName  || '',
      justificationField: it.justification || '',
      info: it.info || ''
    }));

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
