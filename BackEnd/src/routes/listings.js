'use strict';
const express = require('express');
const { verifyToken, createRequireAuth, requireRole } = require('../auth');
const { createLimiter } = require('../rateLimit');

const KINDS = ['bull', 'cow', 'heifer', 'bred_heifer', 'pair'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9 ()+.\-]{7,30}$/;
const REG_RE = /^[A-Za-z0-9 \-]{1,30}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^\d{1,12}$/;

function text(v) {
  if (v == null) return null;
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? null : t;
}

function parseDate(s) {
  if (!DATE_RE.test(s)) return null;
  const d = new Date(s + 'T00:00:00Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
  return d;
}

function intIn(v, min, max) {
  if (v == null || v === '') return { value: null };
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  if (!Number.isInteger(n) || n < min || n > max) return { error: `Enter a whole number from ${min} to ${max}.` };
  return { value: n };
}

// Returns { values } with every column filled in (null when blank), or { errors }.
function validateListing(body, now = new Date()) {
  const b = body && typeof body === 'object' ? body : {};
  const errors = {};
  const v = {};

  function req(key, label, max) {
    const t = text(b[key]);
    if (t === undefined || t === null) errors[key] = `Enter ${label}.`;
    else if (t.length > max) errors[key] = `Use ${max} characters or fewer.`;
    else v[key] = t;
  }
  function opt(key, max) {
    const t = text(b[key]);
    if (t === undefined) errors[key] = 'Enter text.';
    else if (t !== null && t.length > max) errors[key] = `Use ${max} characters or fewer.`;
    else v[key] = t;
  }
  function reg(key) {
    const t = text(b[key]);
    if (t === undefined) errors[key] = 'Enter text.';
    else if (t !== null && !REG_RE.test(t)) errors[key] = 'Use letters, numbers, spaces and dashes (up to 30).';
    else v[key] = t;
  }

  if (!KINDS.includes(b.kind)) errors.kind = 'Choose a type.';
  else v.kind = b.kind;
  req('name', 'a name', 100);
  reg('regNumber');
  opt('tag', 30);

  const bd = typeof b.birthDate === 'string' ? parseDate(b.birthDate.trim()) : null;
  if (!bd) errors.birthDate = 'Enter the birth date.';
  else if (bd > now) errors.birthDate = 'Birth date cannot be in the future.';
  else if (bd.getUTCFullYear() < 1995) errors.birthDate = 'Check the birth date.';
  else v.birthDate = b.birthDate.trim();

  opt('sireName', 100);
  reg('sireReg');
  opt('damName', 100);
  reg('damReg');

  for (const [key, min, max] of [
    ['birthWeight', 20, 200],
    ['weaningWeight', 200, 1000],
    ['yearlingWeight', 400, 2500],
  ]) {
    const r = intIn(b[key], min, max);
    if (r.error) errors[key] = r.error;
    else v[key] = r.value;
  }

  // Bull-only and female-only details are dropped for the wrong type.
  if (b.kind === 'bull' && b.scrotal != null && b.scrotal !== '') {
    const n = Number(b.scrotal);
    if (!Number.isFinite(n) || n < 20 || n > 60) errors.scrotal = 'Enter centimeters from 20 to 60.';
    else v.scrotal = Math.round(n * 10) / 10;
  } else v.scrotal = null;

  if (['cow', 'bred_heifer', 'pair'].includes(b.kind)) {
    opt('bredTo', 100);
    const dd = text(b.dueDate);
    if (dd === undefined) errors.dueDate = 'Enter a date.';
    else if (dd === null) v.dueDate = null;
    else {
      const d = parseDate(dd);
      const lo = new Date(now.getTime() - 30 * 86400000);
      const hi = new Date(now.getTime() + 400 * 86400000);
      if (!d || d < lo || d > hi) errors.dueDate = 'Enter a due date within the next year.';
      else v.dueDate = dd;
    }
  } else {
    v.bredTo = null;
    v.dueDate = null;
  }

  const hc = intIn(b.headCount === '' ? 1 : b.headCount == null ? 1 : b.headCount, 1, 500);
  if (hc.error) errors.headCount = hc.error;
  else v.headCount = hc.value;

  req('city', 'a city', 60);
  const st = typeof b.state === 'string' ? b.state.trim().toUpperCase() : '';
  if (!/^[A-Z]{2}$/.test(st)) errors.state = 'Enter the 2-letter state.';
  else v.state = st;
  const zip = typeof b.zip === 'string' ? b.zip.trim() : '';
  if (!/^\d{5}$/.test(zip)) errors.zip = 'Enter a 5-digit zip code.';
  else v.zip = zip;

  v.callForPrice = b.callForPrice === true;
  if (v.callForPrice) v.askingPrice = null;
  else if (b.askingPrice == null || b.askingPrice === '') v.askingPrice = null;
  else {
    const n = Number(String(b.askingPrice).replace(/[$,\s]/g, ''));
    if (!Number.isFinite(n) || n < 0 || n > 1000000) errors.askingPrice = 'Enter a price in dollars, or choose call for price.';
    else v.askingPrice = Math.round(n * 100) / 100;
  }

  opt('description', 4000);
  req('contactName', 'a contact name', 100);
  const ph = text(b.contactPhone);
  const digits = ph ? ph.replace(/\D/g, '').length : 0;
  if (!ph || !PHONE_RE.test(ph) || digits < 10 || digits > 15) errors.contactPhone = 'Enter a phone number with area code.';
  else v.contactPhone = ph;
  const em = text(b.contactEmail);
  if (!em || em.length > 254 || !EMAIL_RE.test(em)) errors.contactEmail = 'Enter a valid email address.';
  else v.contactEmail = em.toLowerCase();

  if (Object.keys(errors).length > 0) return { errors };
  return { values: v };
}

// level: 'public' | 'member' (signed in) | 'owner' | 'staff'
function shape(row, level) {
  const out = {
    id: String(row.id),
    kind: row.kind,
    name: row.name,
    regNumber: row.reg_number,
    birthDate: row.birth_date,
    sireName: row.sire_name,
    sireReg: row.sire_reg,
    damName: row.dam_name,
    damReg: row.dam_reg,
    birthWeight: row.birth_weight,
    weaningWeight: row.weaning_weight,
    yearlingWeight: row.yearling_weight,
    scrotal: row.scrotal,
    bredTo: row.bred_to,
    dueDate: row.due_date,
    headCount: row.head_count,
    city: row.city,
    state: row.state,
    askingPrice: row.asking_price,
    callForPrice: row.call_for_price,
    description: row.description,
    status: row.status,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
  };
  if (level === 'public') return out;
  out.contactName = row.contact_name;
  out.contactPhone = row.contact_phone;
  out.contactEmail = row.contact_email;
  out.sellerName = row.owner_name;
  out.mine = level === 'owner';
  if (level === 'owner' || level === 'staff') {
    out.tag = row.tag;
    out.zip = row.zip;
    out.reviewNote = row.review_note;
    out.updatedAt = row.updated_at;
  }
  return out;
}

function createListingsRouter({ listings, users, config, now }) {
  const router = express.Router();
  const secret = config.jwtSecret;
  const usable = Boolean(secret) && secret.length >= 32;
  const requireAuth = createRequireAuth({ users, secret: usable ? secret : '' });
  const staffOnly = [requireAuth, requireRole('staff')];
  const createLimit = createLimiter({ max: 20, windowMs: 24 * 60 * 60 * 1000, now });

  async function viewer(req, res, next) {
    try {
      req.viewerUser = null;
      const m = /^Bearer (.+)$/i.exec(req.headers.authorization || '');
      if (m && usable) {
        try {
          const payload = verifyToken(m[1], secret);
          const user = await users.findById(payload.sub);
          if (user && user.is_active) req.viewerUser = user;
        } catch (e) {
          /* treat as visitor */
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  }

  function levelFor(user, row) {
    if (!user) return 'public';
    if (user.role === 'staff') return 'staff';
    if (String(row.owner_id) === String(user.id)) return 'owner';
    return 'member';
  }

  router.get('/', viewer, async (req, res, next) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
      const kind = KINDS.includes(req.query.kind) ? req.query.kind : '';
      const stRaw = typeof req.query.state === 'string' ? req.query.state.trim().toUpperCase() : '';
      const state = /^[A-Z]{2}$/.test(stRaw) ? stRaw : '';
      const page = Math.max(1, Math.min(10000, parseInt(req.query.page, 10) || 1));
      const pageSize = Math.max(1, Math.min(50, parseInt(req.query.pageSize, 10) || 20));
      const { total, rows } = await listings.list({ q, kind, state, page, pageSize });
      const level = req.viewerUser ? 'member' : 'public';
      res.json({ total, page, pageSize, listings: rows.map((r) => shape(r, level)) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/mine', requireAuth, async (req, res, next) => {
    try {
      const rows = await listings.mine(req.user.id);
      res.json({ listings: rows.map((r) => shape(r, 'owner')) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/queue', staffOnly, async (req, res, next) => {
    try {
      const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
      const rows = await listings.queue(status);
      res.json({ listings: rows.map((r) => shape(r, 'staff')) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/pending-count', staffOnly, async (req, res, next) => {
    try {
      res.json({ pending: await listings.pendingCount() });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', requireAuth, async (req, res, next) => {
    try {
      if (createLimit.isBlocked(String(req.user.id))) return res.status(429).json({ error: 'too_many_requests' });
      const { values, errors } = validateListing(req.body, now ? new Date(now()) : new Date());
      if (errors) return res.status(400).json({ error: 'validation', fields: errors });
      createLimit.record(String(req.user.id));
      const row = await listings.create(req.user.id, values);
      return res.status(201).json({ listing: shape(row, 'owner') });
    } catch (err) {
      return next(err);
    }
  });

  router.get('/:id', viewer, async (req, res, next) => {
    try {
      if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: 'not_found' });
      const row = await listings.get(req.params.id);
      if (!row) return res.status(404).json({ error: 'not_found' });
      const level = levelFor(req.viewerUser, row);
      if (row.status !== 'approved' && level !== 'owner' && level !== 'staff') return res.status(404).json({ error: 'not_found' });
      return res.json({ listing: shape(row, level) });
    } catch (err) {
      return next(err);
    }
  });

  router.put('/:id', requireAuth, async (req, res, next) => {
    try {
      if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: 'not_found' });
      const row = await listings.get(req.params.id);
      if (!row || String(row.owner_id) !== String(req.user.id)) return res.status(404).json({ error: 'not_found' });
      if (row.status === 'sold' || row.status === 'withdrawn') return res.status(409).json({ error: 'closed' });
      const { values, errors } = validateListing(req.body, now ? new Date(now()) : new Date());
      if (errors) return res.status(400).json({ error: 'validation', fields: errors });
      const updated = await listings.update(row.id, values);
      return res.json({ listing: shape(updated, 'owner') });
    } catch (err) {
      return next(err);
    }
  });

  // Owner: mark sold or withdrawn.
  router.post('/:id/close', requireAuth, async (req, res, next) => {
    try {
      if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: 'not_found' });
      const status = (req.body || {}).status;
      if (status !== 'sold' && status !== 'withdrawn') return res.status(400).json({ error: 'validation', fields: { status: 'Choose sold or withdrawn.' } });
      const row = await listings.get(req.params.id);
      if (!row || String(row.owner_id) !== String(req.user.id)) return res.status(404).json({ error: 'not_found' });
      if (!(await listings.close(row.id, status))) return res.status(409).json({ error: 'closed' });
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  // Staff: approve, or reject / pull back with a note.
  router.post('/:id/review', staffOnly, async (req, res, next) => {
    try {
      if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: 'not_found' });
      const b = req.body || {};
      if (b.decision !== 'approve' && b.decision !== 'reject') {
        return res.status(400).json({ error: 'validation', fields: { decision: 'Choose approve or reject.' } });
      }
      let note = null;
      if (b.note != null && b.note !== '') {
        if (typeof b.note !== 'string' || b.note.length > 1000) {
          return res.status(400).json({ error: 'validation', fields: { note: 'Use 1000 characters or fewer.' } });
        }
        note = b.note.trim() || null;
      }
      if (b.decision === 'reject' && !note) {
        return res.status(400).json({ error: 'validation', fields: { note: 'Tell the seller why.' } });
      }
      const row = await listings.get(req.params.id);
      if (!row) return res.status(404).json({ error: 'not_found' });
      const ok = await listings.review(row.id, { decision: b.decision, note, reviewerId: req.user.id });
      if (!ok) return res.status(409).json({ error: 'wrong_status' });
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = { createListingsRouter, validateListing, shape };
