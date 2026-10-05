'use strict';
// Helpers shared by the feeder and breeding listing code: field checking,
// the signed-in viewer, search pieces and the distance formula.
const { verifyToken, createRequireAuth, requireRole } = require('./auth');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9 ()+.\-]{7,30}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^\d{1,12}$/;
const DAY = 86400000;

// Countries in the Country of Birth list (same list as BlockTrust).
const COUNTRIES = [
  'United States', 'Argentina', 'Australia', 'Bangladesh', 'Brazil', 'Canada', 'China', 'Colombia', 'Ethiopia',
  'France', 'India', 'Kenya', 'Mexico', 'Nigeria', 'Pakistan', 'Russia', 'Sudan', 'Tanzania', 'Turkey', 'Venezuela',
];

function text(v) {
  if (v == null) return null;
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? null : t;
}

function parseDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return null;
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

// Query-string value (one value or a repeated one) -> list of non-empty strings.
function toList(v) {
  const arr = Array.isArray(v) ? v : v == null ? [] : [v];
  return arr.filter((x) => typeof x === 'string').map((x) => x.trim()).filter(Boolean);
}

function likePattern(q) {
  return '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
}

// Collects values and per-field messages while a form body is checked.
function checker(body, now) {
  const b = body && typeof body === 'object' ? body : {};
  const errors = {};
  const v = {};
  const c = {
    b,
    errors,
    v,
    now,

    req(key, label, max) {
      const t = text(b[key]);
      if (t === undefined || t === null) errors[key] = `Enter ${label}.`;
      else if (t.length > max) errors[key] = `Use ${max} characters or fewer.`;
      else v[key] = t;
    },

    opt(key, max) {
      const t = text(b[key]);
      if (t === undefined) errors[key] = 'Enter text.';
      else if (t !== null && t.length > max) errors[key] = `Use ${max} characters or fewer.`;
      else v[key] = t;
    },

    // text that must match a pattern when given
    pattern(key, re, message, required, label) {
      const t = text(b[key]);
      if (t === undefined) errors[key] = 'Enter text.';
      else if (t === null) {
        if (required) errors[key] = `Enter ${label}.`;
        else v[key] = null;
      } else if (!re.test(t)) errors[key] = message;
      else v[key] = t;
    },

    int(key, min, max, label, required) {
      const r = intIn(b[key], min, max);
      if (r.error) errors[key] = r.error;
      else if (r.value == null && required) errors[key] = `Enter ${label}.`;
      else v[key] = r.value;
    },

    choice(key, list, label, mustHave) {
      const t = text(b[key]);
      if (t === null || t === undefined) {
        if (mustHave) errors[key] = `Choose ${label}.`;
        else v[key] = null;
      } else if (!list.includes(t)) errors[key] = `Choose ${label}.`;
      else v[key] = t;
    },

    // A date that must fall between (now - pastDays) and (now + futureDays).
    dateWindow(key, { pastDays, futureDays, required, label, message }) {
      const t = text(b[key]);
      if (t === undefined) errors[key] = 'Enter a date.';
      else if (t === null) {
        if (required) errors[key] = `Enter ${label}.`;
        else v[key] = null;
      } else {
        const d = parseDate(t);
        const lo = new Date(now.getTime() - pastDays * DAY);
        const hi = new Date(now.getTime() + futureDays * DAY);
        if (!d || d < lo || d > hi) errors[key] = message;
        else v[key] = t;
      }
    },

    // List of strings (breeds, programs). Duplicates are dropped, case ignored.
    names(key, { min, max, itemMax, label }) {
      const raw = b[key];
      if (raw != null && !Array.isArray(raw)) {
        errors[key] = 'Choose from the list.';
        return;
      }
      const out = [];
      const seen = new Set();
      for (const item of raw || []) {
        if (typeof item !== 'string') {
          errors[key] = 'Choose from the list.';
          return;
        }
        const t = item.trim();
        if (!t) continue;
        if (t.length > itemMax) {
          errors[key] = `Each entry can be up to ${itemMax} characters.`;
          return;
        }
        if (seen.has(t.toLowerCase())) continue;
        seen.add(t.toLowerCase());
        out.push(t);
      }
      if (out.length < min) errors[key] = `Choose ${label}.`;
      else if (out.length > max) errors[key] = `Choose up to ${max}.`;
      else v[key] = out;
    },

    // State, zip and (optional) city of the cattle.
    place() {
      c.opt('city', 60);
      const st = typeof b.state === 'string' ? b.state.trim().toUpperCase() : '';
      if (!/^[A-Z]{2}$/.test(st)) errors.state = 'Enter the 2-letter state.';
      else v.state = st;
      const zip = typeof b.zip === 'string' ? b.zip.trim() : '';
      if (!/^\d{5}$/.test(zip)) errors.zip = 'Enter a 5-digit zip code.';
      else v.zip = zip;
    },

    // Asking price. withBasis = per hundredweight / per head choice (feeders).
    price(withBasis) {
      v.callForPrice = b.callForPrice === true;
      const hasPrice = !(b.askingPrice == null || b.askingPrice === '');
      if (v.callForPrice || !hasPrice) {
        v.askingPrice = null;
        if (withBasis) v.priceBasis = null;
        return;
      }
      const n = Number(String(b.askingPrice).replace(/[$,\s]/g, ''));
      let cap = 1000000;
      if (withBasis) {
        const basis = text(b.priceBasis);
        if (!['per_cwt', 'per_head'].includes(basis)) errors.priceBasis = 'Choose per hundredweight or per head.';
        v.priceBasis = ['per_cwt', 'per_head'].includes(basis) ? basis : null;
        cap = basis === 'per_head' ? 20000 : 1000;
      }
      if (!Number.isFinite(n) || n <= 0 || n > cap) errors.askingPrice = 'Enter a price in dollars, or choose call for price.';
      else v.askingPrice = Math.round(n * 100) / 100;
    },

    contact() {
      c.req('contactName', 'a contact name', 100);
      const ph = text(b.contactPhone);
      const digits = ph ? ph.replace(/\D/g, '').length : 0;
      if (!ph || !PHONE_RE.test(ph) || digits < 10 || digits > 15) errors.contactPhone = 'Enter a phone number with area code.';
      else v.contactPhone = ph;
      const em = text(b.contactEmail);
      if (!em || em.length > 254 || !EMAIL_RE.test(em)) errors.contactEmail = 'Enter a valid email address.';
      else v.contactEmail = em.toLowerCase();
    },

    // Auction market the seller picked (or typed in): optional.
    auction() {
      c.opt('auctionName', 120);
      const r = intIn(b.auctionNo, 1, 2147483647);
      v.auctionNo = r.error ? null : r.value;
      if (!v.auctionName) v.auctionNo = null;
    },

    result() {
      if (Object.keys(errors).length > 0) return { errors };
      return { values: v };
    },
  };
  return c;
}

// Checks the zip against BTN's zip table. Adds the city, latitude and longitude
// (used for distance search) to the values. Returns field messages, or null.
async function applyLocation(geo, v) {
  v.lat = null;
  v.lon = null;
  if (!geo || !geo.available()) return null;
  const z = await geo.zip(v.zip);
  if (!z) return { zip: 'We could not find that zip code.' };
  if (z.state !== v.state) return { state: `That zip code is in ${z.state}.` };
  v.city = v.city || z.city;
  v.lat = z.lat;
  v.lon = z.lon;
  return null;
}

// Search center from ?zip=&miles= . Returns { center } , { error } or {} when not asked for.
async function readCenter(geo, query) {
  const zip = typeof query.zip === 'string' ? query.zip.trim() : '';
  const miles = parseInt(query.miles, 10);
  if (!zip && !query.miles) return {};
  if (!/^\d{5}$/.test(zip)) return { error: { zip: 'Enter a 5-digit zip code.' } };
  if (!Number.isInteger(miles) || miles < 1 || miles > 3000) return { error: { miles: 'Enter miles from 1 to 3000.' } };
  if (!geo || !geo.available()) return { error: { zip: 'Distance search is not available right now.' } };
  const z = await geo.zip(zip);
  if (!z) return { error: { zip: 'We could not find that zip code.' } };
  return { center: { lat: z.lat, lon: z.lon, miles } };
}

// Collects SQL parameters and hands back $1, $2 ... placeholders.
function params() {
  const list = [];
  return {
    list,
    add(value) {
      list.push(value);
      return '$' + list.length;
    },
  };
}

// Great-circle distance in miles between (latParam, lonParam) and the table's lat/lon columns.
function distanceSql(alias, latParam, lonParam) {
  return `(3958.8 * 2 * asin(LEAST(1, sqrt(
    power(sin(radians(${alias}.lat::float8 - ${latParam}::float8) / 2), 2) +
    cos(radians(${latParam}::float8)) * cos(radians(${alias}.lat::float8)) *
    power(sin(radians(${alias}.lon::float8 - ${lonParam}::float8) / 2), 2)))))`;
}

// Whole months between a birth date and today.
function ageMonths(dateText, now = new Date()) {
  const d = parseDate(dateText);
  if (!d) return null;
  let m = (now.getUTCFullYear() - d.getUTCFullYear()) * 12 + (now.getUTCMonth() - d.getUTCMonth());
  if (now.getUTCDate() < d.getUTCDate()) m -= 1;
  return m < 0 ? null : m;
}

function daysSince(dateText, now = new Date()) {
  const d = parseDate(dateText);
  if (!d) return null;
  const n = Math.floor((now.getTime() - d.getTime()) / DAY);
  return n < 0 ? null : n;
}

// Signed-in viewer (optional) and the login checks for the routes.
function createAccess({ users, config }) {
  const secret = config.jwtSecret;
  const usable = Boolean(secret) && secret.length >= 32;
  const requireAuth = createRequireAuth({ users, secret: usable ? secret : '' });
  const staffOnly = [requireAuth, requireRole('staff')];

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

  // 'public' | 'member' (signed in) | 'owner' | 'staff'
  function levelFor(user, row) {
    if (!user) return 'public';
    if (String(row.owner_id) === String(user.id)) return 'owner';
    if (user.role === 'staff') return 'staff';
    return 'member';
  }

  return { requireAuth, staffOnly, viewer, levelFor };
}

// Staff decision body shared by both review routes. Returns { decision, note } or { errors }.
function readReview(body) {
  const b = body || {};
  if (b.decision !== 'approve' && b.decision !== 'reject') return { errors: { decision: 'Choose approve or reject.' } };
  let note = null;
  if (b.note != null && b.note !== '') {
    if (typeof b.note !== 'string' || b.note.length > 1000) return { errors: { note: 'Use 1000 characters or fewer.' } };
    note = b.note.trim() || null;
  }
  if (b.decision === 'reject' && !note) return { errors: { note: 'Tell the seller why.' } };
  return { decision: b.decision, note };
}

const SORT_DIRS = ['asc', 'desc'];
function sortDir(v) {
  return SORT_DIRS.includes(v) ? v : 'desc';
}

module.exports = {
  COUNTRIES,
  ID_RE,
  DAY,
  text,
  parseDate,
  intIn,
  toList,
  likePattern,
  checker,
  applyLocation,
  readCenter,
  params,
  distanceSql,
  ageMonths,
  daysSince,
  createAccess,
  readReview,
  sortDir,
};
