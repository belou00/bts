// src/utils/mail.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }
});

async function sendRenewalEmail({ to, token, seasonCode }) {
  const url = `${process.env.APP_URL}/s/renew?id=${encodeURIComponent(token)}`;
  const html = `<p>Bonjour,</p><p>Renouvelez votre abonnement ${seasonCode} :</p><p><a href="${url}">${url}</a></p>`;
  await transporter.sendMail({ from: process.env.GMAIL_USER, to, subject:'Renouvellement abonnement', html });
}

async function sendTBH7Email({ to, campaignCode }) {
  const url = `${process.env.APP_URL}/s/tbh7?id=${encodeURIComponent(campaignCode)}`;
  await transporter.sendMail({ from: process.env.GMAIL_USER, to, subject:'TBH7 — Abonnements', html:`<p>Formulaire TBH7 :</p><a href="${url}">${url}</a>` });
}

module.exports = { sendRenewalEmail, sendTBH7Email };
