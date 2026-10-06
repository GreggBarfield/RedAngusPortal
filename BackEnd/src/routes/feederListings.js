'use strict';
const express = require('express');
const { createLimiter } = require('../rateLimit');
const {
  COUNTRIES,
  ID_RE,
  DAY,
  text,
  parseDate,
  toList,
  checker,
  applyLocation,
  readCenter,
  ageMonths,
  daysSince,
  createAccess,
  readReview,
  sortDir,
} = require('../common');

const METHODS = ['auction', 'off_ranch', 'video_auction'];
const SORTS = ['marketingDate', 'headCount', 'weight', 'newest', 'distance'];
const GROUP_RE = /^[A-Za-z0-9][A-Za-z0-9 _\-]{0,39}$/;
const TAG_RE = /^[A-Za-z0-9 \-]{1,50}$/;
const TAG_MSG = 'Use letters, numbers, spaces and dashes (up to 50).';

function plural(n, one, many) {
  return n === 1 ? one : many;
}

function headlineFor(v) {
  const sc = v.steerCount;
  const hc = v.heiferCount;
  const steers = `${sc} ${plural(sc, 'steer', 'steers')}`;
  const heifers = `${hc} ${plural(hc, 'heifer', 'heifers')}`;
  const counts = sc > 0 && hc > 0 ? `${steers} and ${heifers}` : sc > 0 ? steers : heifers;
  const bits = [];
  if (v.breeds && v.breeds[0]) bits.push(v.breeds[0]);
  if (v.avgWeight) bits.push(`${v.avgWeight} lbs`);
  return (bits.length ? `${counts} - ${bits.join(', ')}` : counts).slice(0, 150);
}

// Optional breed makeup: a mode (percent or head count) and one amount per chosen breed.
// Amounts come as { "Red Angus": "75", ... }. The totals are not enforced here (the form only warns).
function breedMakeup(b, v, errors) {
  v.breedMode = null;
  v.breedAmounts = (v.breeds || []).map(() => null);
  const mode = b.breedMode == null || b.breedMode === '' ? null : b.breedMode;
  if (mode !== null && mode !== 'percent' && mode !== 'head') {
    errors.breedMode = 'Choose percent or head count.';
    return;
  }
  if (mode === null || errors.breeds) return;
  const raw = b.breedAmounts;
  if (raw != null && (typeof raw !== 'object' || Array.isArray(raw))) {
    errors.breedAmounts = 'Check the breed amounts.';
    return;
  }
  const byName = new Map(Object.entries(raw || {}).map(([k, val]) => [k.trim().toLowerCase(), val]));
  const out = [];
  for (const name of v.breeds) {
    const val = byName.get(name.toLowerCase());
    if (val == null || String(val).trim() === '') {
      out.push(null);
      continue;
    }
    const t = String(val).trim();
    const okFormat = mode === 'head' ? /^\d{1,4}$/.test(t) : /^\d{1,3}(\.\d{1,2})?$/.test(t);
    const n = Number(t);
    if (!okFormat || !(n > 0) || (mode === 'percent' && n > 100) || (mode === 'head' && n > 5000)) {
      errors.breedAmounts = mode === 'percent' ? `Enter a percent from 1 to 100 for ${name}.` : `Enter a head count for ${name}.`;
      return;
    }
    out.push(n);
  }
  v.breedMode = mode;
  v.breedAmounts = out;
}

// Returns { values } with every column filled in (null when blank), or { errors }.
function validateFeederListing(body, now = new Date()) {
  const c = checker(body, now);
  const { b, errors, v } = c;

  c.pattern('groupId', GROUP_RE, 'Use letters, numbers, spaces, dashes and underscores (up to 40).', true, 'a group identifier');
  v.groupIdOptout = b.groupIdOptout === true;

  c.int('steerCount', 0, 5000, 'the number of steers (enter 0 if none)', true);
  c.int('heiferCount', 0, 5000, 'the number of heifers', false);
  if (!errors.heiferCount && v.heiferCount == null) v.heiferCount = 0;
  if (!errors.steerCount && !errors.heiferCount && v.steerCount + v.heiferCount < 1) {
    errors.steerCount = 'Enter at least one steer or heifer.';
  }
  c.int('avgWeightSteers', 150, 1500, 'a weight', false);
  c.int('avgWeightHeifers', 150, 1500, 'a weight', false);

  c.dateWindow('birthDate', { pastDays: 365 * 30, futureDays: 0, required: false, label: 'a date', message: 'Check the birth date.' });
  c.dateWindow('weanDate', { pastDays: 365 * 30, futureDays: 365, required: false, label: 'a date', message: 'Check the wean date.' });
  if (!errors.birthDate && !errors.weanDate && v.birthDate && v.weanDate && v.weanDate < v.birthDate) {
    errors.weanDate = 'The wean date cannot be before the birth date.';
  }
  c.opt('vetName', 100);

  const bc = text(b.birthCountry);
  if (bc === undefined) errors.birthCountry = 'Choose a country.';
  else if (bc === null) v.birthCountry = 'United States';
  else if (!COUNTRIES.includes(bc)) errors.birthCountry = 'Choose a country from the list.';
  else v.birthCountry = bc;

  c.names('breeds', { min: 1, max: 10, itemMax: 100, label: 'at least one breed' });
  breedMakeup(b, v, errors);
  c.names('preconditioning', { min: 0, max: 10, itemMax: 100, label: 'a program' });
  c.names('special', { min: 0, max: 10, itemMax: 100, label: 'a program' });
  c.opt('description', 4000);
  c.opt('nutrition', 2000);

  // Vaccination / medication rows: blank rows are dropped.
  if (b.vaccinations != null && !Array.isArray(b.vaccinations)) {
    errors.vaccinations = 'Check the vaccination list.';
  } else {
    const out = [];
    let bad = null;
    (b.vaccinations || []).forEach((row, i) => {
      if (bad) return;
      const n = i + 1;
      if (!row || typeof row !== 'object') {
        bad = `Vaccination row ${n} is not valid.`;
        return;
      }
      const product = text(row.product);
      const date = text(row.date);
      if (product === undefined || date === undefined) {
        bad = `Vaccination row ${n} is not valid.`;
        return;
      }
      if (product === null && date === null) return;
      if (product === null) {
        bad = `Vaccination row ${n}: choose the product given.`;
        return;
      }
      if (product.length > 200) {
        bad = `Vaccination row ${n}: use 200 characters or fewer.`;
        return;
      }
      let d = null;
      if (date !== null) {
        const pd = parseDate(date);
        if (!pd || pd < new Date('2000-01-01T00:00:00Z') || pd > new Date(now.getTime() + 365 * DAY)) {
          bad = `Vaccination row ${n}: check the date.`;
          return;
        }
        d = date;
      }
      out.push({ date: d, product });
    });
    if (!bad && out.length > 30) bad = 'List up to 30 vaccinations.';
    if (bad) errors.vaccinations = bad;
    else v.vaccinations = out;
  }

  c.choice('marketingMethod', METHODS, 'a marketing method', true);
  c.auction();
  c.dateWindow('marketingDate', {
    pastDays: 7,
    futureDays: 730,
    required: true,
    label: 'the marketing date',
    message: 'Enter a marketing date within the next two years.',
  });

  c.pattern('tagVisualStart', TAG_RE, TAG_MSG, false);
  c.pattern('tagVisualEnd', TAG_RE, TAG_MSG, false);
  c.pattern('tagEidStart', TAG_RE, TAG_MSG, false);
  c.pattern('tagEidEnd', TAG_RE, TAG_MSG, false);

  c.place();
  c.price(true);
  c.contact();

  // Weight for the whole group, from whichever sexes have a weight (weighted by head).
  if (!errors.steerCount && !errors.heiferCount && !errors.avgWeightSteers && !errors.avgWeightHeifers) {
    let total = 0;
    let sum = 0;
    if (v.avgWeightSteers && v.steerCount > 0) {
      total += v.steerCount;
      sum += v.avgWeightSteers * v.steerCount;
    }
    if (v.avgWeightHeifers && v.heiferCount > 0) {
      total += v.heiferCount;
      sum += v.avgWeightHeifers * v.heiferCount;
    }
    v.avgWeight = total > 0 ? Math.round(sum / total) : null;
    if (!errors.breeds) v.headline = headlineFor(v);
  }
  return c.result();
}

// level: 'public' | 'member' (signed in) | 'owner' | 'staff'
function shape(row, level, now = new Date()) {
  const owner = level === 'owner' || level === 'staff';
  const programs = row.programs || [];
  const out = {
    id: String(row.id),
    groupId: row.group_id_optout && !owner ? null : row.group_id,
    headline: row.headline,
    steerCount: row.steer_count,
    heiferCount: row.heifer_count,
    headCount: row.head_count,
    avgWeightSteers: row.avg_weight_steers,
    avgWeightHeifers: row.avg_weight_heifers,
    avgWeight: row.avg_weight,
    birthDate: row.birth_date,
    ageMonths: ageMonths(row.birth_date, now),
    weanDate: row.wean_date,
    daysWeaned: daysSince(row.wean_date, now),
    vetName: row.vet_name,
    birthCountry: row.birth_country,
    description: row.description,
    nutrition: row.nutrition,
    breeds: row.breeds || [],
    breedMode: row.breed_mode || null,
    breedDetails: (row.breeds || []).map((name, i) => ({ name, amount: row.breed_amounts && row.breed_amounts[i] != null ? row.breed_amounts[i] : null })),
    preconditioning: programs.filter((p) => p.type === 'PC').map((p) => p.name),
    special: programs.filter((p) => p.type === 'SP').map((p) => p.name),
    vaccinations: row.vaccinations || [],
    marketingMethod: row.marketing_method,
    auctionNo: row.auction_no,
    auctionName: row.auction_name,
    marketingDate: row.marketing_date,
    city: row.city,
    state: row.state,
    priceBasis: row.price_basis,
    askingPrice: row.asking_price,
    callForPrice: row.call_for_price,
    status: row.status,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    photos: row.photos || [],
    attachmentCount: (row.attachments || []).length,
  };
  if (row.distance_miles != null) out.distanceMiles = Math.round(row.distance_miles);
  if (level === 'public') return out;
  out.attachments = row.attachments || [];
  out.tagVisualStart = row.tag_visual_start;
  out.tagVisualEnd = row.tag_visual_end;
  out.tagEidStart = row.tag_eid_start;
  out.tagEidEnd = row.tag_eid_end;
  out.contactName = row.contact_name;
  out.contactPhone = row.contact_phone;
  out.contactEmail = row.contact_email;
  out.sellerName = row.owner_name;
  out.mine = level === 'owner';
  if (owner) {
    out.groupIdOptout = row.group_id_optout;
    out.zip = row.zip;
    out.reviewNote = row.review_note;
    out.updatedAt = row.updated_at;
  }
  return out;
}

function dateParam(v) {
  return typeof v === 'string' && parseDate(v.trim()) ? v.trim() : '';
}

function numberParam(v, max) {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : 0;
}

function createFeederListingsRouter({ feeders, users, config, geo, datasheet, now }) {
  const router = express.Router();
  const { requireAuth, staffOnly, viewer, levelFor } = createAccess({ users, config });
  const createLimit = createLimiter({ max: 20, windowMs: DAY, now });
  const sheetLimit = createLimiter({ max: 60, windowMs: 60 * 60 * 1000, now });
  const clock = () => (now ? new Date(now()) : new Date());

  router.get('/', viewer, async (req, res, next) => {
    try {
      const qy = req.query;
      const stRaw = typeof qy.state === 'string' ? qy.state.trim().toUpperCase() : '';
      const loc = await readCenter(geo, qy);
      if (loc.error) return res.status(400).json({ error: 'validation', fields: loc.error });
      const page = Math.max(1, Math.min(10000, parseInt(qy.page, 10) || 1));
      const pageSize = Math.max(1, Math.min(50, parseInt(qy.pageSize, 10) || 20));
      const { total, rows } = await feeders.list({
        q: typeof qy.q === 'string' ? qy.q.trim().slice(0, 100) : '',
        state: /^[A-Z]{2}$/.test(stRaw) ? stRaw : '',
        breeds: toList(qy.breed).slice(0, 10).map((s) => s.slice(0, 100)),
        programs: toList(qy.program).slice(0, 10).map((s) => s.slice(0, 100)),
        method: METHODS.includes(qy.method) ? qy.method : '',
        dateFrom: dateParam(qy.dateFrom),
        dateTo: dateParam(qy.dateTo),
        tagged: qy.tagged === '1' || qy.tagged === 'true',
        minWeight: numberParam(qy.minWeight, 5000),
        maxWeight: numberParam(qy.maxWeight, 5000),
        minAge: numberParam(qy.minAge, 400),
        maxAge: numberParam(qy.maxAge, 400),
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
      const rows = await feeders.mine(req.user.id);
      const t = clock();
      res.json({ listings: rows.map((r) => shape(r, 'owner', t)) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/queue', staffOnly, async (req, res, next) => {
    try {
      const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
      const rows = await feeders.queue(status);
      const t = clock();
      res.json({ listings: rows.map((r) => shape(r, 'staff', t)) });
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
      const { values, errors } = validateFeederListing(req.body, clock());
      if (errors) return res.status(400).json({ error: 'validation', fields: errors });
      const placeErrors = await applyLocation(geo, values);
      if (placeErrors) return res.status(400).json({ error: 'validation', fields: placeErrors });
      createLimit.record(String(req.user.id));
      const row = await feeders.create(req.user.id, values);
      return res.status(201).json({ listing: shape(row, 'owner', clock()) });
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
      return res.json({ listing: shape(row, level, clock()) });
    } catch (err) {
      return next(err);
    }
  });

  // The Cattle Data Fact Sheet (PDF). Signed-in members only, because it carries the seller's
  // phone and email. Same rule as the listing: only an approved listing is open to everyone;
  // the owner and staff can also get the sheet of a listing that is not approved. The sheet is
  // always built as a member sees the listing (no zip code, and a hidden group ID stays hidden).
  router.get('/:id/datasheet', viewer, async (req, res, next) => {
    try {
      if (!req.viewerUser) return res.status(401).json({ error: 'unauthorized' });
      if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: 'not_found' });
      const row = await feeders.get(req.params.id);
      if (!row) return res.status(404).json({ error: 'not_found' });
      const level = levelFor(req.viewerUser, row);
      if (row.status !== 'approved' && level !== 'owner' && level !== 'staff') return res.status(404).json({ error: 'not_found' });
      if (!datasheet || !datasheet.available()) return res.status(503).json({ error: 'datasheet_not_available' });
      const key = String(req.viewerUser.id);
      if (sheetLimit.isBlocked(key)) return res.status(429).json({ error: 'too_many_requests' });
      sheetLimit.record(key);
      let pdf;
      try {
        pdf = await datasheet.build(shape(row, 'member', clock()));
      } catch (err) {
        console.error('datasheet failed:', err.message);
        return res.status(502).json({ error: 'datasheet_failed' });
      }
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${datasheet.filename(row)}"`,
        'Content-Length': String(pdf.length),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      });
      return res.end(pdf);
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
      const { values, errors } = validateFeederListing(req.body, clock());
      if (errors) return res.status(400).json({ error: 'validation', fields: errors });
      const placeErrors = await applyLocation(geo, values);
      if (placeErrors) return res.status(400).json({ error: 'validation', fields: placeErrors });
      const updated = await feeders.update(row.id, values);
      return res.json({ listing: shape(updated, 'owner', clock()) });
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
      const r = readReview(req.body);
      if (r.errors) return res.status(400).json({ error: 'validation', fields: r.errors });
      const row = await feeders.get(req.params.id);
      if (!row) return res.status(404).json({ error: 'not_found' });
      const ok = await feeders.review(row.id, { decision: r.decision, note: r.note, reviewerId: req.user.id });
      if (!ok) return res.status(409).json({ error: 'wrong_status' });
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = { createFeederListingsRouter, validateFeederListing, shape, headlineFor, METHODS };
