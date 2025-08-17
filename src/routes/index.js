// src/routes/index.js
const express = require('express');
const router = express.Router();

const safeMount = (subpath) => {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const r = require(subpath);
    router.use(r);
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') {
      console.warn(`[routes] Impossible de monter ${subpath}:`, e.message);
    }
  }
};

safeMount('./renew');
safeMount('./admin');
safeMount('./admin-tariffs');         // prix par zone
safeMount('./admin-tariff-catalog');  // <=== catalogue des tarifs
safeMount('./payments');
safeMount('./public');
safeMount('./admin-email');
safeMount('./payments-helloasso'); // ← checkout
safeMount('./ha');                 // ← return/back/error

module.exports = router;
