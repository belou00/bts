// src/models/Season.js
const mongoose = require('mongoose');

const PhaseSchema = new mongoose.Schema({
  name: { type: String, enum: ['renewal', 'tbh7', 'public'], required: true },
  openAt: Date,
  closeAt: Date,
  enabled: { type: Boolean, default: true }
}, { _id: false });

const SeasonSchema = new mongoose.Schema({
  code: { type: String, unique: true, required: true },     // ex: "2025-2026"
  name: { type: String, default: '' },
  active: { type: Boolean, default: true },

  // 🔗 Nouveau : rattachement au lieu (venue) dont on chargera le plan SVG
  venueSlug: { type: String, index: true, default: null },   // ex: "patinoire-bdl"

  // (optionnel mais pratique) : permet de pointer une table de prix spécifique
  // pour cette saison (et/ou ce lieu) si tu en maintiens plusieurs grilles.
  priceTableKey: { type: String, default: null },

  phases: { type: [PhaseSchema], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('Season', SeasonSchema);

