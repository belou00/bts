// src/services/subscribers.js
const Counter = require('../models/Counter');
const Subscriber = require('../models/Subscriber');

async function nextSeq(key) {
  const doc = await Counter.findOneAndUpdate(
    { key }, { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
  return doc.seq;
}

function seasonToShort(seasonCode = '') {
  // "2025-2026" -> "2526"
  const m = String(seasonCode).match(/(\d{4})-(\d{4})/);
  if (!m) return 'XXXX';
  return m[1].slice(2) + m[2].slice(2);
}

async function ensureSubscriberNo(subscriberId, seasonCode) {
  const sub = await Subscriber.findById(subscriberId);
  if (!sub) return null;
  if (sub.subscriberNo && typeof sub.subscriberNo === 'string') return sub;

  const short = seasonToShort(seasonCode);
  const seq = await nextSeq(`subscriber:${seasonCode}`);
  const no = `BTS-${short}-${String(seq).padStart(5, '0')}`;

  sub.subscriberNo = no;
  await sub.save();
  return sub;
}

module.exports = { ensureSubscriberNo, seasonToShort };
