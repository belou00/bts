// src/models/Seat.js
const mongoose = require('mongoose');
const SeatSchema = new mongoose.Schema({
  seatId: { type: String, unique: true }, // identifiant unique du SVG
  zoneKey: String,
  seasonCode: String,
  status: { type: String, enum: ['available','blocked','held','reserved','sold'], default:'available' },
  blockerReason: String,
  currentOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
}, { timestamps:true });

SeatSchema.index({ zoneKey:1, seasonCode:1 });
module.exports = mongoose.model('Seat', SeatSchema);
