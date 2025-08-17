// scripts/docs/build-docs.js
// Génère les docs HTML Phase 1 dans le dossier /docs, prêtes pour GitHub Pages.
// Usage: node scripts/docs/build-docs.js

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.resolve(process.cwd(), 'docs');
fs.mkdirSync(OUT_DIR, { recursive: true });

const today = new Date().toISOString().slice(0, 10);

// CSS commun (sobre, lisible sur GitHub Pages)
const BASE_CSS = `
:root{
  --bg:#0f172a; --panel:#111827; --text:#e5e7eb; --muted:#94a3b8; --border:#1f2937;
  --accent:#22d3ee; --ok:#34d399; --warn:#fbbf24; --danger:#f87171;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#0b1020;color:var(--text);font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
a{color:var(--accent);text-decoration:none}
.container{max-width:1100px;margin:0 auto;padding:24px}
header{position:sticky;top:0;background:rgba(17,24,39,.9);border-bottom:1px solid var(--border);backdrop-filter:saturate(140%) blur(6px);}
header .inner{max-width:1100px;margin:0 auto;display:flex;align-items:center;gap:14px;padding:12px 24px}
header img{height:38px}
h1{font-size:28px;margin:18px 0 8px}
h2{font-size:22px;margin:20px 0 8px}
h3{font-size:18px;margin:18px 0 6px}
p{margin:8px 0}
ul{margin:6px 0 12px 22px}
code,kbd,pre{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,"Courier New",monospace}
pre{background:#0b1020;border:1px solid var(--border);border-radius:8px;padding:12px;overflow:auto}
table{width:100%;border-collapse:collapse;margin:10px 0 16px}
th,td{border:1px solid var(--border);padding:8px;vertical-align:top}
.small{color:var(--muted);font-size:12px}
.card{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:18px;margin:16px 0}
footer{border-top:1px solid var(--border);margin-top:24px;padding:16px 24px;color:var(--muted)}
.toc{background:#0b1020;border:1px solid var(--border);border-radius:12px;padding:12px}
hr{border:none;border-top:1px solid var(--border);margin:16px 0}
`;

// Helpers
const head = (title) => `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>${BASE_CSS}</style>
</head>
<body>
<header><div class="inner">
  <img src="logo.png" alt="Belougas" />
  <div>
    <div class="small">BelougasTicketingSystem · Phase 1 · ${today}</div>
    <strong>${title}</strong>
  </div>
</div></header>
<main class="container">
`;

const foot = `</main>
<footer>
  <div>Licence MIT · © TBHC / Belougas</div>
</footer>
</body></html>`;

function writeHtml(filename, title, body) {
  fs.writeFileSync(path.join(OUT_DIR, filename), head(title) + body + foot, 'utf8');
  console.log('✓', filename);
}

// --------- Contenus des docs (HTML) ---------

const body1 = `
<div class="card">
  <h1>Cahier des charges – Phase 1 (Renew)</h1>
  <p><strong>Projet</strong> : BelougasTicketingSystem (BTS) – Club de hockey Belougas<br/>
     <strong>Date</strong> : ${today}<br/>
     <strong>Licence</strong> : MIT</p>
</div>

<h2>1. Contexte &amp; objectifs</h2>
<ul>
  <li>Billetterie auto-hébergée (OVH VPS), open source, Node.js/Express + MongoDB.</li>
  <li>Intégration paiement via HelloAsso CheckOut (sandbox en INT, production en PROD).</li>
  <li>Phase 1 centrée sur les <strong>renouvellements</strong> d’abonnements existants (sans QR-code).</li>
  <li>Front léger (HTML/CSS/JS statiques), intégrable dans WordPress via iframe.</li>
</ul>

<h2>2. Périmètre fonctionnel Phase 1</h2>
<h3>2.1 Renouvellements (scénario 1)</h3>
<ul>
  <li>Lien personnalisé (token) envoyé aux abonnés N-1.</li>
  <li>Affichage plan SVG (venue) avec surbrillance des sièges à renouveler.</li>
  <li>Choix du tarif par siège, justificatifs, paiement 1/2/3 fois.</li>
  <li>Attestation e-mail après paiement validé (pas de QR-code en Phase 1).</li>
</ul>
<h3>2.2 Provision & synchronisation</h3>
<ul>
  <li>Sièges N-1 marqués <em>provisioned</em> (non réservable public), visibles sur le plan.</li>
  <li>À clôture administrateur, sièges non renouvelés → <em>available</em> (phase publique).</li>
</ul>
<h3>2.3 Administration (extraits)</h3>
<ul>
  <li>Import/export abonnés (CSV <em>flat</em> 1 ligne = 1 siège), catalogue tarifs, prix par zone.</li>
  <li>Gestion des saisons (code, venueSlug, phases).</li>
  <li>E-mails : test SMTP, invitations renew (bulk), attestation post-paiement.</li>
</ul>

<h2>3. Contraintes &amp; exigences</h2>
<ul>
  <li>Node ≥ 20, Mongo ≥ 6, Nginx, PM2, Ubuntu 22.04.</li>
  <li>Sécurité : ENV séparés DEV/INT/PROD, auth Mongo, .env, HTTPS, CORS, rate-limit.</li>
  <li>Interop : HelloAsso sandbox/prod, e-mail Gmail (mot de passe application).</li>
  <li>UX : responsive, tarifs dynamiques (prix & justificatifs).</li>
  <li>Perf : CSV, indexes, TTL sur réservations (<code>SeatHold</code>).</li>
</ul>

<h2>4. Hors périmètre</h2>
<ul>
  <li>Vente publique complète, TBH7 si non finalisé, QR-code par match, multi-événements avancés, reporting BI.</li>
</ul>

<h2>5. KPI</h2>
<ul>
  <li>Taux de renouvellement, paiements confirmés, erreurs paiement, délivrabilité e-mail.</li>
</ul>

<h2>6. Dépôt</h2>
<p>Dépôt GitHub public <code>belou00/bts</code> – branches : <code>main</code> (PROD), <code>int</code> (INT).</p>
`;

const body2 = `
<div class="card"><h1>Gestion de projet – Approche agile</h1></div>
<h2>1. Organisation</h2>
<ul>
  <li>Backlog GitHub (Issues/Projects), épique « Phase 1 – Renew ».</li>
  <li>Itérations courtes (1–2 jours), démonstrations en INT.</li>
  <li>DoD : code linté/testé, scriptable (import/export), doc à jour, test fumée INT OK.</li>
</ul>
<h2>2. Environnements</h2>
<ul>
  <li><strong>DEV local</strong> : Node/Express sur <code>localhost:8080</code>, Mongo locale, HelloAsso stub possible.</li>
  <li><strong>INT</strong> : VPS OVH, <code>billetterie-dev.belougas.fr</code>, HTTPS, Mongo <code>bts_int</code>, HA sandbox, PM2 <code>bts-int</code>.</li>
  <li><strong>PROD</strong> : VPS OVH, <code>billetterie.belougas.fr</code>, HTTPS, Mongo <code>bts_prod</code>, HA prod, PM2 <code>bts-prod</code>.</li>
</ul>
<h2>3. Versionning & déploiement</h2>
<ul>
  <li>PR <code>int → main</code> pour promotion; tags <code>vX.Y.Z-rcN</code> (INT) et <code>vX.Y.Z</code> (PROD).</li>
  <li>INT : <code>git reset --hard origin/int && npm ci && pm2 restart bts-int</code></li>
  <li>PROD : <code>git reset --hard origin/main && npm ci && pm2 restart bts-prod</code></li>
</ul>
<h2>4. Qualité & tests</h2>
<ul>
  <li>Tests manuels guidés, scripts CSV, /health, paiements sandbox, attestation e-mail.</li>
  <li>Audit CSV : cohérence sièges/renouvellements/prix.</li>
</ul>
<h2>5. Communication & validation</h2>
<ul>
  <li>Échanges courts, journal incidents/solutions, checklists INT avant promotion.</li>
</ul>
`;

const body3 = `
<div class="card"><h1>Architecture générale</h1></div>
<h2>1. Vue d’ensemble</h2>
<ul>
  <li>API Node.js/Express (routes REST + front statique).</li>
  <li>MongoDB : <code>Subscriber</code>, <code>Seat</code>, <code>SeatHold</code>, <code>Season</code>, <code>Tariff</code>, <code>TariffPrice</code>, <code>Counter</code>, <code>Order</code>.</li>
  <li>Paiement HelloAsso; attestation e-mail après retour.</li>
  <li>Front statique (HTML/CSS/JS) avec plan SVG par venue; préfixe <code>/bts</code> en INT/PROD.</li>
  <li>Infra : Nginx (TLS), PM2 (bts-int, bts-prod).</li>
</ul>

<h2>2. Modèles clés</h2>
<table>
<tr><th>Modèle</th><th>Champs principaux</th></tr>
<tr><td>Season</td><td>code, name, active, <strong>venueSlug</strong>, phases[{name,openAt,closeAt,enabled}]</td></tr>
<tr><td>Seat</td><td>seatId, zoneKey, seasonCode, venueSlug, status, provisionedFor</td></tr>
<tr><td>SeatHold</td><td>seatId, orderId, expiresAt (TTL index)</td></tr>
<tr><td>Subscriber</td><td>subscriberNo?, firstName, lastName, email, phone, group, groupKey, previousSeasonSeats, status</td></tr>
<tr><td>Tariff</td><td>code, label, active, requiresField, fieldLabel, requiresInfo, sortOrder</td></tr>
<tr><td>TariffPrice</td><td>seasonCode, venueSlug, zoneKey, tariffCode, priceCents</td></tr>
<tr><td>Counter</td><td>key, seq (numérotation abonné)</td></tr>
<tr><td>Order</td><td>seasonCode, payer, totalCents, installments, status, checkoutIntentId, haPaymentRef?, lines[{seatId,zoneKey,tariffCode,priceCents,subscriberId}]</td></tr>
</table>

<h2>3. Routes principales</h2>
<ul>
  <li><strong>Renew</strong> : <code>GET /s/renew?id=TOKEN</code>, <code>POST /s/renew?id=TOKEN</code></li>
  <li><strong>HelloAsso</strong> : <code>POST /api/payments/helloasso/checkout</code>, <code>GET /ha/return|back|error</code></li>
  <li><strong>Admin</strong> : tarifs & prix (catalogue, zone), email test</li>
</ul>

<h2>4. Scripts CLI</h2>
<ul>
  <li>Import abonnés (flat), provision seats, export liens renew, import catalogues/prix, email d’invitations.</li>
</ul>

<h2>5. Sécurité</h2>
<ul>
  <li>Secrets .env, CORS, rate-limit, HTTPS, Mongo auth (bind 127.0.0.1), TTL SeatHold, logs PM2, /health.</li>
</ul>
`;

const body4 = `
<div class="card"><h1>Guide d’installation</h1></div>

<h2>1. Pré-requis</h2>
<ul>
  <li>Ubuntu 22.04, Node ≥ 20, npm ≥ 10, MongoDB, Nginx, Certbot.</li>
  <li>DNS : <code>billetterie-dev.belougas.fr</code> (INT) et <code>billetterie.belougas.fr</code> (PROD) vers l’IP VPS.</li>
</ul>

<h2>2. Dépôts & arborescence</h2>
<pre><code>sudo mkdir -p /var/www/bts-int /var/www/bts-prod /var/log/pm2
sudo chown -R $USER:$USER /var/www

git clone git@github.com:belou00/bts.git /var/www/bts-int
cd /var/www/bts-int &amp;&amp; git checkout int &amp;&amp; npm ci

git clone git@github.com:belou00/bts.git /var/www/bts-prod
cd /var/www/bts-prod &amp;&amp; git checkout main &amp;&amp; npm ci
</code></pre>

<h2>3. MongoDB (auth + utilisateurs)</h2>
<pre><code># /etc/mongod.conf
security:
  authorization: enabled
net:
  bindIp: 127.0.0.1
</code></pre>
<pre><code>// INT
use bts_int
db.createUser({ user:"bts_int", pwd:"***", roles:[{role:"readWrite",db:"bts_int"}] })
// PROD
use bts_prod
db.createUser({ user:"bts_prod", pwd:"***", roles:[{role:"readWrite",db:"bts_prod"}] })
</code></pre>

<h2>4. Variables d’environnement</h2>
<p><code>/.env.int</code> (extrait) :</p>
<pre><code>APP_ENV=integration
PORT=8081
MONGO_URI_INT=mongodb://bts_int:&lt;PASS&gt;@127.0.0.1:27017/bts_int?authSource=bts_int
JWT_SECRET=***INT***
HELLOASSO_ENV=sandbox
HELLOASSO_ORG_SLUG=...
HELLOASSO_CLIENT_ID_SANDBOX=...
HELLOASSO_CLIENT_SECRET_SANDBOX=...
HELLOASSO_RETURN_URL_SANDBOX=https://billetterie-dev.belougas.fr/bts/ha/return
HELLOASSO_ERROR_URL_SANDBOX=https://billetterie-dev.belougas.fr/bts/ha/error
HELLOASSO_BACK_URL_SANDBOX=https://billetterie-dev.belougas.fr/bts/ha/back
APP_URL=https://billetterie-dev.belougas.fr/bts
SELF_API_BASE=http://127.0.0.1:8081
FRONTEND_ORIGIN=https://billetterie-dev.belougas.fr
GMAIL_USER=...
GMAIL_APP_PASSWORD=...
FROM_EMAIL=billetterie@tbhc.fr
</code></pre>

<h2>5. PM2</h2>
<pre><code>pm2 start /var/www/ecosystem.config.js --only bts-int
pm2 start /var/www/ecosystem.config.js --only bts-prod
pm2 status
</code></pre>

<h2>6. Nginx &amp; TLS</h2>
<ul>
  <li>Vhosts : INT → 127.0.0.1:8081, PROD → 127.0.0.1:8080.</li>
  <li>Certbot HTTP-01 ; attention aux redirections parasites.</li>
</ul>

<h2>7. Données &amp; tests</h2>
<ul>
  <li>Import catalogues, prix, abonnés (flat), provision seats, export liens, test e-mail.</li>
  <li>Parcours checkout sandbox → retour → attestation e-mail.</li>
</ul>

<h2>8. Dépannage rapide</h2>
<ul>
  <li>Plan indisponible : vérifier <code>Season.venueSlug</code> et <code>/venues/&lt;slug&gt;/plan.svg</code>.</li>
  <li>404 CSS/plan INT : basePath <code>/bts</code> bien géré.</li>
  <li>Mongo URI manquante, HA 401 (client/secret/env), PM2 “Process not found” (start avant restart).</li>
</ul>
`;

const body5 = `
<div class="card"><h1>Guide d’exploitation</h1></div>

<h2>1. Opérations courantes</h2>
<ul>
  <li>Status/logs : <code>pm2 status</code>, <code>pm2 logs bts-int|bts-prod</code></li>
  <li>Santé : <code>GET /bts/health</code></li>
  <li>Déploiement : INT → <code>reset origin/int</code> ; PROD → <code>reset origin/main</code> + <code>npm ci</code> + <code>pm2 restart</code></li>
  <li>Backups Mongo : <code>mongodump --db bts_prod</code></li>
</ul>

<h2>2. Nouvelle saison</h2>
<ol>
  <li>Créer la <strong>saison</strong> (code, venueSlug, phases).</li>
  <li>Importer <strong>catalogue</strong> de tarifs.</li>
  <li>Importer <strong>prix par zone</strong>.</li>
  <li>Importer <strong>subscribers_flat</strong> (1 ligne = 1 siège).</li>
  <li><strong>Provisionner</strong> sièges N-1.</li>
  <li>Exporter <strong>liens renew</strong> (groupes) et envoyer invitations.</li>
</ol>

<h2>3. Imports/Exports</h2>
<ul>
  <li><strong>Catalogues</strong> : <code>code,label,active,requiresField,fieldLabel,requiresInfo,sortOrder</code></li>
  <li><strong>Prix</strong> : <code>zoneKey,tariffCode,priceCents</code></li>
  <li><strong>Subscribers flat</strong> : <code>groupKey,email,firstName,lastName,phone,seasonCode,venueSlug,seatId,zoneKey</code></li>
  <li><strong>Renew links</strong> : <code>groupKey,email,link,seats</code></li>
</ul>

<h2>4. Phases &amp; provisioning</h2>
<ul>
  <li>Pendant renew : sièges en <em>provisioned</em>.</li>
  <li>Clôture : libération des non-renouvelés → <em>available</em>.</li>
</ul>

<h2>5. E-mails</h2>
<ul>
  <li>Test SMTP : <code>/api/admin/email/test?to=...</code></li>
  <li>Invitations renew (CSV) : script CLI d’envoi en masse.</li>
  <li>Attestation : envoi automatique au retour HelloAsso payé.</li>
</ul>

<h2>6. Supervision &amp; sécurité</h2>
<ul>
  <li>Logs PM2, grep erreurs HA/e-mail.</li>
  <li>syncIndexes après migrations.</li>
  <li>Rotation des secrets, .env permissions.</li>
  <li>Mongo auth/bind 127.0.0.1.</li>
</ul>

<h2>7. Incident &amp; rollback</h2>
<ul>
  <li>HelloAsso indispo : stub en DEV/INT, mise en attente.</li>
  <li>Rollback : reset sur tag stable + restart.</li>
  <li>Données : restauration depuis dumps.</li>
</ul>
`;

// Écrit les pages
writeHtml('01-cahier-des-charges.html', 'BTS – Cahier des charges (Phase 1)', body1);
writeHtml('02-gestion-de-projet.html', 'BTS – Gestion de projet (Phase 1)', body2);
writeHtml('03-architecture.html', 'BTS – Architecture (Phase 1)', body3);
writeHtml('04-installation.html', 'BTS – Guide d’installation (Phase 1)', body4);
writeHtml('05-exploitation.html', 'BTS – Guide d’exploitation (Phase 1)', body5);

// Index
const index = `
<div class="card">
  <h1>BelougasTicketingSystem – Documentation Phase 1</h1>
  <p>Accédez aux documents :</p>
  <ul>
    <li><a href="01-cahier-des-charges.html">01 – Cahier des charges</a></li>
    <li><a href="02-gestion-de-projet.html">02 – Gestion de projet</a></li>
    <li><a href="03-architecture.html">03 – Architecture</a></li>
    <li><a href="04-installation.html">04 – Installation</a></li>
    <li><a href="05-exploitation.html">05 – Exploitation</a></li>
  </ul>
  <p class="small">Généré automatiquement.</p>
</div>
`;
writeHtml('index.html', 'BTS – Documentation Phase 1', index);

// Logo : copie si présent, sinon placeholder
const srcLogo = path.resolve(process.cwd(), 'src/public/static/img/logo.png');
const outLogo = path.join(OUT_DIR, 'logo.png');
if (fs.existsSync(srcLogo)) {
  fs.copyFileSync(srcLogo, outLogo);
} else {
  // 1x1 transparent PNG
  const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";
  fs.writeFileSync(outLogo, Buffer.from(b64, 'base64'));
}

console.log(`\nDocs générées dans: ${OUT_DIR}`);
