// scripts/export-renew-groups.js
// Usage:
//   node scripts/export-renew-groups.js <seasonCode> [--base=https://billetterie-dev.belougas.fr/bts] [--expires=30d] [--out=renew-groups.csv] [--group=KEY] [--email=addr]
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Subscriber = require('../src/models/Subscriber');

const arg = (name, def=null) => {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : def;
};
const csvEsc = (v) => {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

(async()=>{
  const seasonCode = process.argv[2];
  if (!seasonCode) {
    console.error('Usage: node scripts/export-renew-groups.js <seasonCode> [--base=...] [--expires=30d] [--out=renew-groups.csv] [--group=KEY] [--email=addr]');
    process.exit(1);
  }
  const base = arg('base', process.env.APP_URL || 'http://localhost:8080');
  const expiresIn = arg('expires', '30d');
  const out = arg('out', 'renew-groups.csv');
  const filterGroup = arg('group', null);
  const filterEmail = arg('email', null);

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  const jwtSecret = process.env.JWT_SECRET;
  if (!mongoUri || !jwtSecret) { console.error('Missing MONGO_URI/JWT_SECRET'); process.exit(1); }

  await mongoose.connect(mongoUri);

  const q = { previousSeasonSeats: { $exists: true, $ne: [] } };
  if (filterEmail) q.email = filterEmail;
  if (filterGroup) q.groupKey = filterGroup;

  const subs = await Subscriber.find(q, { email:1, groupKey:1, firstName:1, lastName:1 }).lean();

  // Regroupe par groupKey (défaut = email)
  const groups = new Map(); // key -> { members:Set(email), sample:sub }
  for (const s of subs) {
    const key = s.groupKey || s.email;
    const g = groups.get(key) || { key, members: new Set(), sample: s };
    g.members.add(s.email);
    groups.set(key, g);
  }

  // 1 lien par groupe
  const rows = [];
  for (const g of groups.values()) {
    const token = jwt.sign({ groupKey: g.key, seasonCode, phase: 'renewal' }, jwtSecret, { expiresIn });
    const renewUrl = `${base.replace(/\/$/,'')}/s/renew?id=${encodeURIComponent(token)}`;
    rows.push({
      group: g.key,
      contactEmail: g.sample.email,
      sampleFirst: g.sample.firstName || '',
      sampleLast: g.sample.lastName || '',
      membersCount: g.members.size,
      renewUrl
    });
  }

  rows.sort((a,b) =>
    (a.group||'').localeCompare(b.group||'') ||
    a.contactEmail.localeCompare(b.contactEmail)
  );

  const header = 'group,contactEmail,sampleFirstName,sampleLastName,membersCount,renewUrl\n';
  const body = rows.map(r => [r.group, r.contactEmail, r.sampleFirst, r.sampleLast, r.membersCount, r.renewUrl]
    .map(csvEsc).join(',')).join('\n') + '\n';

  fs.writeFileSync(path.resolve(out), header + body, 'utf8');
  console.log(`Wrote ${path.resolve(out)} (${rows.length} groups) base=${base}`);
  await mongoose.disconnect();
})();
