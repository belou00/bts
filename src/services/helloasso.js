// src/services/helloasso.js
import fetch from 'node-fetch';

const ENV = (process.env.APP_ENV || 'development').toLowerCase();
const STUB = String(process.env.HELLOASSO_STUB || 'false').toLowerCase() === 'true';
const STUB_RESULT = (process.env.HELLOASSO_STUB_RESULT || 'success').toLowerCase();

const HELLOASSO_ENV = (process.env.HELLOASSO_ENV || 'sandbox').toLowerCase(); // sandbox|production
const ORG_SLUG = process.env.HELLOASSO_ORG_SLUG || '';
const RETURN_URL = process.env.HELLOASSO_RETURN_URL || '';

const CLIENT_ID =
  HELLOASSO_ENV === 'production'
    ? (process.env.HELLOASSO_CLIENT_ID || '')
    : (process.env.HELLOASSO_CLIENT_ID_SANDBOX || '');

const CLIENT_SECRET =
  HELLOASSO_ENV === 'production'
    ? (process.env.HELLOASSO_CLIENT_SECRET || '')
    : (process.env.HELLOASSO_CLIENT_SECRET_SANDBOX || '');

const API_BASE = 'https://api.helloasso.com/v5';

let _token = null;
let _exp = 0;

async function getAccessToken() {
  if (STUB) return 'stub-token';
  const now = Date.now();
  if (_token && now < _exp) return _token;

  const res = await fetch('https://api.helloasso.com/oauth2/token', {
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
    throw new Error(`HelloAsso OAuth error ${res.status}: ${t}`);
  }
  const data = await res.json();
  _token = data.access_token;
  _exp = Date.now() + Math.max(60, (data.expires_in || 3600) - 60) * 1000;
  return _token;
}

/**
 * @param {Object} params
 * @param {Object} params.order - {_id, totalCents, kind, ...}
 * @param {string} [params.formSlug]
 */
export async function initCheckout({ order, formSlug }) {
  if (!order) throw new Error('order requis');

  if (STUB) {
    const res = STUB_RESULT === 'failure' ? 'failure' : 'success';
    if (!RETURN_URL) throw new Error('HELLOASSO_RETURN_URL manquant pour le STUB');
    const url = `${RETURN_URL}?stub=1&result=${encodeURIComponent(res)}&oid=${encodeURIComponent(order._id)}`;
    return { redirectUrl: url, provider: 'stub' };
  }

  const token = await getAccessToken();

  const returnUrl = `${RETURN_URL}?oid=${encodeURIComponent(order._id)}`;
  const backUrl   = returnUrl.replace('/ha/return', '/ha/back');
  const errorUrl  = returnUrl.replace('/ha/return', '/ha/error');

  const totalCents = Math.round(order.totalCents || order.amount || 0);
  const payload = {
    totalAmount: totalCents,
    returnUrl, backUrl, errorUrl,
    metadata: { kind: order.kind || 'season-renew', orderId: String(order._id), env: ENV }
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
  const intentId = data?.id || data?.intentId || '';
  if (!redirectUrl) throw new Error('HelloAsso: redirectUrl manquant');
  return { redirectUrl, provider: 'helloasso', intentId };
}

export async function getCheckoutStatus(intentId) {
  if (STUB) return (STUB_RESULT === 'failure') ? 'Failed' : 'Paid';
  if (!intentId) return 'Unknown';
  const token = await getAccessToken();
  const url = `${API_BASE}/checkout-intents/${encodeURIComponent(intentId)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return 'Unknown';
  const data = await res.json().catch(() => ({}));
  return (data?.state || data?.status || 'Unknown');
}
