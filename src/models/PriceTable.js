// src/models/PriceTable.js
import mongoose from 'mongoose';

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

export const PriceTable = mongoose.models.PriceTable || mongoose.model('PriceTable', PriceTableSchema);
