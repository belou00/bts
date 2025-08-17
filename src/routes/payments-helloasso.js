// src/routes/payments-helloasso.js
const express = require('express');
const { celebrate, Joi, Segments } = require('celebrate');
const { getHelloAssoClient } = require('../services/helloasso');
const Order = require('../models/Order');
const SeatHold = require('../models/SeatHold');

const router = express.Router();

const bodySchema = celebrate({
  [Segments.BODY]: Joi.object({
    subscriberId: Joi.string().allow(null, ''),
    seasonCode:   Joi.string().required(),
    totalCents:   Joi.number().integer().min(0).required(),
    itemName:     Joi.string().default('Abonnement'),
    installments: Joi.number().valid(1,2,3).default(1),
    payer:        Joi.object({ email: Joi.string().email().required() }).required()
  })
});

router.post('/api/payments/helloasso/checkout', bodySchema, async (req, res, next) => {
  try {
    const { subscriberId, seasonCode, totalCents, itemName, installments, payer } = req.body;

    // 1) Crée l'Order (statut pending)
    const order = await Order.create({
      seasonCode,
      payer,
      totalCents,
      installments,
      status: 'pending',
      // lines doivent être déjà posées avant (via /s/renew POST) — sinon ajoute-les ici
    });

    // 2) HelloAsso client
    const ha = await getHelloAssoClient(); // gère sandbox/prod + token

    // 3) Compose les URLs de retour en y ajoutant notre contexte
    const baseReturn = ha.returnUrl; // tiré de conf selon env
    const baseBack   = ha.backUrl;
    const baseError  = ha.errorUrl;

    const ret = new URL(baseReturn);
    ret.searchParams.set('oid', String(order._id));

    const back = new URL(baseBack);
    back.searchParams.set('oid', String(order._id));

    const err = new URL(baseError);
    err.searchParams.set('oid', String(order._id));

    // 4) Crée le checkout intent côté HelloAsso
    const init = await ha.createCheckoutIntent({
      payer,
      itemName,
      initialAmount: totalCents,                        // en centimes selon ton client; adapte si c'est des euros
      installmentsCount: installments,
      returnUrl: ret.toString(),
      backUrl:   back.toString(),
      errorUrl:  err.toString()
    });

    if (!init || !init.redirectUrl || !init.checkoutIntentId) {
      return res.status(502).json({ error: 'HelloAsso init failed' });
    }

    // 5) Sauvegarde l'ID HelloAsso sur l'Order
    order.checkoutIntentId = init.checkoutIntentId;
    await order.save();

    // 6) Ajoute ci=... aux URLs maintenant que l’ID est connu
    const ret2 = new URL(ret.toString());
    ret2.searchParams.set('ci', String(init.checkoutIntentId));
    const back2 = new URL(back.toString());
    back2.searchParams.set('ci', String(init.checkoutIntentId));
    const err2  = new URL(err.toString());
    err2.searchParams.set('ci', String(init.checkoutIntentId));

    // (selon l’API HelloAsso, tu peux ou non modifier après coup; sinon suffira qu’on lise `ci` depuis la réponse init & qu’on stocke un cookie)
    // On place aussi un cookie httpOnly sécurité (fallback)
    res.cookie('bts_oid', String(order._id), { httpOnly: true, sameSite: 'Lax', maxAge: 7*24*3600*1000 });

    return res.json({
      redirectUrl: init.redirectUrl,
      checkoutIntentId: init.checkoutIntentId,
      orderId: String(order._id),
      // info
      returnUrl: ret2.toString(),
      backUrl:   back2.toString(),
      errorUrl:  err2.toString()
    });
  } catch (e) { next(e); }
});

module.exports = router;
