// src/utils/pricing.js
// Tarifs: catalogue en DB (Tariff) avec fallback par défaut.
// Prix: table TariffPrice (par zone/saison/lieu) avec fallback par défaut.
// CommonJS.

const TariffModel = require('../models/Tariff');
const TariffPrice = require('../models/TariffPrice');

// ---- Fallback (si DB vide) ----
const DEFAULT_TARIFFS = [
  { code: 'NORMAL',             label: 'Tarif normal' },
  { code: 'ETUDIANT',           label: 'Tarif étudiant',           requiresField: 'ine',     fieldLabel: 'Numéro INE',       requiresInfo: 'Carte étudiant à présenter' },
  { code: 'TEEN_12_17',         label: '12–17 ans',                requiresInfo: 'Pièce d’identité à présenter' },
  { code: 'UNDER_12',           label: 'Moins de 12 ans',          requiresInfo: 'Pièce d’identité à présenter' },
  { code: 'CLUB_LICENCE_ADULT', label: 'Club – licencié majeur',   requiresField: 'licence', fieldLabel: 'Numéro de licence' },
  { code: 'CLUB_LICENCE_MINOR', label: 'Club – licencié mineur',   requiresField: 'licence', fieldLabel: 'Numéro de licence' },
  { code: 'CLUB_PARENT',        label: 'Club – parent de licencié',requiresField: 'licence', fieldLabel: 'Numéro de licence', requiresInfo: 'valable pour 2 places maximum' }
];

const DEFAULT_BASE_PRICES = {
  NORMAL: 18000,
  ETUDIANT: 15000,
  TEEN_12_17: 14000,
  UNDER_12: 10000,
  CLUB_LICENCE_ADULT: 15000,
  CLUB_LICENCE_MINOR: 12000,
  CLUB_PARENT: 16000
};

// --- CATALOGUE ---

/** Retourne le catalogue DB (actifs), ou fallback si vide. */
async function getTariffCatalog() {
  try {
    const docs = await TariffModel.find({ active: true }).sort({ sortOrder: 1, label: 1 }).lean();
    if (docs && docs.length) {
      return docs.map(d => ({
        code: d.code,
        label: d.label,
        requiresField: d.requiresField || null,
        fieldLabel: d.fieldLabel || null,
        requiresInfo: d.requiresInfo || null
      }));
    }
  } catch (e) {
    // ignore -> fallback
  }
  return DEFAULT_TARIFFS;
}

/** Fallback synchrone (utile en cas d’appel sans DB) */
function getTariffCatalogSync() {
  return DEFAULT_TARIFFS;
}

/** Vérifie si un code nécessite une justification selon un catalogue donné */
function requiresJustifFromCatalog(catalog, code) {
  const c = String(code || '').trim().toUpperCase();
  const t = (catalog || []).find(x => x.code === c);
  return !!(t && (t.requiresField || t.requiresInfo));
}

/** Fallback synchrone (depuis DEFAULT_TARIFFS) */
function needJustification(tariffCode) {
  return requiresJustifFromCatalog(DEFAULT_TARIFFS, tariffCode);
}

// --- PRIX ---

function asMapByZone(docs) {
  const map = {};
  for (const d of docs) {
    if (!map[d.zoneKey]) map[d.zoneKey] = {};
    map[d.zoneKey][d.tariffCode] = d.priceCents;
  }
  return map;
}

/** Table des prix par zone depuis la DB ; fallback sur DEFAULT_BASE_PRICES. */
async function getZonePriceTable(opts = {}) {
  const { seasonCode = null, venueSlug = null } = opts;
  if (seasonCode && venueSlug) {
    const docs = await TariffPrice.find({ seasonCode, venueSlug }).lean();
    if (docs && docs.length) {
      const byZone = asMapByZone(docs);
      return { '*': { ...DEFAULT_BASE_PRICES }, ...byZone };
    }
  }
  return { '*': { ...DEFAULT_BASE_PRICES } };
}

/** Somme en centimes pour des lignes [{ zoneKey, tariffCode }] selon la table de prix. */
async function computeSubscriptionPriceCents(lines, opts = {}) {
  const table = await getZonePriceTable(opts);
  let sum = 0;
  for (const ln of lines || []) {
    const zoneKey = ln.zoneKey || '*';
    const zoneMap = table[zoneKey] || table['*'] || {};
    const p = zoneMap[String(ln.tariffCode).trim().toUpperCase()];
    if (typeof p !== 'number') {
      throw new Error(`No price for ${ln.tariffCode} in zone ${zoneKey}`);
    }
    sum += p;
  }
  return sum;
}

module.exports = {
  // Catalog
  getTariffCatalog,
  getTariffCatalogSync,
  requiresJustifFromCatalog,
  needJustification,
  // Prices
  getZonePriceTable,
  computeSubscriptionPriceCents
};

