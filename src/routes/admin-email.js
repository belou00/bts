// src/routes/admin-email.js
require('dotenv').config();

const express = require('express');
const { celebrate, Joi, Segments } = require('celebrate');
const { requireAdmin } = require('../middlewares/authz');
const { sendMail } = require('../services/mailer');

const router = express.Router();

router.get(
  '/api/admin/email/test',
  requireAdmin,
  celebrate({ [Segments.QUERY]: Joi.object({ to: Joi.string().email().required() }) }),
  async (req, res, next) => {
    try {
      const to = req.query.to;
      const env = process.env.APP_ENV || 'development';
      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif">
          <h3>Test e-mail BTS</h3>
          <p>Environnement: <b>${env}</b></p>
          <p>Heure serveur: ${new Date().toISOString()}</p>
        </div>`;
      const r = await sendMail({ to, subject: `BTS · Test e-mail (${env})`, html });
      res.json({ ok: true, result: r });
    } catch (e) { next(e); }
  }
);

module.exports = router;
