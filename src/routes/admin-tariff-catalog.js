// src/routes/admin-tariff-catalog.js
const express = require('express');
const { celebrate, Joi, Segments } = require('celebrate');
const Tariff = require('../models/Tariff');
const { requireAdmin } = require('../middlewares/authz');

const router = express.Router();

const bodyUpsert = celebrate({
  [Segments.BODY]: Joi.object({
    code: Joi.string().uppercase().trim().required(),
    label: Joi.string().trim().required(),
    requiresField: Joi.string().allow(null, '').default(null),
    fieldLabel: Joi.string().allow(null, '').default(null),
    requiresInfo: Joi.string().allow(null, '').default(null),
    active: Joi.boolean().default(true),
    sortOrder: Joi.number().integer().min(0).default(100)
  })
});

const bodyDelete = celebrate({
  [Segments.BODY]: Joi.object({
    code: Joi.string().uppercase().trim().required()
  })
});

// GET: liste complète (y compris inactifs si ?all=1)
router.get('/api/admin/tariff-catalog', requireAdmin, async (req, res, next) => {
  try {
    const all = String(req.query.all || '') === '1';
    const q = all ? {} : { active: true };
    const docs = await Tariff.find(q).sort({ sortOrder: 1, label: 1 }).lean();
    return res.json({ total: docs.length, items: docs });
  } catch (err) { return next(err); }
});

// GET export CSV
router.get('/api/admin/tariff-catalog/export.csv', requireAdmin, async (_req, res, next) => {
  try {
    const docs = await Tariff.find({}).sort({ sortOrder: 1, label: 1 }).lean();
    const header = 'code,label,requiresField,fieldLabel,requiresInfo,active,sortOrder\n';
    const body = docs.map(d => {
      const csv = [
        d.code,
        (d.label || '').replace(/"/g,'""'),
        d.requiresField || '',
        (d.fieldLabel || '').replace(/"/g,'""'),
        (d.requiresInfo || '').replace(/"/g,'""'),
        d.active ? 'true' : 'false',
        Number.isFinite(d.sortOrder) ? d.sortOrder : 100
      ];
      // entourer label/field/info de guillemets pour tolérer les virgules
      csv[1] = `"${csv[1]}"`;
      csv[3] = `"${csv[3]}"`;
      csv[4] = `"${csv[4]}"`;
      return csv.join(',');
    }).join('\n') + '\n';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="tariff_catalog.csv"');
    return res.send(header + body);
  } catch (err) { return next(err); }
});

// PUT upsert (1)
router.put('/api/admin/tariff-catalog', requireAdmin, bodyUpsert, async (req, res, next) => {
  try {
    const { code, label, requiresField, fieldLabel, requiresInfo, active, sortOrder } = req.body;
    const doc = await Tariff.findOneAndUpdate(
      { code },
      { $set: { label, requiresField: requiresField || null, fieldLabel: fieldLabel || null, requiresInfo: requiresInfo || null, active, sortOrder } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    return res.json({ ok: true, item: doc });
  } catch (err) { return next(err); }
});

// POST batch upsert
router.post('/api/admin/tariff-catalog/batch', requireAdmin, async (req, res, next) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: 'items_required' });
    const ops = items.map(it => ({
      updateOne: {
        filter: { code: String(it.code || '').toUpperCase().trim() },
        update: {
          $set: {
            label: String(it.label || '').trim(),
            requiresField: (it.requiresField || null) || null,
            fieldLabel: (it.fieldLabel || null) || null,
            requiresInfo: (it.requiresInfo || null) || null,
            active: typeof it.active === 'boolean' ? it.active : true,
            sortOrder: Number.isFinite(+it.sortOrder) ? +it.sortOrder : 100
          }
        },
        upsert: true
      }
    }));
    const result = await Tariff.bulkWrite(ops, { ordered: false });
    return res.json({
      ok: true,
      upserts: result.upsertedCount || 0,
      matched: result.matchedCount || 0,
      modified: result.modifiedCount || 0
    });
  } catch (err) { return next(err); }
});

// DELETE par code
router.delete('/api/admin/tariff-catalog', requireAdmin, bodyDelete, async (req, res, next) => {
  try {
    const r = await Tariff.deleteOne({ code: req.body.code });
    return res.json({ ok: true, deleted: r.deletedCount || 0 });
  } catch (err) { return next(err); }
});

module.exports = router;
