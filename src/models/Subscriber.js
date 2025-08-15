const mongoose = require('mongoose');

const SubscriberSchema = new mongoose.Schema({
  // ATTENTION: plus de unique: true ici
  subscriberNo: { type: String }, // généré après paiement / attestation
  firstName: String,
  lastName: String,
  email: String,
  phone: String,
  group: { type: String, enum: [null,'TBH7'], default: null },
  previousSeasonSeats: [String],
  status: { type: String, enum: ['none','invited','pending','active','partial','canceled'], default:'none' }
},{timestamps:true});

// Index partiel: unique seulement si subscriberNo existe et est une string
SubscriberSchema.index(
  { subscriberNo: 1 },
  { unique: true, partialFilterExpression: { subscriberNo: { $exists: true, $type: 'string' } } }
);

module.exports = mongoose.model('Subscriber', SubscriberSchema);
