// src/utils/pricing.js  (ESM)
import { Tariff, TariffPrice } from '../models/index.js';

/**
 * Retourne le catalogue des tarifs (depuis la DB).
 * Fallback sur un petit catalogue si la DB est vide.
 */
export async function getTariffCatalog() {
  const rows = await Tariff.find({ active: { $ne: false } })
    .sort({ order: 1, code: 1 })
    .lean()
    .catch(() => []);
  if (rows && rows.length) return rows;
  return getTariffCatalogSync();
}

/**
 * Fallback synchrone minimal (utile en DEV si pas de données).
 */
export function getTariffCatalogSync() {
  return [
    { code: 'NORMAL', label: 'Plein tarif', active: true, order: 10 },
    { code: 'REDUIT', label: 'Tarif réduit', active: true, order: 20 },
  ];
}

/**
 * Construit une table de prix { zoneKey: { tariffCode: priceCents } }
 * à partir de la collection TariffPrice pour une saison/lieu.
 * Ajoute éventuellement une zone wildcard '*' si définie en base.
 */
export async function getZonePriceTable({ seasonCode, venueSlug }) {
  const out = {};
  const rows = await TariffPrice.find({ seasonCode, venueSlug }).lean().catch(() => []);
  for (const r of rows) {
    const z = r.zoneKey || '*';
    const t = (r.tariffCode || 'NORMAL').toUpperCase();
    const p = Number(r.priceCents || r.price || 0);
    if (!out[z]) out[z] = {};
    out[z][t] = p;
  }
  return out;
}

/**
 * Calcule le total (en cents) pour une liste de lignes [{zoneKey, tariffCode}, ...]
 * en s’appuyant sur la table de prix. Utilise la zone '*' si pas de match précis.
 */
export async function computeSubscriptionPriceCents(lines, { seasonCode, venueSlug }) {
  const table = await getZonePriceTable({ seasonCode, venueSlug });
  let total = 0;
  for (const it of lines) {
    const z = (it.zoneKey || '*').toString();
    const t = (it.tariffCode || 'NORMAL').toUpperCase();
    const price =
      (table[z] && table[z][t] != null ? table[z][t] : null) ??
      (table['*'] && table['*'][t] != null ? table['*'][t] : null) ??
      0;
    total += Number(price) || 0;
  }
  return total;
}

// (optionnel) export par défaut pour usage "import pricing from ..."
export default {
  getTariffCatalog,
  getTariffCatalogSync,
  getZonePriceTable,
  computeSubscriptionPriceCents,
};
