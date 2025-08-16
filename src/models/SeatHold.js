const mongoose = require('mongoose');

const SeatHoldSchema = new mongoose.Schema({
  seatId: { type: String, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  // IMPORTANT: pas d'index inline ici pour éviter le doublon
  expiresAt: { type: Date }
}, { timestamps: true });

// Index TTL unique (supprime le doc quand expiresAt est atteint)
SeatHoldSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_expiresAt' });

module.exports = mongoose.model('SeatHold', SeatHoldSchema);
