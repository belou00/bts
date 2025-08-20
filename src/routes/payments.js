
import express from 'express';
import { celebrate, Joi, Segments } from 'celebrate';

import PaymentIntent from '../models/PaymentIntent.js';
import { initCheckoutIntent } from '../services/helloasso.js';
import { splitInstallmentAmounts } from '../utils/money.js';
import { getHelloAssoConfig } from '../config/helloasso.js';

const router = express.Router();

function addMonthsISO(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0,10);
}

router.post(
  '/helloasso/checkout',
  celebrate({
    [Segments.BODY]: Joi.object({
      orderNo: Joi.string().allow('', null),          // <-- nouveau
      subscriberId: Joi.string().allow('', null),
      seasonCode: Joi.string().required(),
      totalCents: Joi.number().integer().min(100).required(),
      itemName: Joi.string().default('Abonnement'),
      installments: Joi.number().valid(1,2,3).default(1),
      payer: Joi.object({
        firstName: Joi.string().allow('', null),
        lastName: Joi.string().allow('', null),
        email: Joi.string().email().allow('', null),
        dateOfBirth: Joi.string().allow('', null),
        address: Joi.string().allow('', null),
        city: Joi.string().allow('', null),
        zipCode: Joi.string().allow('', null),
        country: Joi.string().allow('', null),
      }).default({})
    })
  }),
  async (req, res, next) => {
    try {
      const cfg = getHelloAssoConfig();
      if (!cfg.returnUrl || !cfg.errorUrl || !cfg.backUrl) {
        const miss = ['returnUrl','errorUrl','backUrl'].filter(k => !cfg[k]).join(', ');
        throw new Error(`[BTS] URLs HelloAsso manquantes (${miss}) pour l'environnement ${cfg.env}`);
      }

      const { orderNo, subscriberId, seasonCode, totalCents, itemName, installments, payer } = req.body;

      const amounts = splitInstallmentAmounts(totalCents, installments);
      const terms = amounts.slice(1).map((amt, i) => ({ amount: amt, date: addMonthsISO(new Date(), i + 1) }));

      const haPayload = {
        totalAmount: totalCents,
        initialAmount: amounts[0],
        itemName: `${itemName} ${seasonCode}`,
        backUrl: cfg.backUrl,
        errorUrl: cfg.errorUrl,
        returnUrl: cfg.returnUrl,
        containsDonation: false,
        ...(terms.length ? { terms } : {}),
        payer: {
          firstName: payer.firstName || undefined,
          lastName: payer.lastName || undefined,
          email: payer.email || undefined,
          dateOfBirth: payer.dateOfBirth || undefined,
          address: payer.address || undefined,
          city: payer.city || undefined,
          zipCode: payer.zipCode || undefined,
          country: payer.country || undefined,
        },
        metadata: { source: 'BTS', seasonCode, subscriberId, orderNo }  // <-- orderNo ici
      };

      const { id: checkoutIntentId, redirectUrl } = await initCheckoutIntent(haPayload);

      await PaymentIntent.create({
        subscriberId, seasonCode, checkoutIntentId,
        totalAmount: totalCents,
        installments: terms,
        metadata: haPayload.metadata
      });

      res.json({ redirectUrl, checkoutIntentId });
    } catch (e) { next(e); }
  }
);

module.exports = router;
