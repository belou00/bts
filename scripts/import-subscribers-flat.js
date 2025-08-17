// scripts/import-subscribers-flat.js
// Usage:
//   node scripts/import-subscribers-flat.js <path/to/subscribers_flat.csv> <seasonCode> [--dry-run] [--no-seat-check] [--venue=slug] [--pad3] [--verbose]
//
// CSV attendu (1 ligne = 1 siège) :
//   firstName,lastName,email,phone,seatId[,group]
//
// Effet : upsert Subscriber par email, avec:
//   - previousSeasonSeats agrégé (dédupliqué)
//   - groupKey = group || email
//
// Notes : --pad3 => transforme le dernier segment numérique en 3 chiffres (…-1 -> …-001)

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const Subscriber = require('../src/models/Subscriber');
const Seat = require('../src/models/Seat');

function parseArgs() {
  const [csvPath, seasonCode, ...flags] = process.argv.slice(2);
  if (!csvPath || !seasonCode) {
    console.error('Usage: node scripts/import-subscribers-flat.js <csv_flat> <seasonCode> [--dry-run] [--no-seat-check] [--venue=slug] [--pad3] [--verbose]');
    process.exit(1);
  }
  const arg = (name, def=null) => {
    const f = flags.find(x => x.startsWith(`--${name}=`));
    return f ? f.split('=')[1] : def;
  };
  return {
    csvPath,
    seasonCode,
    dryRun: flags.includes('--dry-run'),
    seatCheck: !flags.includes('--no-seat-check'),
    venueSlug: arg('venue', null),
    pad3: flags.includes('--pad3'),
    verbose: flags.includes('--verbose')
  };
}

function parseCsvText(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim() !== '');
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line) => {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            cur += '"'; i++; // escape ""
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ',') { out.push(cur); cur = ''; }
        else cur += ch;
      }
    }
    out.push(cur);
    return out.map(s => s.trim());
  };

  const headers = parseLine(lines[0]).map(h => h.trim());
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

function headersIndex(headers) {
  const idx = {};
  headers.forEach((h, i) => { idx[h.toLowerCase()] = i; });
  const need = ['firstname','lastname','email','phone','seatid'];
  const missing = need.filter(k => !(k in idx));
  if (missing.length) throw new Error(`Colonnes manquantes: ${missing.join(', ')}. Vues: ${headers.join(', ')}`);
  return idx;
}

const normEmail = s => String(s || '').trim().toLowerCase();

function pad3LastSegment(seatId) {
  const s = String(seatId || '').trim().toUpperCase();
  // pad seulement le dernier segment si c'est un nombre
  const parts = s.split('-');
  if (parts.length < 2) return s;
  const last = parts[parts.length - 1];
  if (!/^\d+$/.test(last)) return s;
  parts[parts.length - 1] = last.padStart(3, '0');
  return parts.join('-');
}
function normalizeSeatId(raw, pad3) {
  const s = String(raw || '').trim().toUpperCase();
  if (!pad3) return s;
  return pad3LastSegment(s);
}

(async () => {
  const { csvPath, seasonCode, dryRun, seatCheck, venueSlug, pad3, verbose } = parseArgs();
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) { console.error('ERROR: MONGO_URI/MONGODB_URI manquant'); process.exit(1); }

  const fullPath = path.resolve(csvPath);
  if (!fs.existsSync(fullPath)) { console.error(`CSV introuvable: ${fullPath}`); process.exit(1); }
  const text = fs.readFileSync(fullPath, 'utf8').replace(/^\uFEFF/, '');
  const { headers, rows } = parseCsvText(text);
  const idx = headersIndex(headers);

  const hasGroup = ('group' in idx) || ('groupkey' in idx);
  const groupCol = ('group' in idx) ? 'group' : (('groupkey' in idx) ? 'groupkey' : null);

  console.log(`Import flat ${path.basename(fullPath)} season=${seasonCode} dryRun=${dryRun} seatCheck=${seatCheck} venue=${venueSlug||'(any)'} pad3=${pad3} verbose=${verbose}`);

  await mongoose.connect(mongoUri);

  // Agrégation par email
  const map = new Map(); // email -> { first,last,phone,groupKey,seats:Set }
  let totalRows = 0, skippedNoEmail = 0;

  for (const row of rows) {
    totalRows++;
    const firstName = row[idx['firstname']] || '';
    const lastName  = row[idx['lastname']]  || '';
    const email     = normEmail(row[idx['email']]);
    const phone     = (row[idx['phone']] || '').trim();
    const seatIdRaw = row[idx['seatid']] || '';
    const seatId    = normalizeSeatId(seatIdRaw, pad3);
    const groupKey  = groupCol ? (row[idx[groupCol]] || '').trim() : '';

    if (!email) { skippedNoEmail++; if (verbose) console.warn(`L${totalRows}: email manquant -> ligne ignorée`); continue; }
    if (!seatId) { if (verbose) console.warn(`L${totalRows}: seatId manquant pour ${email}`); continue; }

    let e = map.get(email);
    if (!e) {
      e = { firstName, lastName, phone, groupKey: groupKey || email, seats: new Set() };
      map.set(email, e);
    } else {
      // on garde le 1er non vide par politesse, sinon on met à jour si vide
      if (!e.firstName && firstName) e.firstName = firstName;
      if (!e.lastName  && lastName ) e.lastName  = lastName;
      if (!e.phone     && phone   ) e.phone     = phone;
      if (!e.groupKey  && groupKey) e.groupKey  = groupKey;
    }
    e.seats.add(seatId);
  }

  // Vérif d'existence des seats (optionnel)
  let seatMissing = 0;
  if (seatCheck) {
    for (const [email, e] of map.entries()) {
      const seatList = Array.from(e.seats);
      const q = { seasonCode, seatId: { $in: seatList } };
      if (venueSlug) q.venueSlug = venueSlug;
      const found = await Seat.find(q, { seatId: 1 }).lean();
      const foundSet = new Set(found.map(x => x.seatId));
      const missing = seatList.filter(s => !foundSet.has(s));
      if (missing.length) {
        seatMissing += missing.length;
        if (verbose) console.warn(`Seats manquants pour ${email}: ${missing.join(', ')}`);
      }
    }
  }

  // Écritures (upserts)
  let created = 0, updated = 0;
  if (!dryRun) {
    for (const [email, e] of map.entries()) {
      const before = await Subscriber.findOne({ email }, { _id: 1 }).lean();
      await Subscriber.findOneAndUpdate(
        { email },
        {
          $set: {
            firstName: e.firstName,
            lastName:  e.lastName,
            phone:     e.phone,
            previousSeasonSeats: Array.from(e.seats),
            groupKey:  e.groupKey || email
          }
        },
        { upsert: true, new: true }
      );
      if (before?._id) updated++; else created++;
    }
  }

  await mongoose.disconnect();

  console.log('--- Résumé ---');
  console.log(`Lignes lues:         ${totalRows}`);
  console.log(`Abonnés agrégés:     ${map.size}`);
  console.log(`Ignorés (sans email): ${skippedNoEmail}`);
  if (seatCheck) console.log(`Seats manquants:     ${seatMissing}`);
  if (!dryRun)   console.log(`Créés:               ${created} | Mis à jour: ${updated}`);
})().catch(async (e) => {
  console.error(e);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
