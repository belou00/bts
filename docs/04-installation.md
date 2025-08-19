
## B. `docs/04-installation.md`
Inclure blocs code avec copy :

```markdown
---
title: Installation (DEV/INT/PROD)
nav_order: 5
---

# Installation

## Pré-requis

```bash
Node.js 20.x
MongoDB 6+
Nginx (VPS) + PM2


DEV (local)

1. Cloner et installer :

git clone git@github.com:belou00/bts.git
cd bts
npm ci

2. .env minimal :

MONGO_URI=mongodb://127.0.0.1:27017/bts
JWT_SECRET=dev_secret_long
PORT=8080
APP_URL=http://localhost:8080
SELF_API_BASE=http://127.0.0.1:8080
FRONTEND_ORIGIN=http://localhost:8080
HELLOASSO_STUB=true
HELLOASSO_STUB_RESULT=success

3. Démarrer :

npm run dev

INT (VPS)

# code
cd /var/www/bts-int
git checkout -B int origin/int
npm ci

.env INT (exemple) :

MONGO_URI=mongodb://btsint:<pwd-enc>@127.0.0.1:27017/bts_int?authSource=admin
JWT_SECRET=long_random
PORT=8081
APP_URL=https://billetterie-dev.belougas.fr/bts
SELF_API_BASE=http://127.0.0.1:8081
FRONTEND_ORIGIN=https://billetterie-dev.belougas.fr
HELLOASSO_STUB=false
HELLOASSO_ENV=sandbox
HELLOASSO_CLIENT_ID=...
HELLOASSO_CLIENT_SECRET=...
HELLOASSO_RETURN_URL=https://billetterie-dev.belougas.fr/bts/ha/return
HELLOASSO_WEBHOOK_URL=https://billetterie-dev.belougas.fr/bts/ha/webhook

PM2 :

pm2 start src/server.js --name bts-int --update-env
pm2 save

Tests :

curl -s https://billetterie-dev.belougas.fr/bts/health | jq .




## C. `docs/05-exploitation.md`
Prends la version “complète” qu’on a déjà rédigée et **ajoute** :
- le **mode STUB** (HELLOASSO_STUB/RESULT) dans “Installation DEV”
- une étape “anti double-commande” dans le POST
- le nouvel **import matrix** + **export matrix** (scripts ajoutés)

J’inclus juste l’appendix “paiement STUB” à insérer dans le fichier existant :

```markdown
## Paiement (DEV) – Mode STUB

En DEV, simuler HelloAsso :

```bash
HELLOASSO_STUB=true
HELLOASSO_STUB_RESULT=success   # ou "failure"



Le checkout créé un PaymentIntent, finalise automatiquement (succès/échec) et renvoie une redirectUrl vers /ha/return?status=....

💡 La règle “1 seule commande par groupe (season+venue)” est appliquée : si un Order status=paid existe, l’API renvoie 409 already_renewed.




---

## D. Petits plus “look pro”
- On a activé `enable_copy_code_button: true` → bouton **Copy**.
- Si tu veux un sommaire à droite : ajoute des `##`/`###` structurés.
- Tu peux glisser le logo en `docs/assets/logo.png` (tu l’as déjà dans le repo).

---

### Et maintenant
- Colle les **fichiers complets** ci-dessus (routes + doc).  
- `git add -A && git commit -m "feat: anti-double-renewal + HA STUB; docs polished"`  
- `git push` → PR dev→int→main puis check **https://belou00.github.io/bts**.

Si tu n’as pas encore les modèles `Order` / `PaymentIntent`, dis-moi et je te fournis des versions minimales compatibles.
::contentReference[oaicite:0]{index=0}



