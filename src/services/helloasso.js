
const crypto = require('crypto');
const { getHelloAssoConfig } = require('../config/helloasso');

let cached = { accessToken: null, expiresAt: 0, env: null };

async function getAccessToken() {
  const cfg = getHelloAssoConfig();
  const now = Date.now();

  if (cached.accessToken && cached.env === cfg.env && now < cached.expiresAt - 30000) {
    return cached.accessToken;
  }

  if (!cfg.clientId || !cfg.clientSecret) {
    throw new Error('HELLOASSO_CLIENT_ID/SECRET manquant(s)');
  }

  const body = new URLSearchParams({ grant_type: 'client_credentials' });
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');

  const res = await fetch(cfg.tokenUri, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`HelloAsso token error ${res.status} ${text}`);

  const json = JSON.parse(text);
  cached = { accessToken: json.access_token, expiresAt: Date.now() + json.expires_in * 1000, env: cfg.env };
  return cached.accessToken;
}

async function initCheckoutIntent(payload) {
  const cfg = getHelloAssoConfig();
  const token = await getAccessToken();

  if (!cfg.orgSlug) throw new Error('HELLOASSO_ORG_SLUG manquant');

  const res = await fetch(`${cfg.apiBase}/organizations/${cfg.orgSlug}/checkout-intents`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HelloAsso init error ${res.status}: ${JSON.stringify(data)}`);
  return data; // { id, redirectUrl, ... }
}

// HMAC SHA-256 (optionnel)
function verifyHaSignature(rawBodyBuffer, signatureHeader) {
  const key = process.env.HELLOASSO_WEBHOOK_SIGNATURE;
  if (!key) return true;
  const hmac = crypto.createHmac('sha256', key).update(rawBodyBuffer).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac, 'utf8'), Buffer.from(signatureHeader || '', 'utf8'));
  } catch {
    return false;
  }
}

module.exports = { initCheckoutIntent, verifyHaSignature };
