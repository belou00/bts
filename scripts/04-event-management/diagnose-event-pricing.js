#!/usr/bin/env node
/**
 * Diagnostique « je ne peux pas sélectionner de sièges » sur un événement.
 *
 * Remonte toute la chaîne — événement → table tarifaire → zones → méta-zones
 * → sièges — et signale l'endroit exact où elle casse. Écrit après un cas où
 * une grille rédigée par méta-zone était perdue à l'instanciation : le
 * symptôme (aucun siège sélectionnable) était à trois maillons de la cause.
 *
 * Lecture seule : ce script n'écrit jamais.
 *
 * Usage:
 *   node scripts/04-event-management/diagnose-event-pricing.js --event=<slug|id>
 *
 * Environment:
 *   - MONGO_URI ou MONGODB_URI (requis)
 */
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { Event, Zone, Seat, TariffPrice, TariffPriceCatalog } from '../../src/models/index.js';
import { withMetaZonePrices } from '../../src/utils/meta-zones.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const arg = (name) => {
  const p = process.argv.find(a => a.startsWith(`--${name}=`));
  return p ? p.split('=').slice(1).join('=') : null;
};
const up = v => String(v || '').trim().toUpperCase();

async function main() {
  const ref = arg('event');
  if (!ref) {
    console.error('Usage: node scripts/04-event-management/diagnose-event-pricing.js --event=<slug|id>');
    process.exit(1);
  }
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGO_URI / MONGODB_URI requis');
  await mongoose.connect(uri);

  const ev = /^[0-9a-f]{24}$/i.test(ref)
    ? await Event.findById(ref).lean()
    : await Event.findOne({ slug: ref }).lean();
  if (!ev) throw new Error(`Événement introuvable : ${ref}`);

  const problems = [];
  console.log(`\n=== Événement ===`);
  console.log(`  slug          : ${ev.slug}`);
  console.log(`  saison / lieu : ${ev.seasonCode} / ${ev.venueSlug}`);
  console.log(`  priceTableKey : ${ev.priceTableKey ?? '⚠ ABSENT'}`);
  if (!ev.priceTableKey) {
    problems.push('L\'événement n\'a pas de priceTableKey : aucune grille ne peut lui être rattachée.');
  }

  // --- Table tarifaire de l'événement ---
  const prices = await TariffPrice.find({ priceTableKey: ev.priceTableKey }).lean();
  const byZone = prices.filter(p => up(p.zoneKey));
  const byMeta = prices.filter(p => up(p.metaZone));
  console.log(`\n=== Table tarifaire (${ev.priceTableKey}) ===`);
  console.log(`  lignes         : ${prices.length}  (par zone : ${byZone.length} · par méta-zone : ${byMeta.length})`);
  for (const p of prices.slice(0, 20)) {
    console.log(`    ${(up(p.zoneKey) || 'méta:' + up(p.metaZone)).padEnd(16)} ${String(p.tariffCode).padEnd(12)} ${(p.priceCents ?? 0) / 100} €`);
  }
  if (prices.length > 20) console.log(`    … ${prices.length - 20} de plus`);
  if (!prices.length) {
    problems.push(`Aucune ligne tarifaire pour ${ev.priceTableKey} : l'instanciation n'a rien produit `
      + `(instantiate-tariffs.js --event=${ev.slug} --catalog=<slug>).`);
  }

  // --- Catalogue source : la grille écrite à la main ---
  const catalogs = await TariffPriceCatalog.distinct('catalogSlug');
  console.log(`\n=== Catalogues disponibles ===`);
  for (const slug of catalogs) {
    const rows = await TariffPriceCatalog.find({ catalogSlug: slug }).lean();
    const meta = rows.filter(r => up(r.metaZone)).length;
    console.log(`  ${slug.padEnd(24)} ${rows.length} ligne(s)  (dont ${meta} par méta-zone)`);
    // Le cas qui a motivé ce script : la grille existe, mais pas dans l'événement.
    if (meta && !byMeta.length && prices.length) {
      problems.push(`Le catalogue « ${slug} » contient ${meta} ligne(s) par méta-zone, absente(s) de la table `
        + `de l'événement : réinstancier (instantiate-tariffs.js --event=${ev.slug} --catalog=${slug}).`);
    }
  }

  // --- Zones et rattachement aux méta-zones ---
  const zones = await Zone.find({ seasonCode: ev.seasonCode, venueSlug: ev.venueSlug }).lean();
  console.log(`\n=== Zones (${zones.length}) ===`);
  for (const z of zones) {
    console.log(`  ${up(z.key).padEnd(14)} type=${String(z.type).padEnd(9)} accès=${String(z.access || 'PUBLIC').padEnd(7)}`
      + ` méta-zone=${up(z.metaZone) || '—'}`);
  }
  const metaZonesUsed = new Set(byMeta.map(p => up(p.metaZone)));
  for (const mz of metaZonesUsed) {
    const attached = zones.filter(z => up(z.metaZone) === mz);
    if (!attached.length) {
      problems.push(`La méta-zone « ${mz} » est tarifée mais aucune zone ne lui est rattachée `
        + `(set-zone-metazone.js) : ces lignes ne produisent aucun prix.`);
    }
  }

  // --- Résolution finale, exactement comme les routes publiques ---
  const expanded = await withMetaZonePrices(prices, { seasonCode: ev.seasonCode, venueSlug: ev.venueSlug });
  const priced = new Set(expanded.map(p => up(p.zoneKey)).filter(Boolean));
  const publicSet = new Set(zones.filter(z => (z.access || 'PUBLIC') === 'PUBLIC').map(z => up(z.key)));
  const allowed = [...priced].filter(z => publicSet.has(z)).sort();

  console.log(`\n=== Zones tarifées après résolution des méta-zones ===`);
  console.log(`  ${allowed.length ? allowed.join(', ') : '⚠ aucune'}`);
  const pricedNotPublic = [...priced].filter(z => !publicSet.has(z));
  if (pricedNotPublic.length) {
    problems.push(`Tarifées mais non PUBLIC (donc exclues) : ${pricedNotPublic.join(', ')}.`);
  }

  // --- Sièges réellement sélectionnables ---
  const counts = await Seat.aggregate([
    { $match: { seasonCode: ev.seasonCode, venueSlug: ev.venueSlug, zoneKey: { $in: allowed } } },
    { $group: { _id: { zone: '$zoneKey', status: '$status' }, n: { $sum: 1 } } }
  ]);
  const available = counts.filter(c => c._id.status === 'available').reduce((s, c) => s + c.n, 0);
  console.log(`\n=== Sièges dans ces zones ===`);
  if (!counts.length) console.log('  aucun siège');
  for (const c of counts) console.log(`  ${up(c._id.zone).padEnd(14)} ${c._id.status.padEnd(12)} ${c.n}`);
  console.log(`  → sélectionnables (available) : ${available}`);

  if (!available) {
    const standing = zones.filter(z => allowed.includes(up(z.key)) && z.type === 'standing').map(z => up(z.key));
    if (standing.length === allowed.length && allowed.length) {
      problems.push(`Toutes les zones autorisées sont debout (${standing.join(', ')}) : par construction sans sièges.`);
    } else if (!counts.length) {
      problems.push(`Aucun siège instancié pour ${ev.seasonCode} / ${ev.venueSlug} dans ces zones.`);
    } else {
      problems.push('Des sièges existent mais aucun n\'est « available » (déjà réservés ou provisionnés).');
    }
  }

  console.log(`\n=== Diagnostic ===`);
  if (!problems.length) {
    console.log(`  ✔ Rien d'anormal : ${available} siège(s) sélectionnable(s) sur ${allowed.length} zone(s).`);
  } else {
    for (const p of problems) console.log(`  ⚠ ${p}`);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('❌', err.message || err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
