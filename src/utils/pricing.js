// src/utils/pricing.js (only Tariff + TariffPrice)
import { Tariff, TariffPrice } from '../models/index.js';

export async function getTariffCatalog() {
  const rows = await Tariff.find({ active: { $ne: false } }).sort({ sortOrder: 1, code: 1 }).lean();
  return rows;
}

export async function getZonePriceTable({ seasonCode, venueSlug }) {
  const out = {};
  const tps = await TariffPrice.find({ seasonCode, venueSlug }).lean();
  for (const r of tps) {
    const z = r.zoneKey || '*';
    const t = (r.tariffCode || '').toUpperCase();
    const p = Number(r.priceCents || 0);
    if (!t) continue;
    if (!out[z]) out[z] = {};
    out[z][t] = p;
  }
  return out;
}

export async function computeSubscriptionPriceCents(lines, { seasonCode, venueSlug }) {
  const table = await getZonePriceTable({ seasonCode, venueSlug });
  let total = 0;
  for (const it of lines) {
    const z = (it.zoneKey || '*').toString();
    const t = (it.tariffCode || '').toUpperCase();
    const price =
      (table[z] && table[z][t] != null ? table[z][t] : null) ??
      (table['*'] && table['*'][t] != null ? table['*'][t] : null) ??
      0;
    total += Number(price) || 0;
  }
  return total;
}

export default { getTariffCatalog, getZonePriceTable, computeSubscriptionPriceCents };
