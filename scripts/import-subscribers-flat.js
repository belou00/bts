/**
 * Import "flat" : 1 ligne = 1 siège.
 * Usage:
 *   node scripts/import-subscribers-flat.js <csvPath> <seasonCode> --venue=<slug>
 *
 * Colonnes acceptées (insensibles à la casse) :
 *   firstName,lastName,email,phone,seasonCode,venueSlug,seatId|prefSeatId|seat,group
 * - Si group est vide → group = email
 * - Ajoute/Met à jour un Subscriber par (email + seatId) et ajoute le siège dans previousSeasonSeats
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mongoose = require('mongoose');
const Subscriber = require('../src/models/Subscriber');

function parseArgs(argv) {
  const [,, csvPath, seasonCode, ...rest] = argv;
  const args = { csvPath, seasonCode, venueSlug: null };
  for (const t of rest) {
    const m = /^--venue=(.+)$/.exec(t);
    if (m) args.venueSlug = m[1];
  }
  return args;
}

function headersIndex(headerLine) {
  const h = headerLine.split(',').map(x => x.trim().toLowerCase());
  const idx = Object.fromEntries(h.map((k, i) => [k, i]));
  function col(...names) {
    for (const n of names) {
      const key = String(n).toLowerCase();
      if (idx[key] != null) return idx[key];
    }
    return -1;
  }
  const firstName = col('firstname','first_name','prenom','first');
  const lastName  = col('lastname','last_name','nom','last');
  const email     = col('email','mail');
  const phone     = col('phone','tel','telephone');
  const seatId    = col('seatid','prefseatid','seat');
  const group     = col('group','groupkey','groupe');
  const seasonCol = col('seasoncode','season','saison');
  const venueCol  = col('venueslug','venue','lieu');

  const missing = [];
  if (email < 0)   missing.push('email');
  if (seatId < 0)  missing.push('seatId (ou prefSeatId)');
  if (missing.length) {
    throw new Error(`Colonnes manquantes: ${missing.join(', ')}. Vues: ${h.join(', ')}`);
  }
  return { h, idx, firstName, lastName, email, phone, seatId, group, seasonCol, venueCol };


function normGroupKey(v) {
  const s = String(v || '').trim().toLowerCase();
  return s.replace(/\s+/g, '_');
}

(async () => {
  const { csvPath, seasonCode, venueSlug } = parseArgs(process.argv);
  if (!csvPath || !seasonCode) {
    console.error('Usage: node scripts/import-subscribers-flat.js <csvPath> <seasonCode> --venue=<slug>');
    process.exit(1);
  }

  const mongoUri = process.env.MONGO_URI;

  await mongoose.connect(mongoUri);

  const full = path.resolve(csvPath);
  if (!fs.existsSync(full)) {
    console.error('CSV not found:', full);
    process.exit(1);
  }

  const rl = readline.createInterface({ input: fs.createReadStream(full, 'utf8'), crlfDelay: Infinity });

  let header = null, cols = null, scanned = 0, upserts = 0;
  for await (const raw of rl) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim()) continue;
    if (!header) {
      header = line;
      cols = headersIndex(header);
      continue;
    }
    scanned++;

    const cells = line.split(',').map(x => x.trim());
    const pick = (i) => (i >= 0 ? (cells[i] || '') : '');
    const email = pick(cols.email);
    const firstName = pick(cols.firstName);
    const lastName  = pick(cols.lastName);
    const phone     = pick(cols.phone);
    const seatId    = pick(cols.seatId);
    const groupRaw  = pick(cols.group);
    const seasonCSV = pick(cols.seasonCol);
    const venueCSV  = pick(cols.venueCol);

    const season = seasonCSV || seasonCode; // priorité à l’argument
    const venue  = venueCSV  || venueSlug;  // idem

    if (!email || !seatId) {
      console.warn('SKIP ligne invalide (email/seatId manquant):', { email, seatId });
      continue;
    }

// ...
const group = groupRaw || email;
const groupKey = normGroupKey(group);

const update = {
  firstName,
  lastName,
  email,
  phone,
  prefSeatId: seatId,
  seasonCode: season,
  venueSlug: venue,
  groupKey,            // ← au lieu de "group"
  status: 'invited',
  $addToSet: { previousSeasonSeats: seatId }
};
// ...

    // upsert par (email + prefSeatId) → 1 doc / siège / email
    const where = { email, prefSeatId: seatId };
    const res = await Subscriber.updateOne(where, update, { upsert: true });
    if (res.upsertedCount > 0 || res.modifiedCount > 0) upserts++;
  }

  console.log(`Done. scanned=${scanned} upserts=${upserts}`);
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error('ERROR', e);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
}
