const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  subscriberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscriber' },
  seasonCode: { type: String, index: true },
  checkoutIntentId: { type: Number, index: true },
  status: { type: String, enum: ['created', 'succeeded', 'failed', 'pending'], default: 'created' },
  orderId: { type: Number },
  totalAmount: { type: Number, required: true }, // centimes
  installments: [{ amount: Number, date: String }],
  metadata: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

module.exports = mongoose.model('PaymentIntent', schema);
