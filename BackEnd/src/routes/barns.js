'use strict';
const express = require('express');
const { verifyToken, createRequireAuth, requireRole } = require('../auth');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9 ()+.\-]{7,30}$/;
const ID_RE = /^\d{1,9}$/;

function clean(v) {
  if (v == null) return null;
  if (typeof v !== 'string') return undefined; // invalid type
  const t = v.trim();
  return t === '' ? null : t;
}

function digits(s) {
  return s.replace(/\D/g, '');
}

// Returns { values } (only the fields that were sent) or { errors }.
function validateContactChanges(input) {
  const errors = {};
  const values = {};
  if (!input || typeof input !== 'object') return { errors: { _: 'Nothing to change.' } };
  for (const key of ['email', 'phone', 'fax', 'contactName']) {
    if (!(key in input)) continue;
    const v = clean(input[key]);
    if (v === undefined) {
      errors[key] = 'Enter text.';
      continue;
    }
    if (v === null) {
      values[key] = null;
      continue;
    }
    if (key === 'email') {
      if (v.length > 254 || !EMAIL_RE.test(v)) errors.email = 'Enter a valid email address.';
      else values.email = v.toLowerCase();
    } else if (key === 'phone' || key === 'fax') {
      const n = digits(v).length;
      if (!PHONE_RE.test(v) || n < 10 || n > 15) errors[key] = 'Enter a phone number with area code (10 to 15 digits).';
      else values[key] = v;
    } else if (v.length > 100) {
      errors.contactName = 'Use 100 characters or fewer.';
    } else {
      values.contactName = v;
    }
  }
  if (Object.keys(errors).length > 0) return { errors };
  if (Object.keys(values).length === 0) return { errors: { _: 'Nothing to change.' } };
  return { values };
}

// What each kind of visitor gets to see.
function shape(row, settings, level) {
  const out = {
    auctionNo: row.auction_no,
    name: row.auc_name,
    city: row.auc_city,
    state: row.auc_state,
    category: row.category,
    isActive: row.is_active,
  };
  if (level === 'public') return out;
  out.address = row.auc_addr;
  out.zip = row.auc_zip;
  out.email = row.auc_email;
  out.phone = row.auc_phone;
  out.fax = row.auc_fax;
  out.contactName = row.contact_name;
  out.btnPreferredMethod = row.preferred_method ? String(row.preferred_method).toLowerCase() : null;
  out.sendMethod = settings ? settings.send_method : null;
  out.enabled = settings ? settings.enabled : true;
  if (level === 'staff') out.notes = settings ? settings.notes : null;
  return out;
}

function createBarnsRouter({ barns, users, config }) {
  const router = express.Router();
  const secret = config.jwtSecret;
  const usable = Boolean(secret) && secret.length >= 32;
  const requireAuth = createRequireAuth({ users, secret: usable ? secret : '' });
  const staffOnly = [requireAuth, requireRole('staff')];

  // Signed-in users see contact details; a missing or bad token is just a visitor.
  async function viewer(req, res, next) {
    try {
      req.viewerLevel = 'public';
      const m = /^Bearer (.+)$/i.exec(req.headers.authorization || '');
      if (m && usable) {
        try {
          const payload = verifyToken(m[1], secret);
          const user = await users.findById(payload.sub);
          if (user && user.is_active) {
            req.viewerUser = user;
            req.viewerLevel = user.role === 'staff' ? 'staff' : 'member';
          }
        } catch (e) {
          /* treat as visitor */
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  }

  router.use((req, res, next) => {
    if (!barns.available()) return res.status(503).json({ error: 'barns_not_configured' });
    return next();
  });

  router.get('/states', async (req, res, next) => {
    try {
      res.json({ states: await barns.states() });
    } catch (err) {
      next(err);
    }
  });

  router.get('/', viewer, async (req, res, next) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
      const stateRaw = typeof req.query.state === 'string' ? req.query.state.trim().toUpperCase() : '';
      const state = /^[A-Z]{2}$/.test(stateRaw) ? stateRaw : '';
      const catRaw = typeof req.query.category === 'string' ? req.query.category.toUpperCase() : '';
      const category = catRaw === 'REG' || catRaw === 'VID' ? catRaw : '';
      const activeOnly = req.query.active === '1';
      const page = Math.max(1, Math.min(10000, parseInt(req.query.page, 10) || 1));
      const pageSize = Math.max(1, Math.min(100, parseInt(req.query.pageSize, 10) || 25));
      const { total, rows } = await barns.list({ q, state, category, activeOnly, page, pageSize });
      const settings = req.viewerLevel === 'public' ? new Map() : await barns.settingsFor(rows.map((r) => r.auction_no));
      res.json({
        total,
        page,
        pageSize,
        barns: rows.map((r) => shape(r, settings.get(r.auction_no), req.viewerLevel)),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', viewer, async (req, res, next) => {
    try {
      if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: 'not_found' });
      const id = Number(req.params.id);
      const row = await barns.get(id);
      if (!row) return res.status(404).json({ error: 'not_found' });
      const settings = req.viewerLevel === 'public' ? new Map() : await barns.settingsFor([id]);
      res.json({ barn: shape(row, settings.get(id), req.viewerLevel) });
    } catch (err) {
      next(err);
    }
  });

  // Staff: change contact details here and in BTN.
  router.patch('/:id/contact', staffOnly, async (req, res, next) => {
    try {
      if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: 'not_found' });
      if (!barns.canWrite()) return res.status(503).json({ error: 'barns_write_not_configured' });
      const body = req.body || {};
      const { values, errors } = validateContactChanges(body.changes);
      if (errors) return res.status(400).json({ error: 'validation', fields: errors });
      let expected = null;
      if (body.expected && typeof body.expected === 'object') {
        expected = {};
        for (const k of ['email', 'phone', 'fax', 'contactName']) {
          if (k in body.expected) {
            const v = clean(body.expected[k]);
            expected[k] = v === undefined ? null : v;
          }
        }
      }
      const result = await barns.updateContact({
        auctionNo: Number(req.params.id),
        changes: values,
        expected,
        overwrite: body.overwrite === true,
        userId: req.user.id,
      });
      if (result.status === 'not_found') return res.status(404).json({ error: 'not_found' });
      if (result.status === 'conflict') {
        return res.status(409).json({ error: 'conflict', conflicts: result.conflicts, current: result.current });
      }
      return res.json({ changed: result.changed, logged: result.logged !== false });
    } catch (err) {
      next(err);
    }
  });

  // Staff: RAA-only settings.
  router.put('/:id/settings', staffOnly, async (req, res, next) => {
    try {
      if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: 'not_found' });
      const id = Number(req.params.id);
      const b = req.body || {};
      const errors = {};
      let sendMethod = null;
      if (b.sendMethod != null && b.sendMethod !== '') {
        if (b.sendMethod === 'email' || b.sendMethod === 'fax') sendMethod = b.sendMethod;
        else errors.sendMethod = 'Choose email or fax.';
      }
      if (typeof b.enabled !== 'boolean') errors.enabled = 'Choose on or off.';
      let notes = null;
      if (b.notes != null && b.notes !== '') {
        if (typeof b.notes !== 'string' || b.notes.length > 2000) errors.notes = 'Use 2000 characters or fewer.';
        else notes = b.notes.trim() || null;
      }
      if (Object.keys(errors).length > 0) return res.status(400).json({ error: 'validation', fields: errors });
      if (!(await barns.get(id))) return res.status(404).json({ error: 'not_found' });
      const saved = await barns.saveSettings(id, { sendMethod, enabled: b.enabled, notes }, req.user.id);
      return res.json({ settings: { sendMethod: saved.send_method, enabled: saved.enabled, notes: saved.notes } });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/log', staffOnly, async (req, res, next) => {
    try {
      if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: 'not_found' });
      const rows = await barns.log(Number(req.params.id));
      res.json({
        log: rows.map((r) => ({
          id: String(r.id),
          field: r.field,
          oldValue: r.old_value,
          newValue: r.new_value,
          overwrote: r.overwrote,
          changedAt: r.changed_at,
          changedBy: r.changed_by,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createBarnsRouter, validateContactChanges };
