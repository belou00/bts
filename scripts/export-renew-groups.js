#!/usr/bin/env node
// scripts/export-renew-groups.js
// Usage:
//  node scripts/export-renew-groups.js <seasonCode> --venue=<slug> --base=<baseUrl> --out=<file.csv> [--expDays=30] [--debug]
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const Subscriber = require('../src/models/Subscriber');
const Seat = require('../src/models/Seat');

function arg(name, def=null) {
  const hit = process.argv.find(x => x.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

function normGroupKey(v){ const s=String(v||'').trim().toLowerCase(); return s ? s.replace(/\s+/g,'_') : null; }

async function resolveSeatIds({ seasonCode, venueSlug, wanted, debug }) {
  const wantedArr = Array.from(wanted);
  if (wantedArr.length === 0) return [];

  // 1) correspondance exacte
  const exact = await Seat.find({ seasonCode, venueSlug, seatId: { $in: wantedArr } }, { seatId:1 }).lean();
  const found = new Set(exact.map(x => x.seatId));
  const missing = wantedArr.filter(x => !found.has(x));

  if (debug && missing.length) {
    console.log('[export-renew] missing exact:', missing);
  }

  if (missing.length === 0) return Array.from(found);

  // 2) fallback "suffixe" : on cherche des seats dont seatId se termine par "-A-001" (par ex)
  // NB: on sécurise: suffix = tout après le premier '-' (ex: "A-001" si "S1-A-001")
  const suffixes = missing
    .map(id => {
      const parts = String(id).split('-');
      return parts.length >= 2 ? parts.slice(1).join('-') : null;
    })
    .filter(Boolean);

  if (suffixes.length) {
    // On récupère *tous* les seats de la saison/lieu et on filtre en JS (évite regex per-doc)
    const allSeats = await Seat.find({ seasonCode, venueSlug }, { seatId:1 }).lean();
    const bySuffix = new Map(); // "A-001" -> "S1-A-001"
    for (const s of allSeats) {
      const p = s.seatId.split('-');
      if (p.length >= 2) {
        const suf = p.slice(1).join('-');
        if (!bySuffix.has(suf)) bySuffix.set(suf, s.seatId);
      }
    }
    for (const suf of suffixes) {
      const mapped = bySuffix.get(suf);
      if (mapped) found.add(mapped);
    }
    if (debug) {
      const got = suffixes.filter(suf => bySuffix.has(suf));
      const nog = suffixes.filter(suf => !bySuffix.has(suf));
      console.log('[export-renew] suffix mapped:', got);
      if (nog.length) console.log('[export-renew] suffix still missing:', nog);
    }
  }

  return Array.from(found);
}

(async () => {
  const [,, seasonCode] = process.argv;
  const venueSlug = arg('venue');
  const baseUrl = arg('base');
  const outPath = arg('out') || 'renew-groups.csv';
  const expDays = Number(arg('expDays', '30')) || 30;
  const debug = hasFlag('debug');

  if (!seasonCode || !venueSlug || !baseUrl) {
    console.error('Usage: node scripts/export-renew-groups.js <seasonCode> --venue=<slug> --base=<baseUrl> --out=<file.csv> [--expDays=30] [--debug]');
    process.exit(1);
  }
  if (!process.env.JWT_SECRET) {
    console.error('Missing JWT_SECRET in .env');
    process.exit(1);
  }
  const mongo = process.env.MONGO_URI;
  if (!mongo) { console.error('Missing MONGO_URI'); process.exit(1); }
  await mongoose.connect(mongo);

  const subs = await Subscriber.find({ seasonCode, venueSlug }).lean();
  if (debug) console.log(`[export-renew] subscribers loaded: ${subs.length}`);

  const groups = new Map();
  for (const s of subs) {
    const gk = normGroupKey(s.groupKey || s.group || s.email);
    if (!gk) continue;
    if (!groups.has(gk)) groups.set(gk, []);
    groups.get(gk).push(s);
  }
  if (debug) console.log(`[export-renew] groups: ${groups.size}`);

  const rows = [];
  for (const [gk, arr] of groups.entries()) {
    const email = arr.find(x => x.email)?.email || '';
    const wanted = new Set();
    for (const s of arr) {
      if (s.prefSeatId) wanted.add(s.prefSeatId);
      for (const p of (s.previousSeasonSeats || [])) wanted.add(p);
    }

    const seatIds = await resolveSeatIds({ seasonCode, venueSlug, wanted, debug });
    if (debug) console.log(`[export-renew] group=${gk} email=${email} seatIds=${seatIds.join(';')}`);

    const payload = { seasonCode, venueSlug, groupKey: gk, email, seatIds };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: `${expDays}d` });
    const renewUrl = `${baseUrl.replace(/\/+$/,'')}/s/renew?id=${encodeURIComponent(token)}`;

    rows.push({ groupKey: gk, email, seats: seatIds.join(';'), token, renewUrl });
  }

  const header = 'groupKey,email,seats,token,renewUrl\n';
  const body = rows.map(r =>
    [r.groupKey, r.email, r.seats, r.token, r.renewUrl]
      .map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')
  ).join('\n');
  const full = path.resolve(outPath);
  fs.writeFileSync(full, header + body + '\n', 'utf8');
  console.log(`✓ Exported ${rows.length} groups → ${full}`);

  await mongoose.disconnect();
})().catch(async (e) => {
  console.error('ERROR', e);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});

