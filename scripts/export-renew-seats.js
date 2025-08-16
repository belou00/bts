// scripts/export-renew-seats.js
// 1 ligne = 1 place (pour publipostage / renouvellement)
// Colonnes: group,email,firstName,lastName,seatId,seatStatus,renewUrl
// Usage:
//   node scripts/export-renew-seats.js <seasonCode> [--all-prev] [--group=subscriberId|email]
//
// Par défaut: ne liste que (provisioned pour ce subscriber) + (held).
// --all-prev : liste toutes les places N-1 (même booked/available) avec statut informatif.
// group = email par défaut ; --group=subscriberId possible.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Subscriber = require('../src/models/Subscriber');
const Seat = require('../src/models/Seat');

function csvEscape(v) {
  const s = String(v == null ? '' : v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

(async () => {
  const [seasonCode, ...flags] = process.argv.slice(2);
  if (!seasonCode) {
    console.error('Usage: node scripts/export-renew-seats.js <seasonCode> [--all-prev] [--group=subscriberId|email]');
    process.exit(1);
  }
  const listAllPrev = flags.includes('--all-prev');
  const groupArg = (flags.find(f => f.startsWith('--group=')) || '--group=email').split('=')[1];
  const groupMode = ['subscriberId', 'email'].includes(groupArg) ? groupArg : 'email';

  const appUrl    = (process.env.APP_URL || 'http://localhost:8080').replace(/\/+$/,'');
  const jwtSecret = process.env.JWT_SECRET;
  const mongoUri  = process.env.MONGO_URI || process.env.MONGODB_URI;

  if (!mongoUri) { console.error('ERROR: MONGO_URI/MONGODB_URI manquant'); process.exit(1); }
  if (!jwtSecret){ console.error('ERROR: JWT_SECRET manquant');         process.exit(1); }

  await mongoose.connect(mongoUri);

  process.stdout.write('group,email,firstName,lastName,seatId,seatStatus,renewUrl\n');

  let totalSubs=0, rows=0, skippedNoEmail=0;

  const cursor = Subscriber.find({
    previousSeasonSeats: { $exists: true, $ne: [] }
  }).cursor();

  for await (const sub of cursor) {
    totalSubs++;
    const email = sub.email || '';
    if (!email) { skippedNoEmail++; continue; }

    const prevSeats = Array.isArray(sub.previousSeasonSeats) ? sub.previousSeasonSeats : [];
    if (prevSeats.length === 0) continue;

    // État des places N-1 pour la saison cible
    const seasonSeats = await Seat.find(
      { seasonCode, seatId: { $in: prevSeats } },
      { seatId: 1, status: 1, provisionedFor: 1 }
    ).lean();

    const byId = new Map(seasonSeats.map(s => [s.seatId, s]));

    // JWT d’accès à la page de renouvellement (30j)
    const token = jwt.sign(
      { subscriberId: sub._id.toString(), seasonCode, phase: 'renewal' },
      jwtSecret,
      { expiresIn: '30d' }
    );

    const groupVal = groupMode === 'subscriberId' ? String(sub._id) : email;

    for (const seatId of prevSeats) {
      const rec = byId.get(seatId);
      const status = rec?.status || 'unknown';
      const isOwnedProvision =
        rec && rec.status === 'provisioned' && String(rec.provisionedFor || '') === String(sub._id);
      const isHeld = rec && rec.status === 'held';

      // Par défaut: on n’exporte que les places réellement renouvelables
      if (!listAllPrev && !(isOwnedProvision || isHeld)) continue;

      const renewUrl = `${appUrl}/s/renew?id=${encodeURIComponent(token)}&seat=${encodeURIComponent(seatId)}`;

      const row = [
        csvEscape(groupVal),
        csvEscape(email),
        csvEscape(sub.firstName || ''),
        csvEscape(sub.lastName  || ''),
        csvEscape(seatId),
        csvEscape(status),
        csvEscape(renewUrl)
      ].join(',') + '\n';

      process.stdout.write(row);
      rows++;
    }
  }

  await mongoose.disconnect();
  console.error(`Done. subscribers=${totalSubs}, rows=${rows}, skippedNoEmail=${skippedNoEmail}`);
})().catch(async (e) => {
  console.error(e);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
