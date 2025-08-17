// src/models/Subscriber.js
const mongoose = require('mongoose');

const SubscriberSchema = new mongoose.Schema({
  // N° d'abonné (attribué après paiement/attestation)
  // ⚠️ pas "unique" au niveau du champ; on gère via un index partiel ci-dessous
  subscriberNo: { type: String },

  firstName: String,
  lastName: String,
  email: { type: String, index: true }, // index simple
  phone: String,

  // Clé de regroupement "commande/famille". Par défaut = email (voir migration/import).
  groupKey: { type: String, index: true, default: null },

  // Appartenance TBH7 (fan club) — distinct de groupKey
  group: { type: String, enum: [null, 'TBH7'], default: null },

  // Places N-1
  previousSeasonSeats: [String],

  status: {
    type: String,
    enum: ['none', 'invited', 'pending', 'active', 'partial', 'canceled'],
    default: 'none'
  }
}, { timestamps: true });

// Index partiel: subscriberNo unique seulement s'il est présent (string)
SubscriberSchema.index(
  { subscriberNo: 1 },
  { unique: true, partialFilterExpression: { subscriberNo: { $exists: true, $type: 'string' } } }
);

// ⚠️ NE PAS redéclarer groupKey ici (ça doublonne)
// SubscriberSchema.index({ groupKey: 1 });

// Index utile pour certaines vues/exports
SubscriberSchema.index({ email: 1, status: 1 });

module.exports = mongoose.model('Subscriber', SubscriberSchema);
