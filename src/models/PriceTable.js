// src/models/PriceTable.js
const mongoose = require('mongoose');
const PriceSchema = new mongoose.Schema({
  code: { type: String, enum: ['ADULT','CHILD','TEEN_12_18','STUDENT','SENIOR','OTHER_REDUCED'] },
  label: String,
  amountCents: Number,
  requiresJustification: { type: Boolean, default: false }
},{_id:false});

const PriceTableSchema = new mongoose.Schema({
  seasonCode: String,
  zoneKey: String,               // prix spécifiques par zone
  prices: [PriceSchema]
}, { timestamps:true });

module.exports = mongoose.model('PriceTable', PriceTableSchema);
