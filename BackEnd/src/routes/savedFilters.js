'use strict';
const express = require('express');
const { ID_RE, createAccess } = require('../common');

const MAX_PER_KIND = 25;

// The search settings each screen can save (the same names the search address uses).
const KEYS = {
  feeder: ['q', 'state', 'breed', 'program', 'method', 'dateFrom', 'dateTo', 'tagged', 'minWeight', 'maxWeight', 'minAge', 'maxAge', 'zip', 'miles', 'sort', 'dir'],
  breeding: ['q', 'state', 'breed', 'class', 'dateFrom', 'dateTo', 'epd', 'zip', 'miles', 'sort', 'dir'],
};

function cleanValue(v) {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' || t.length > 100 ? null : t;
  }
  if (Array.isArray(v)) {
    const list = v.filter((x) => typeof x === 'string').map((x) => x.trim()).filter((x) => x && x.length <= 100).slice(0, 10);
    return list.length ? list : null;
  }
  return null;
}

// Keeps only the settings this kind of search knows about.
function cleanParams(kind, params) {
  const out = {};
  if (!params || typeof params !== 'object' || Array.isArray(params)) return out;
  for (const key of KEYS[kind]) {
    if (!(key in params)) continue;
    const v = cleanValue(params[key]);
    if (v != null) out[key] = v;
  }
  return out;
}

function createSavedFiltersRouter({ filters, users, config }) {
  const router = express.Router();
  const { requireAuth } = createAccess({ users, config });

  const shape = (r) => ({ id: String(r.id), kind: r.kind, name: r.name, params: r.params, createdAt: r.created_at });

  router.get('/', requireAuth, async (req, res, next) => {
    try {
      const kind = req.query.kind === 'feeder' || req.query.kind === 'breeding' ? req.query.kind : '';
      const rows = await filters.list(req.user.id, kind);
      res.json({ filters: rows.map(shape) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', requireAuth, async (req, res, next) => {
    try {
      const b = req.body || {};
      const errors = {};
      const kind = b.kind;
      if (kind !== 'feeder' && kind !== 'breeding') errors.kind = 'Choose feeder or breeding.';
      const name = typeof b.name === 'string' ? b.name.trim() : '';
      if (name.length < 1 || name.length > 60) errors.name = 'Give the search a name (up to 60 characters).';
      const params = errors.kind ? {} : cleanParams(kind, b.params);
      if (!errors.kind && Object.keys(params).length === 0) errors.params = 'Choose at least one filter first.';
      if (Object.keys(errors).length > 0) return res.status(400).json({ error: 'validation', fields: errors });

      const existing = await filters.list(req.user.id, kind);
      const replacing = existing.some((f) => f.name.toLowerCase() === name.toLowerCase());
      if (existing.length >= MAX_PER_KIND && !replacing) return res.status(409).json({ error: 'limit' });
      // Same name in a different capitalization replaces that search.
      const sameName = existing.find((f) => f.name.toLowerCase() === name.toLowerCase());
      const saved = await filters.save(req.user.id, kind, sameName ? sameName.name : name, params);
      return res.status(replacing ? 200 : 201).json({ filter: shape(saved) });
    } catch (err) {
      return next(err);
    }
  });

  router.delete('/:id', requireAuth, async (req, res, next) => {
    try {
      if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: 'not_found' });
      if (!(await filters.remove(req.user.id, req.params.id))) return res.status(404).json({ error: 'not_found' });
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = { createSavedFiltersRouter, cleanParams, KEYS };
