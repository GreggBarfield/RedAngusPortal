'use strict';
const express = require('express');
const { createLimiter } = require('../rateLimit');
const {
  ID_RE,
  DAY,
  text,
  parseDate,
  toList,
  checker,
  applyLocation,
  readCenter,
  ageMonths,
  createAccess,
  readReview,
  sortDir,
} = require('../common');

const SEX_CLASSES = ['bull', 'open_heifer', 'bred_heifer', 'cow', 'cow_calf', 'embryo_semen'];
const BREED_CLASSES = ['purebred', 'percentage', 'composite', 'commercial'];
const SALE_TYPES = ['auction', 'private_treaty', 'off_ranch', 'video_auction'];
const SORTS = ['saleDate', 'headCount', 'newest', 'distance'];
const REG_RE = /^[A-Za-z0-9 \-]{1,30}$/;
const EPD_RE = /^[A-Za-z0-9][A-Za-z0-9 _\-./%]{0,19}$/;

const CLASS_NAMES = {
  bull: ['Bull', 'Bulls'],
  open_heifer: ['Open Heifer', 'Open Heifers'],
  bred_heifer: ['Bred Heifer', 'Bred Heifers'],
  cow: ['Cow', 'Cows'],
  cow_calf: ['Cow/Calf Pair', 'Cow/Calf Pairs'],
  embryo_semen: ['Embryo/Semen', 'Embryo/Semen'],
};

function headlineFor(v) {
  const names = CLASS_NAMES[v.sexClass] || ['Cattle', 'Cattle'];
  const one = v.headCount === 1;
  const breed = v.primaryBreed || (v.breeds && v.breeds[0]) || '';
  const what = [breed, names[one ? 0 : 1]].filter(Boolean).join(' ');
  return (one ? what : `${v.headCount} ${what}`).slice(0, 150);
}

// Returns { values } with every column filled in (null when blank), or { errors }.
function validateBreedingListing(body, now = new Date()) {
  const c = checker(body, now);
  const { b, errors, v } = c;

  c.int('headCount', 1, 5000, 'the number of head', true);
  c.choice('sexClass', SEX_CLASSES, 'a sex / class', true);
  c.dateWindow('birthDate', { pastDays: 365 * 35, futureDays: 0, required: false, label: 'a date', message: 'Check the date of birth.' });
  c.pattern('regNumber', REG_RE, 'Use letters, numbers, spaces and dashes (up to 30).', false);

  c.names('breeds', { min: 1, max: 10, itemMax: 100, label: 'at least one breed' });
  c.choice('breedClass', BREED_CLASSES, 'a breed class', false);

  const pb = text(b.primaryBreed);
  if (pb === undefined) errors.primaryBreed = 'Choose a breed.';
  else if (pb === null) v.primaryBreed = v.breeds ? v.breeds[0] : null;
  else if (v.breeds) {
    const hit = v.breeds.find((x) => x.toLowerCase() === pb.toLowerCase());
    if (!hit) errors.primaryBreed = 'Choose one of the breeds above.';
    else v.primaryBreed = hit;
  } else v.primaryBreed = pb;

  c.opt('sire', 120);
  c.opt('dam', 120);
  c.opt('headline', 150);
  c.opt('description', 4000);
  c.opt('saleTitle', 150);

  // EPD rows: blank rows are dropped; a blank value or the Unknown box saves the trait as unknown.
  if (b.epds != null && !Array.isArray(b.epds)) {
    errors.epds = 'Check the EPD rows.';
  } else {
    const out = [];
    const seen = new Set();
    let bad = null;
    (b.epds || []).forEach((row, i) => {
      if (bad) return;
      const n = i + 1;
      if (!row || typeof row !== 'object') {
        bad = `EPD row ${n} is not valid.`;
        return;
      }
      const trait = text(row.trait);
      if (trait === undefined) {
        bad = `EPD row ${n} is not valid.`;
        return;
      }
      const raw = row.value;
      const blank = raw == null || (typeof raw === 'string' && raw.trim() === '');
      if (trait === null) {
        if (blank && row.unknown !== true) return;
        bad = `EPD row ${n}: choose the trait.`;
        return;
      }
      if (!EPD_RE.test(trait)) {
        bad = `EPD row ${n}: use letters, numbers and dashes for the trait code (up to 20).`;
        return;
      }
      const key = trait.toUpperCase();
      if (seen.has(key)) {
        bad = `EPD ${key} is listed twice.`;
        return;
      }
      seen.add(key);
      let value = null;
      if (row.unknown !== true && !blank) {
        const num = typeof raw === 'number' ? raw : Number(String(raw).trim());
        if (!Number.isFinite(num) || Math.abs(num) > 100000) {
          bad = `EPD row ${n}: enter a number, or check Unknown.`;
          return;
        }
        value = Math.round(num * 10000) / 10000;
      }
      out.push({ trait: key, value });
    });
    if (!bad && out.length > 40) bad = 'List up to 40 EPD traits.';
    if (bad) errors.epds = bad;
    else v.epds = out;
  }

  c.choice('saleType', SALE_TYPES, 'a sale type', true);
  c.auction();
  c.dateWindow('saleDate', {
    pastDays: 7,
    futureDays: 730,
    required: true,
    label: 'the sale date',
    message: 'Enter a sale date within the next two years.',
  });

  c.place();
  c.price(false);
  c.contact();

  if (!v.headline && !errors.headCount && !errors.sexClass && !errors.breeds) v.headline = headlineFor(v);
  return c.result();
}

// level: 'public' | 'member' (signed in) | 'owner' | 'staff'
function shape(row, level, now = new Date()) {
  const out = {
    id: String(row.id),
    headCount: row.head_count,
    sexClass: row.sex_class,
    birthDate: row.birth_date,
    ageMonths: ageMonths(row.birth_date, now),
    regNumber: row.reg_number,
    breeds: row.breeds || [],
    breedClass: row.breed_class,
    primaryBreed: row.primary_breed,
    sire: row.sire,
    dam: row.dam,
    headline: row.headline,
    description: row.description,
    saleTitle: row.sale_title,
    saleType: row.sale_type,
    auctionNo: row.auction_no,
    auctionName: row.auction_name,
    saleDate: row.sale_date,
    city: row.city,
    state: row.state,
    askingPrice: row.asking_price,
    callForPrice: row.call_for_price,
    epds: row.epds || [],
    status: row.status,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
  };
  if (row.distance_miles != null) out.distanceMiles = Math.round(row.distance_miles);
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

function dateParam(v) {
  return typeof v === 'string' && parseDate(v.trim()) ? v.trim() : '';
}

// ?epd=CED:5:  or  ?epd=BW::3.5  (code:min:max, either end may be left blank)
function epdFilters(v) {
  const out = [];
  for (const s of toList(v).slice(0, 8)) {
    const [code, min, max] = s.split(':');
    if (!code || !EPD_RE.test(code.trim())) continue;
    const num = (x) => {
      if (x == null || x.trim() === '') return null;
      const n = Number(x);
      return Number.isFinite(n) ? n : null;
    };
    const lo = num(min);
    const hi = num(max);
    if (lo == null && hi == null) continue;
    out.push({ code: code.trim(), min: lo, max: hi });
  }
  return out;
}

function createBreedingListingsRouter({ breeding, users, config, geo, now }) {
  const router = express.Router();
  const { requireAuth, staffOnly, viewer, levelFor } = createAccess({ users, config });
  const createLimit = createLimiter({ max: 20, windowMs: DAY, now });
  const clock = () => (now ? new Date(now()) : new Date());

  router.get('/', viewer, async (req, res, next) => {
    try {
      const qy = req.query;
      const stRaw = typeof qy.state === 'string' ? qy.state.trim().toUpperCase() : '';
      const loc = await readCenter(geo, qy);
      if (loc.error) return res.status(400).json({ error: 'validation', fields: loc.error });
      const page = Math.max(1, Math.min(10000, parseInt(qy.page, 10) || 1));
      const pageSize = Math.max(1, Math.min(50, parseInt(qy.pageSize, 10) || 20));
      const { total, rows } = await breeding.list({
        q: typeof qy.q === 'string' ? qy.q.trim().slice(0, 100) : '',
        state: /^[A-Z]{2}$/.test(stRaw) ? stRaw : '',
        breeds: toList(qy.breed).slice(0, 10).map((s) => s.slice(0, 100)),
        classes: toList(qy.class).filter((x) => SEX_CLASSES.includes(x)),
        dateFrom: dateParam(qy.dateFrom),
        dateTo: dateParam(qy.dateTo),
        epds: epdFilters(qy.epd),
        center: loc.center || null,
        sort: SORTS.includes(qy.sort) ? qy.sort : 'newest',
        dir: sortDir(qy.dir),
        page,
        pageSize,
      });
      const level = req.viewerUser ? 'member' : 'public';
      const t = clock();
      res.json({ total, page, pageSize, listings: rows.map((r) => shape(r, level, t)) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/mine', requireAuth, async (req, res, next) => {
    try {
      const rows = await breeding.mine(req.user.id);
      const t = clock();
      res.json({ listings: rows.map((r) => shape(r, 'owner', t)) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/queue', staffOnly, async (req, res, next) => {
    try {
      const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
      const rows = await breeding.queue(status);
      const t = clock();
      res.json({ listings: rows.map((r) => shape(r, 'staff', t)) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/pending-count', staffOnly, async (req, res, next) => {
    try {
      res.json({ pending: await breeding.pendingCount() });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', requireAuth, async (req, res, next) => {
    try {
      if (createLimit.isBlocked(String(req.user.id))) return res.status(429).json({ error: 'too_many_requests' });
      const { values, errors } = validateBreedingListing(req.body, clock());
      if (errors) return res.status(400).json({ error: 'validation', fields: errors });
      const placeErrors = await applyLocation(geo, values);
      if (placeErrors) return res.status(400).json({ error: 'validation', fields: placeErrors });
      createLimit.record(String(req.user.id));
      const row = await breeding.create(req.user.id, values);
      return res.status(201).json({ listing: shape(row, 'owner', clock()) });
    } catch (err) {
      return next(err);
    }
  });

  router.get('/:id', viewer, async (req, res, next) => {
    try {
      if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: 'not_found' });
      const row = await breeding.get(req.params.id);
      if (!row) return res.status(404).json({ error: 'not_found' });
      const level = levelFor(req.viewerUser, row);
      if (row.status !== 'approved' && level !== 'owner' && level !== 'staff') return res.status(404).json({ error: 'not_found' });
      return res.json({ listing: shape(row, level, clock()) });
    } catch (err) {
      return next(err);
    }
  });

  router.put('/:id', requireAuth, async (req, res, next) => {
    try {
      if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: 'not_found' });
      const row = await breeding.get(req.params.id);
      if (!row || String(row.owner_id) !== String(req.user.id)) return res.status(404).json({ error: 'not_found' });
      if (row.status === 'sold' || row.status === 'withdrawn') return res.status(409).json({ error: 'closed' });
      const { values, errors } = validateBreedingListing(req.body, clock());
      if (errors) return res.status(400).json({ error: 'validation', fields: errors });
      const placeErrors = await applyLocation(geo, values);
      if (placeErrors) return res.status(400).json({ error: 'validation', fields: placeErrors });
      const updated = await breeding.update(row.id, values);
      return res.json({ listing: shape(updated, 'owner', clock()) });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/:id/close', requireAuth, async (req, res, next) => {
    try {
      if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: 'not_found' });
      const status = (req.body || {}).status;
      if (status !== 'sold' && status !== 'withdrawn') return res.status(400).json({ error: 'validation', fields: { status: 'Choose sold or withdrawn.' } });
      const row = await breeding.get(req.params.id);
      if (!row || String(row.owner_id) !== String(req.user.id)) return res.status(404).json({ error: 'not_found' });
      if (!(await breeding.close(row.id, status))) return res.status(409).json({ error: 'closed' });
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/:id/review', staffOnly, async (req, res, next) => {
    try {
      if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: 'not_found' });
      const r = readReview(req.body);
      if (r.errors) return res.status(400).json({ error: 'validation', fields: r.errors });
      const row = await breeding.get(req.params.id);
      if (!row) return res.status(404).json({ error: 'not_found' });
      const ok = await breeding.review(row.id, { decision: r.decision, note: r.note, reviewerId: req.user.id });
      if (!ok) return res.status(409).json({ error: 'wrong_status' });
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = { createBreedingListingsRouter, validateBreedingListing, shape, headlineFor, epdFilters, SEX_CLASSES, SALE_TYPES };
