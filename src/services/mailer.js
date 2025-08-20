// src/services/mailer.js
import { getTransporter } from '../loaders/mailer.js';

function fromAddress() {
  const addr = process.env.FROM_EMAIL || process.env.GMAIL_USER;
  const name = process.env.FROM_NAME || 'TBHC Billetterie';
  // NB: pour GMail, FROM doit correspondre à l’adresse SMTP ou à un alias "Send mail as"
  return `"${name}" <${addr}>`;
}

async function sendMail({ to, subject, html, text }) {
  const t = getTransporter();
  if (!t) {
    console.warn('[MAIL] Transporter not configured; skip send to', to);
    return { skipped: true };
  }
  const info = await t.sendMail({
    from: fromAddress(),
    to,
    subject,
    text: text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    html
  });
  return { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected };
}

function renderRenewInvite({ seasonCode, venueSlug, link, seats = [], baseUrl, clubName = 'TBHC' }) {
  const appUrl = process.env.APP_URL || baseUrl || '';
  const basePath = appUrl.replace(/https?:\/\/[^/]+/, ''); // ex: '/bts' en INT/PROD
  const logoUrl = `${basePath || ''}/static/img/logo.png`;
  const seatList = seats.length ? `<p>Sièges concernés :</p><ul>${seats.map(s => `<li>${s}</li>`).join('')}</ul>` : '';

  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.45">
    <div style="display:flex;align-items:center;gap:10px">
      <img src="${logoUrl}" alt="${clubName}" style="height:40px"/>
      <h2 style="margin:0">Renouvellement d’abonnement ${seasonCode || ''}</h2>
    </div>
    <p>Bonjour,</p>
    <p>Vous pouvez renouveler votre abonnement${venueSlug ? ' pour <b>' + venueSlug + '</b>' : ''} via le bouton ci-dessous :</p>
    <p style="margin:24px 0">
      <a href="${link}" style="background:#0ea5b6;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block">
        Renouveler maintenant
      </a>
    </p>
    ${seatList}
    <p>En cas de difficulté, contactez <a href="mailto:billetterie@tbhc.fr">billetterie@tbhc.fr</a>.</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"/>
    <p style="color:#64748b;font-size:12px">Cet e-mail a été envoyé automatiquement. Ne répondez pas à ce message.</p>
  </div>`;
}

module.exports = { sendMail, renderRenewInvite };
