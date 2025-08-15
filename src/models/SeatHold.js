// src/models/SeatHold.js
const mongoose = require('mongoose');
const SeatHoldSchema = new mongoose.Schema({
  seatId: { type: String, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  expiresAt: { type: Date, index: true }
},{timestamps:true});

// TTL auto (ex: 10 min)
SeatHoldSchema.index({ "expiresAt": 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model('SeatHold', SeatHoldSchema);
