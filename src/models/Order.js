// src/models/Order.js
const mongoose = require('mongoose');

const OrderItemSchema = new mongoose.Schema({
  kind: { type: String, enum: ['SEAT','STANDING'] },
  seatId: String,             // si kind=SEAT
  zoneKey: String,            // si kind=STANDING
  quantity: { type: Number, default: 1 },
  tariffCode: String,
  unitPriceCents: Number,
  justification: String
},{_id:false});

const InstallmentSchema = new mongoose.Schema({
  dueDate: Date,
  amountCents: Number,
  status: { type: String, enum: ['pending','paid','failed','canceled'], default: 'pending' },
  helloAssoRef: String
},{_id:false});

const OrderSchema = new mongoose.Schema({
  orderNo: { type: String, unique: true },
  seasonCode: String,
  phase: { type: String, enum: ['renewal','tbh7','public'] },
  buyer: {
    firstName: String, lastName: String, email: String, phone: String
  },
  items: [OrderItemSchema],
  totals: {
    subtotalCents: Number, discountCents: Number, totalCents: Number
  },
  installments: {
    count: { type: Number, enum: [1,2,3], default: 1 },
    schedule: [InstallmentSchema]
  },
  status: { type: String, enum: ['draft','pendingPayment','partial','paid','canceled'], default:'draft' },
  helloAsso: {
    checkoutSessionId: String
  }
},{timestamps:true});

OrderSchema.index({ seasonCode:1, phase:1 });
module.exports = mongoose.model('Order', OrderSchema);
