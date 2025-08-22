// src/routes/index.js
import express from 'express';
import renewRoutes from './renew.js';
import haRoutes from './ha.js';

const router = express.Router();

// Endpoints “renew” et HelloAsso
router.use('/', renewRoutes);
router.use('/', haRoutes);

// petite racine
router.get('/', (_req, res) => res.json({ app: 'BTS API', ok: true }));

export default router;
