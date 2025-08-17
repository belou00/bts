// src/loaders/mailer.js
const nodemailer = require('nodemailer');

let _transporter = null;

function buildTransporter() {
  // Mets MAIL_ENABLED=false pour couper tous les envois (utile en DEV)
  const enabled = (process.env.MAIL_ENABLED || 'true').toLowerCase() !== 'false';
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!enabled) {
    console.log('[MAIL] Disabled by MAIL_ENABLED=false');
    return null;
  }
  if (!user || !pass) {
    console.warn('[MAIL] Missing GMAIL_USER or GMAIL_APP_PASSWORD; mailer disabled');
    return null;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });

  // Optionnel: vérifie au boot
  transporter.verify().then(() => {
    console.log('[MAIL] SMTP ready as', user);
  }).catch(err => {
    console.warn('[MAIL] SMTP verify failed:', err.message);
  });

  return transporter;
}

function getTransporter() {
  if (!_transporter) _transporter = buildTransporter();
  return _transporter;
}

module.exports = { getTransporter };
