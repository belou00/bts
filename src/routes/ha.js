// src/routes/ha.js
const express = require('express');
const Order = require('../models/Order');           // doit exister
const Subscriber = require('../models/Subscriber'); // existe
const { ensureSubscriberNo } = require('../services/subscribers');
const { renderAttestationHtml } = require('../services/attestation');
const { sendMail } = require('../services/mailer');
const { getHelloAssoClient } = require('../services/helloasso'); // ton client HA existant

const router = express.Router();

/**
 * On attend que la création du checkout ait :
 * - créé un Order avec { checkoutIntentId, seasonCode, payer:{email}, totalCents, installments, lines:[{ seatId, zoneKey, tariffCode, priceCents, subscriberId }] }
 * - ajouté ?oid=<orderId>&ci=<checkoutIntentId> aux URLs de retour (voir route checkout ci-dessous)
 *
 * Ici, on vérifie l’état du checkout HelloAsso, on marque l’Order "paid",
 * on attribue des subscriberNo, puis on envoie l’attestation.
 */

router.get('/ha/return', handleReturn('return'));
router.get('/ha/back',   handleReturn('back'));
router.get('/ha/error',  handleReturn('error'));

function handleReturn(kind) {
  return async (req, res, next) => {
    try {
      const orderId = String(req.query.oid || '').trim();
      const ci      = String(req.query.ci  || '').trim(); // checkoutIntentId
      if (!orderId || !ci) {
        return res.status(400).send(htmlMsg('Réception HelloAsso', 'Paramètres manquants (oid/ci).'));
      }

      const order = await Order.findById(orderId);
      if (!order) return res.status(404).send(htmlMsg('Réception HelloAsso', 'Commande introuvable.'));

      // Vérifie l’état HelloAsso (via ton client)
      const ha = await getHelloAssoClient(); // suppose que tu gères token etc.
      let paid = false, haPaymentRef = null;

      try {
        // Exemple générique (adapte à ton client): ha.getCheckout(ci)
        const status = await ha.getCheckoutStatus(ci); // { status: 'Paid'|'Authorized'|..., paymentRef: '...' }
        if (status && (status.status === 'Paid' || status.status === 'Authorized')) {
          paid = true;
          haPaymentRef = status.paymentRef || null;
        }
      } catch (e) {
        // Si l’API échoue, on ne marque pas payé
        console.warn('[HA return] status fetch failed:', e.message);
      }

      if (paid) {
        order.status = 'paid';
        if (haPaymentRef) order.haPaymentRef = haPaymentRef;
        await order.save();

        // Assigne subscriberNo pour tous les subscribers des lignes
        const seasonCode = order.seasonCode;
        const ids = [...new Set((order.lines||[]).map(l => String(l.subscriberId||'')).filter(Boolean))];
        const subs = await Subscriber.find({ _id: { $in: ids } });
        const subsById = new Map();
        for (const s of subs) { 
          const updated = await ensureSubscriberNo(s._id, seasonCode);
          subsById.set(String(s._id), updated || s);
        }

        // Envoi attestation
        const html = renderAttestationHtml({
          seasonCode,
          payerEmail: order?.payer?.email || '',
          order,
          subscribersById: subsById
        });

        const to = order?.payer?.email || (subs[0]?.email) || process.env.FROM_EMAIL;
        await sendMail({ to, subject: `Attestation d’abonnement ${seasonCode}`, html });
      }

      // Affichage UX
      const msg = paid
        ? 'Merci, votre paiement a été confirmé. Une attestation vous a été envoyée par e-mail.'
        : (kind === 'error'
            ? "Le paiement a été annulé ou n'a pas pu être confirmé."
            : "Retour effectué. Vérification du paiement en cours.");

      res.send(htmlMsg('Retour HelloAsso', msg, paid));
    } catch (e) { next(e); }
  };
}

function htmlMsg(title, msg, ok=false) {
  return `<!doctype html><meta charset="utf-8"><title>${title}</title>
  <style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:24px;background:#0f172a;color:#e5e7eb}
  .card{max-width:680px;margin:0 auto;background:#111827;border:1px solid #1f2937;border-radius:12px;padding:18px}
  .ok{color:#34d399}.warn{color:#fbbf24}.err{color:#f87171}
  a{color:#22d3ee}
  </style>
  <div class="card">
    <h1>${title}</h1>
    <p class="${ok?'ok':'warn'}">${msg}</p>
    <p><a href="${(process.env.APP_URL||'').replace(/\/$/,'')}/s/renew">Retour à la billetterie</a></p>
  </div>`;
}

module.exports = router;
