// src/models/Subscriber.js
const mongoose = require('mongoose');
const SubscriberSchema = new mongoose.Schema({
  subscriberNo: { type: String, unique: true }, // attestation
  firstName: String,
  lastName: String,
  email: String,
  phone: String,
  group: { type: String, enum: [null,'TBH7'] },
  previousSeasonSeats: [String], // seatIds saison N-1
  status: { type: String, enum: ['none','invited','pending','active','partial','canceled'], default:'none' }
},{timestamps:true});
module.exports = mongoose.model('Subscriber', SubscriberSchema);
