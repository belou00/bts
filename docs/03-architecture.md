---
title: Architecture & arborescence
nav_order: 4
---

# Architecture

BTS est une app **Node.js + Express** avec **MongoDB**.  
Le plan des lieux est un **SVG** (servi en statique et parsé côté scripts).

## Vue d’ensemble

Client (HTML5/CSS) → Express → MongoDB
│ ├── Routes renew / admin / payments
│ ├── Static: /html, /static, /venues/<slug>/plan.svg
└── HelloAsso (sandbox/prod) via Checkout API (STUB en DEV)


## Arborescence (rôles clés)

```text
src/
  loaders/
    express.js      # construit l’app (helmet, CORS, static, routes)
    mongo.js        # connexion MONGO_URI
  models/
    Seat.js         # sièges instanciés par saison/lieu
    Subscriber.js   # abonnés, groupKey, prefSeatId
    Season.js       # phases (renewal/tbh7/public)
    Tariff.js       # catalogue tarifs
    TariffPrice.js  # prix par zone/saison/lieu
    Order.js        # commandes (paid/failed)
    PaymentIntent.js# intents checkout
  routes/
    index.js        # router principal
    renew.js        # GET/POST renouvellement
    admin.js        # endpoints d’admin légers
    payments/
      helloasso.js  # intégration HelloAsso + STUB en DEV
  public/
    html/
      renew.html    # page de renouvellement
      ha-return.html# retour paiement (STUB)
    static/
      styles/
        renew.css   # styles
    venues/
      <slug>/
        plan.svg    # plan
scripts/
  venues/ …         # register/import/instantiate seats
  tariffs/ …        # import/export catalogue
  pricing/ …        # import/export prix zone
  renewal/ …        # provision seats
  admin/ …          # reset-db, upsert-season
  export-renew-groups.js
  import-subscribers-flat.js

