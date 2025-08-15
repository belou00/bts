// src/controllers/seat.js
const Seat = require('../models/Seat');
const SeatHold = require('../models/SeatHold');

async function holdSeat({ seatId, orderId, ttlMinutes=10 }) {
  const now = new Date();
  const expiresAt = new Date(now.getTime()+ttlMinutes*60*1000);

  // hold unique si seat "available"
  const updated = await Seat.findOneAndUpdate(
    { seatId, status: 'available' },
    { $set: { status: 'held', currentOrderId: orderId } },
    { new: true }
  );
  if (!updated) throw new Error('Seat not available');

  await SeatHold.create({ seatId, orderId, expiresAt });
  return updated;
}

async function releaseExpiredHolds(orderId) {
  const now = new Date();
  const holds = await SeatHold.find({ orderId, expiresAt: { $lte: now } });
  for (const h of holds) {
    await Seat.findOneAndUpdate(
      { seatId: h.seatId, status: 'held', currentOrderId: orderId },
      { $set: { status: 'available' }, $unset: { currentOrderId: 1 } }
    );
  }
}

async function confirmSeat(seatId, orderId) {
  const s = await Seat.findOneAndUpdate(
    { seatId, status: { $in:['held','reserved'] }, currentOrderId: orderId },
    { $set: { status: 'sold' } },
    { new: true }
  );
  if (!s) throw new Error('Seat not held by order');
  return s;
}

module.exports = { holdSeat, releaseExpiredHolds, confirmSeat };
