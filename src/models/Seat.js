
const mongoose = require('mongoose');

const SeatSchema = new mongoose.Schema({
  seatId: { type: String, unique: true },
  zoneKey: { type: String, index: true },
  seasonCode: { type: String, index: true },
  status: { type: String, enum: ['available','held','booked','provisioned'], default: 'available', index: true },
  provisionedFor: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscriber', default: null, index: true }
},{ timestamps: true });

module.exports = mongoose.model('Seat', SeatSchema);
