// src/payments/helloasso.js
// NOTE: stub prêt à connecter HelloAsso Checkout API.
// createCheckout({order}) retourne une URL/ID de session ou charge un widget côté front.

async function createCheckout({ order, returnUrl, cancelUrl }) {
  // Ici: appeler l’API HelloAsso (OAuth2 client credentials) pour créer une session
  // et enregistrer vos "installments" comme paiements programmés si supportés.
  // DEV: on simule une URL de paiement.
  const fakeSessionId = 'ha_sess_'+order.orderNo;
  return { checkoutSessionId: fakeSessionId, checkoutUrl: `${returnUrl}?paid=fake` };
}

function verifyWebhookSignature(req) {
  // TODO: implémenter vérification HELLOASSO_WEBHOOK_SECRET
  return true;
}

module.exports = { createCheckout, verifyWebhookSignature };
