// src/routes/index.js
import express from 'express';
import path from 'path';

import renew from './renew.js';
import admin from './admin.js';

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
