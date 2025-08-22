// src/services/helloasso.js
import fetch from 'node-fetch';

const ENV = (process.env.APP_ENV || 'development').toLowerCase();
const STUB = String(process.env.HELLOASSO_STUB || 'false').toLowerCase() === 'true';
const STUB_RESULT = (process.env.HELLOASSO_STUB_RESULT || 'success').toLowerCase();

const HELLOASSO_ENV = (process.env.HELLOASSO_ENV || 'sandbox').toLowerCase(); // sandbox | production
const ORG_SLUG   = process.env.HELLOASSO_ORG_SLUG || '';
const RETURN_URL = process.env.HELLOASSO_RETURN_URL || '';

const CLIENT_ID     = process.env.HELLOASSO_CLIENT_ID || '';
const CLIENT_SECRET = process.env.HELLOASSO_CLIENT_SECRET || '';

/**
 * Domaine API HelloAsso :
 * - priorité à HELLOASSO_API_URL si défini
 * - sinon fallback sur HELLOASSO_ENV
 */
const API_HOST = (process.env.HELLOASSO_API_URL || '').trim()
  || (HELLOASSO_ENV === 'production'
      ? 'https://api.helloasso.com'
      : 'https://api.helloasso-sandbox.com');

const OAUTH_URL = `${API_HOST}/oauth2/token`;
const API_BASE  = `${API_HOST}/v5`;

let _token = null;
let _exp = 0;
let _loggedConfig = false;

function logResolvedConfigOnce() {
  if (_loggedConfig) return;
  const mask = (s) => s ? `${s.slice(0,4)}…${s.slice(-4)}` : '(unset)';
  console.log('[helloasso] resolved config:', {
    env: ENV,
    haEnv: HELLOASSO_ENV,
    apiHost: API_HOST,
    orgSlug: ORG_SLUG || '(unset)',
    returnUrl: RETURN_URL || '(unset)',
    clientId: mask(CLIENT_ID),
  });
  _loggedConfig = true;
}

async function getAccessToken() {
  if (STUB) return 'stub-token';
  logResolvedConfigOnce();

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('HELLOASSO_CLIENT_ID/HELLOASSO_CLIENT_SECRET manquants');
  }

  const now = Date.now();
  if (_token && now < _exp) return _token;

  const res = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    })
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`HelloAsso OAuth ${res.status}: ${t}`);
  }
  const data = await res.json();
  _token = data.access_token;
  _exp = Date.now() + Math.max(60, (data.expires_in || 3600) - 60) * 1000;
  return _token;
}

/**
 * Démarre un checkout HelloAsso et retourne l’URL de redirection.
 * @param {{order:Object, formSlug?:string}} params
 */
export async function initCheckout({ order, formSlug }) {
  if (!order) throw new Error('order requis');

  // Mode STUB (DEV)
  if (STUB) {
    logResolvedConfigOnce();
    if (!RETURN_URL) throw new Error('HELLOASSO_RETURN_URL manquant pour le STUB');
    const res = STUB_RESULT === 'failure' ? 'failure' : 'success';
    const url = `${RETURN_URL}?stub=1&result=${encodeURIComponent(res)}&oid=${encodeURIComponent(order._id)}`;
    return { redirectUrl: url, provider: 'stub' };
  }

  const token = await getAccessToken();

  const returnUrl = `${RETURN_URL}?oid=${encodeURIComponent(order._id)}`;
  const backUrl   = returnUrl.replace('/ha/return', '/ha/back');
  const errorUrl  = returnUrl.replace('/ha/return', '/ha/error');

  const totalCents = Math.round(order.totalCents || 0);
  const payload = {
    totalAmount: totalCents,
    returnUrl, backUrl, errorUrl,
    metadata: {
      kind: order.kind || 'season-renew',
      orderId: String(order._id),
      env: ENV,
      haEnv: HELLOASSO_ENV,
      apiHost: API_HOST
    }
  };

  const url = `${API_BASE}/organizations/${ORG_SLUG}/forms/${formSlug || 'checkout'}/checkout-intents`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`HelloAsso initCheckout ${res.status}: ${t}`);
  }

  const data = await res.json();
  const redirectUrl = data?.redirectUrl || data?.url || data?.links?.payment || '';
  const intentId    = data?.id || data?.intentId || '';
  if (!redirectUrl) throw new Error('HelloAsso: redirectUrl manquant');

  return { redirectUrl, provider: 'helloasso', intentId };
}

export async function getCheckoutStatus(intentId) {
  if (STUB) return (STUB_RESULT === 'failure') ? 'Failed' : 'Paid';
  logResolvedConfigOnce();
  if (!intentId) return 'Unknown';
  const token = await getAccessToken();
  const url = `${API_BASE}/checkout-intents/${encodeURIComponent(intentId)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return 'Unknown';
  const data = await res.json().catch(() => ({}));
  return (data?.state || data?.status || 'Unknown');
}
