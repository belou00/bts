// src/models/Season.js
const mongoose = require('mongoose');

const PhaseSchema = new mongoose.Schema({
  name: { type: String, enum: ['renewal','tbh7','public'], required: true },
  openAt: Date,
  closeAt: Date,
  enabled: { type: Boolean, default: true }
}, { _id: false });

const SeasonSchema = new mongoose.Schema({
  code: { type: String, unique: true }, // ex: 2025-2026
  name: String,
  active: { type: Boolean, default: true },
  // 🔴 Nouveau : associe la saison à un lieu (plan SVG, zones, tarifs)
  venueSlug: { type: String, default: null }, // ex: "patinoire-blagnac"
  phases: [PhaseSchema]
}, { timestamps: true });

module.exports = mongoose.model('Season', SeasonSchema);
