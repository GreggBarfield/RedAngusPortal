'use strict';
const express = require('express');
const { verifyToken, createRequireAuth, requireRole } = require('../auth');
const { validateFeedlot } = require('../feedlotFields');

const ID_RE = /^\d{1,12}$/;

// What each kind of visitor gets to see. Visitors: name, city, state, website.
// Signed-in members: also the contact details. Staff: also notes and the email settings.
function shape(row, level) {
  const out = {
    id: Number(row.id),
    name: row.name,
    city: row.city,
    state: row.state,
    website: row.website,
  };
  if (level === 'public') return out;
  out.address = row.address;
  out.zip = row.zip;
  out.contactName = row.contact_name;
  out.phone = row.phone;
  out.emails = row.emails || [];
  out.fax = row.fax;
  if (level === 'staff') {
    out.notes = row.notes;
    out.enabled = row.enabled;
    out.doNotEmail = row.do_not_email;
    out.doNotEmailAt = row.do_not_email_at;
    out.doNotEmailNote = row.do_not_email_note;
    out.createdAt = row.created_at;
    out.updatedAt = row.updated_at;
  }
  return out;
}

function createFeedlotsRouter({ feedlots, users, config }) {
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

  router.get('/states', viewer, async (req, res, next) => {
    try {
      res.json({ states: await feedlots.states(req.viewerLevel === 'staff') });
    } catch (err) {
      next(err);
    }
  });

  router.get('/stats', staffOnly, async (req, res, next) => {
    try {
      const s = await feedlots.stats();
      res.json({
        stats: {
          total: s.total,
          enabled: s.enabled,
          withEmail: s.with_email,
          canEmail: s.can_email,
          doNotEmail: s.do_not_email,
          withFax: s.with_fax,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/', viewer, async (req, res, next) => {
    try {
      const level = req.viewerLevel;
      const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
      const stateRaw = typeof req.query.state === 'string' ? req.query.state.trim().toUpperCase() : '';
      const state = /^[A-Z]{2}$/.test(stateRaw) ? stateRaw : '';
      const flag = (v) => (v === '1' || v === '0' ? v : '');
      const page = Math.max(1, Math.min(10000, parseInt(req.query.page, 10) || 1));
      const pageSize = Math.max(1, Math.min(100, parseInt(req.query.pageSize, 10) || 25));
      const staff = level === 'staff';
      const { total, rows } = await feedlots.list({
        q,
        state,
        // Whether a feedlot has an email is contact information, so visitors cannot filter on it.
        hasEmail: level === 'public' ? '' : flag(req.query.hasEmail),
        enabled: staff ? flag(req.query.enabled) : '',
        doNotEmail: staff ? flag(req.query.doNotEmail) : '',
        staff,
        withContact: level !== 'public',
        page,
        pageSize,
      });
      res.json({ total, page, pageSize, feedlots: rows.map((r) => shape(r, level)) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', staffOnly, async (req, res, next) => {
    try {
      const { values, errors } = validateFeedlot(req.body, { partial: false });
      if (errors) return res.status(400).json({ error: 'validation', fields: errors });
      const made = await feedlots.create(values, req.user.id);
      if (made.status === 'duplicate') {
        return res.status(409).json({ error: 'duplicate', message: 'A feedlot with that name, city and state is already in the list.' });
      }
      const row = await feedlots.get(made.id);
      return res.status(201).json({ feedlot: shape(row, 'staff') });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', viewer, async (req, res, next) => {
    try {
      if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: 'not_found' });
      const row = await feedlots.get(Number(req.params.id));
      // A retired feedlot is only visible to staff.
      if (!row || (!row.enabled && req.viewerLevel !== 'staff')) return res.status(404).json({ error: 'not_found' });
      res.json({ feedlot: shape(row, req.viewerLevel) });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', staffOnly, async (req, res, next) => {
    try {
      if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: 'not_found' });
      const { values, errors } = validateFeedlot((req.body || {}).changes, { partial: true });
      if (errors) return res.status(400).json({ error: 'validation', fields: errors });
      const id = Number(req.params.id);
      const result = await feedlots.update(id, values, req.user.id);
      if (result.status === 'not_found') return res.status(404).json({ error: 'not_found' });
      if (result.status === 'duplicate') {
        return res.status(409).json({ error: 'duplicate', message: 'Another feedlot already has that name, city and state.' });
      }
      const row = await feedlots.get(id);
      return res.json({ feedlot: shape(row, 'staff'), changed: result.changed });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', staffOnly, async (req, res, next) => {
    try {
      if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: 'not_found' });
      const result = await feedlots.remove(Number(req.params.id), req.user.id);
      if (result.status === 'not_found') return res.status(404).json({ error: 'not_found' });
      return res.json({ removed: true });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/log', staffOnly, async (req, res, next) => {
    try {
      if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: 'not_found' });
      const rows = await feedlots.log(Number(req.params.id));
      res.json({
        log: rows.map((r) => ({
          id: String(r.id),
          field: r.field,
          oldValue: r.old_value,
          newValue: r.new_value,
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

module.exports = { createFeedlotsRouter, shape };
