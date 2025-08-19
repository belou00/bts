// src/routes/index.js
const express = require('express');
const path = require('path');
const renew = require('./renew');
const admin = require('./admin');

const router = express.Router();

// Health
router.get('/health', (_req, res) => res.json({ ok: true }));

// HelloAsso return (utile en STUB)
router.get('/ha/return', (_req, res) => {
  res.sendFile('ha-return.html', { root: path.join(__dirname, '..', 'public', 'html') });
});

// Routes métier
router.use(renew);
router.use('/admin', admin);

module.exports = router;
