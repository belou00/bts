const PriceTable = require('../models/PriceTable');
const Seat = require('../models/Seat');

/** Tarifs nécessitant un justificatif (codes côté BTS) */
function needJustification(tariffCode) {
  const code = String(tariffCode || '').toUpperCase();
  return ['TEEN_12_18', 'CHILD', 'STUDENT', 'SENIOR', 'OTHER_REDUCED'].includes(code);
}

/** Résout la zone à partir d'un seatId (si zoneKey non fourni) */
async function resolveZoneKey(seasonCode, { zoneKey, seatId }) {
  if (zoneKey) return zoneKey;
  if (!seatId) throw new Error('resolveZoneKey: seatId or zoneKey required');
  const seat = await Seat.findOne({ seatId, seasonCode });
  if (!seat) throw new Error(`Seat ${seatId} not found for season ${seasonCode}`);
  return seat.zoneKey;
}

/** Retourne le prix (centimes) et si justificatif requis, pour une ligne */
async function priceForLine({ seasonCode, zoneKey, seatId, tariffCode }) {
  const zk = await resolveZoneKey(seasonCode, { zoneKey, seatId });
  const table = await PriceTable.findOne({ seasonCode, zoneKey: zk });
  if (!table) throw new Error(`No price table for zone ${zk} in season ${seasonCode}`);
  const p = table.prices.find(x => x.code === String(tariffCode || '').toUpperCase());
  if (!p) throw new Error(`Unknown tariff ${tariffCode} for zone ${zk}`);
  return { amountCents: p.amountCents, requiresJustification: !!p.requiresJustification, zoneKey: zk };
}

/**
 * Calcule le total en centimes d'un panier de lignes.
 * lines: [{ seasonCode, zoneKey?, seatId?, tariffCode, quantity? }]
 * -> quantity par défaut = 1
 */
async function computeSubscriptionPriceCents(lines) {
  let total = 0;
  for (const l of lines) {
    const { amountCents } = await priceForLine(l);
    total += amountCents * (l.quantity || 1);
  }
  return total;
}

module.exports = { needJustification, priceForLine, computeSubscriptionPriceCents };
