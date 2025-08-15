const router = require('express').Router();
const Order = require('../models/Order');
const { verifyWebhookSignature } = require('../payments/helloasso');

router.post('/helloasso', async (req,res,next)=>{
  try {
    if (!verifyWebhookSignature(req)) return res.status(401).end();
    const { orderNo, installmentIndex = 0, event } = req.body;
    const order = await Order.findOne({ orderNo });
    if (!order) return res.status(404).end();
    const inst = order.installments.schedule[installmentIndex];
    if (!inst) return res.status(400).end();
    if (event==='payment.succeeded') inst.status='paid';
    if (event==='payment.failed') inst.status='failed';
    const states = order.installments.schedule.map(i=>i.status);
    if (states.every(s=>s==='paid')) order.status='paid';
    else if (states.some(s=>s==='paid')) order.status='partial';
    else order.status='pendingPayment';
    await order.save();
    res.json({ ok: true });
  } catch(e) { next(e); }
});

module.exports = router;
