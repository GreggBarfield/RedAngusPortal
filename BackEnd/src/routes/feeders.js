'use strict';
const express = require('express');
const { verifyToken, createRequireAuth, requireRole } = require('../auth');
const { createLimiter } = require('../rateLimit');

const SEXES = ['steers', 'heifers', 'bulls', 'mixed'];
const HORNS = ['polled', 'dehorned', 'horned', 'mixed'];
const SALE_TYPES = ['private_treaty', 'contract', 'video'];
const BASES = ['per_cwt', 'per_head'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9 ()+.\-]{7,30}$/;
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
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(/,/g, ''));
  if (!Number.isInteger(n) || n < min || n > max) return { error: `Enter a whole number from ${min} to ${max}.` };
  return { value: n };
}

// Returns { values } with every column filled in (null when blank), or { errors }.
function validateFeeder(body, now = new Date()) {
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
  function required(key, min, max, label) {
    const r = intIn(b[key], min, max);
    if (r.error) errors[key] = r.error;
    else if (r.value == null) errors[key] = `Enter ${label}.`;
    else v[key] = r.value;
  }
  function optional(key, min, max) {
    const r = intIn(b[key], min, max);
    if (r.error) errors[key] = r.error;
    else v[key] = r.value;
  }
  function choice(key, list, label, mustHave) {
    const t = text(b[key]);
    if (t === null || t === undefined) {
      if (mustHave) errors[key] = `Choose ${label}.`;
      else v[key] = null;
    } else if (!list.includes(t)) errors[key] = `Choose ${label}.`;
    else v[key] = t;
  }

  req('title', 'a title', 100);
  required('headCount', 1, 5000, 'the number of head');
  choice('sex', SEXES, 'steers, heifers, bulls or mixed', true);
  required('avgWeight', 150, 1500, 'the average weight');
  optional('weightLow', 150, 1500);
  optional('weightHigh', 150, 1500);
  if (!errors.weightLow && v.weightLow != null && !errors.avgWeight && v.weightLow > v.avgWeight) {
    errors.weightLow = 'The low weight cannot be above the average.';
  }
  if (!errors.weightHigh && v.weightHigh != null && !errors.avgWeight && v.weightHigh < v.avgWeight) {
    errors.weightHigh = 'The high weight cannot be below the average.';
  }
  opt('breed', 100);
  optional('ageMonths', 1, 36);
  v.weaned = b.weaned === true;
  if (v.weaned) optional('weanedDays', 0, 365);
  else v.weanedDays = null;
  opt('healthProgram', 1000);
  choice('hornStatus', HORNS, 'polled, dehorned, horned or mixed', false);
  v.bunkBroke = b.bunkBroke === true;
  opt('siredBy', 200);
  choice('saleType', SALE_TYPES, 'a sale type', false);

  const ad = text(b.availableDate);
  if (ad === undefined) errors.availableDate = 'Enter a date.';
  else if (ad === null) v.availableDate = null;
  else {
    const d = parseDate(ad);
    const lo = new Date(now.getTime() - 7 * 86400000);
    const hi = new Date(now.getTime() + 730 * 86400000);
    if (!d || d < lo || d > hi) errors.availableDate = 'Enter a delivery or pickup date within the next two years.';
    else v.availableDate = ad;
  }

  req('city', 'a city', 60);
  const st = typeof b.state === 'string' ? b.state.trim().toUpperCase() : '';
  if (!/^[A-Z]{2}$/.test(st)) errors.state = 'Enter the 2-letter state.';
  else v.state = st;
  const zip = typeof b.zip === 'string' ? b.zip.trim() : '';
  if (!/^\d{5}$/.test(zip)) errors.zip = 'Enter a 5-digit zip code.';
  else v.zip = zip;

  v.callForPrice = b.callForPrice === true;
  const hasPrice = !(b.askingPrice == null || b.askingPrice === '');
  if (v.callForPrice || !hasPrice) {
    v.askingPrice = null;
    v.priceBasis = null;
  } else {
    const n = Number(String(b.askingPrice).replace(/[$,\s]/g, ''));
    const basis = text(b.priceBasis);
    if (!BASES.includes(basis)) errors.priceBasis = 'Choose per hundredweight or per head.';
    const cap = basis === 'per_head' ? 20000 : 1000;
    if (!Number.isFinite(n) || n <= 0 || n > cap) errors.askingPrice = 'Enter a price in dollars, or choose call for price.';
    else v.askingPrice = Math.round(n * 100) / 100;
    v.priceBasis = BASES.includes(basis) ? basis : null;
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
    title: row.title,
    headCount: row.head_count,
    sex: row.sex,
    avgWeight: row.avg_weight,
    weightLow: row.weight_low,
    weightHigh: row.weight_high,
    breed: row.breed,
    ageMonths: row.age_months,
    weaned: row.weaned,
    weanedDays: row.weaned_days,
    healthProgram: row.health_program,
    hornStatus: row.horn_status,
    bunkBroke: row.bunk_broke,
    siredBy: row.sired_by,
    saleType: row.sale_type,
    availableDate: row.available_date,
    city: row.city,
    state: row.state,
    priceBasis: row.price_basis,
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
    out.zip = row.zip;
    out.reviewNote = row.review_note;
    out.updatedAt = row.updated_at;
  }
  return out;
}

function createFeedersRouter({ feeders, users, config, now }) {
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
    if (String(row.owner_id) === String(user.id)) return 'owner';
    if (user.role === 'staff') return 'staff';
    return 'member';
  }

  router.get('/', viewer, async (req, res, next) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
      const sex = SEXES.includes(req.query.sex) ? req.query.sex : '';
      const stRaw = typeof req.query.state === 'string' ? req.query.state.trim().toUpperCase() : '';
      const state = /^[A-Z]{2}$/.test(stRaw) ? stRaw : '';
      const w = (x) => {
        const n = parseInt(x, 10);
        return Number.isInteger(n) && n >= 0 && n <= 5000 ? n : 0;
      };
      const page = Math.max(1, Math.min(10000, parseInt(req.query.page, 10) || 1));
      const pageSize = Math.max(1, Math.min(50, parseInt(req.query.pageSize, 10) || 20));
      const { total, rows } = await feeders.list({
        q,
        sex,
        state,
        minWeight: w(req.query.minWeight),
        maxWeight: w(req.query.maxWeight),
        page,
        pageSize,
      });
      const level = req.viewerUser ? 'member' : 'public';
      res.json({ total, page, pageSize, lots: rows.map((r) => shape(r, level)) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/mine', requireAuth, async (req, res, next) => {
    try {
      const rows = await feeders.mine(req.user.id);
      res.json({ lots: rows.map((r) => shape(r, 'owner')) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/queue', staffOnly, async (req, res, next) => {
    try {
      const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
      const rows = await feeders.queue(status);
      res.json({ lots: rows.map((r) => shape(r, 'staff')) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/pending-count', staffOnly, async (req, res, next) => {
    try {
      res.json({ pending: await feeders.pendingCount() });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', requireAuth, async (req, res, next) => {
    try {
      if (createLimit.isBlocked(String(req.user.id))) return res.status(429).json({ error: 'too_many_requests' });
      const { values, errors } = validateFeeder(req.body, now ? new Date(now()) : new Date());
      if (errors) return res.status(400).json({ error: 'validation', fields: errors });
      createLimit.record(String(req.user.id));
      const row = await feeders.create(req.user.id, values);
      return res.status(201).json({ lot: shape(row, 'owner') });
    } catch (err) {
      return next(err);
    }
  });

  router.get('/:id', viewer, async (req, res, next) => {
    try {
      if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: 'not_found' });
      const row = await feeders.get(req.params.id);
      if (!row) return res.status(404).json({ error: 'not_found' });
      const level = levelFor(req.viewerUser, row);
      if (row.status !== 'approved' && level !== 'owner' && level !== 'staff') return res.status(404).json({ error: 'not_found' });
      return res.json({ lot: shape(row, level) });
    } catch (err) {
      return next(err);
    }
  });

  router.put('/:id', requireAuth, async (req, res, next) => {
    try {
      if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: 'not_found' });
      const row = await feeders.get(req.params.id);
      if (!row || String(row.owner_id) !== String(req.user.id)) return res.status(404).json({ error: 'not_found' });
      if (row.status === 'sold' || row.status === 'withdrawn') return res.status(409).json({ error: 'closed' });
      const { values, errors } = validateFeeder(req.body, now ? new Date(now()) : new Date());
      if (errors) return res.status(400).json({ error: 'validation', fields: errors });
      const updated = await feeders.update(row.id, values);
      return res.json({ lot: shape(updated, 'owner') });
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
      const row = await feeders.get(req.params.id);
      if (!row || String(row.owner_id) !== String(req.user.id)) return res.status(404).json({ error: 'not_found' });
      if (!(await feeders.close(row.id, status))) return res.status(409).json({ error: 'closed' });
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
      const row = await feeders.get(req.params.id);
      if (!row) return res.status(404).json({ error: 'not_found' });
      const ok = await feeders.review(row.id, { decision: b.decision, note, reviewerId: req.user.id });
      if (!ok) return res.status(409).json({ error: 'wrong_status' });
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = { createFeedersRouter, validateFeeder, shape };
