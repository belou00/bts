// src/routes/renew.js
import express from 'express';
import { Order } from '../models/index.js';
import { initCheckout } from '../services/helloasso.js';

const router = express.Router();

/**
 * POST /s/renew
 * Payload attendue (exemple):
 * {
 *   "seasonCode": "2025-2026",
 *   "venueSlug": "patinoire-blagnac",
 *   "items": [{ "seatId":"A1-001", "zoneKey":"NORD", "tariffCode":"PT" }, ...],
 *   "payer": { "email":"xxx@y.z", "firstName":"", "lastName":"" },
 *   "formSlug": "abonnement-2025"  // optionnel si tu distingues les forms HA
 * }
 */
router.post('/s/renew', async (req, res) => {
  try {
    const { seasonCode, venueSlug, items, payer, formSlug } = req.body || {};

    // ---- validations minimales (garde ta validation Joi/celebrate si déjà en place) ----
    if (!seasonCode || !venueSlug) {
      return res.status(400).json({ error: 'seasonCode et venueSlug sont requis' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items est requis (au moins 1 siège)' });
    }
    if (!payer || !payer.email) {
      return res.status(400).json({ error: 'payer.email est requis' });
    }

    // ---- recalcul serveur du total (essaie d’utiliser ta logique Phase 1 si dispo) ----
    const totalCents = await recomputeTotalSafe({ seasonCode, venueSlug, items, payer });

    // ---- crée l’Order pending ----
    const order = await Order.create({
      provider: 'helloasso',
      kind: 'season-renew',
      status: 'pending',
      email: payer.email,
      amount: totalCents, // enregistré en cents
      currency: 'EUR',
      payload: { seasonCode, venueSlug, items }
    });

    // ---- démarre le checkout (STUB en DEV / HA en INT/PROD) ----
    const { redirectUrl, provider, intentId } = await initCheckout({ order, formSlug });

    // ---- renvoie l’URL de redirection au front ----
    return res.json({ redirectUrl, provider, intentId, orderId: order._id });
  } catch (e) {
    console.error('POST /s/renew error', e);
    return res.status(400).json({ error: e.message || 'Erreur' });
  }
});

/**
 * Essaie d’appeler une fonction de pricing Phase 1 si elle existe, sinon fallback.
 */
async function recomputeTotalSafe({ seasonCode, venueSlug, items, payer }) {
  try {
    const mod = await import('../services/pricing.js');
    const fn =
      mod.computeRenewTotal ||
      mod.recomputePricing ||
      mod.getTotalsForRenew ||
      mod.getTotalForRenew;

    if (typeof fn === 'function') {
      const out = await fn({ seasonCode, venueSlug, items, payer });
      if (typeof out === 'number') return Math.max(0, Math.round(out));
      if (out && typeof out.totalCents === 'number') return Math.max(0, Math.round(out.totalCents));
    }
  } catch {
    // pas de module / autre signature → fallback
  }
  // Fallback : 1000 cents par siège (remplace dès que ta logique est branchée ici)
  return items.length * 1000;
}

export default router;
