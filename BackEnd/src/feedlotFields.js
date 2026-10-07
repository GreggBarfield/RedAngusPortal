'use strict';
// Checking and tidying the fields of a feedlot. Used by the feedlot routes and by the
// one-time import, so both apply exactly the same rules.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FAX_RE = /^[0-9 ()+.\-]{7,30}$/;
const PHONE_RE = /^[0-9 ()+.\-;,/extEXT]+$/;
const ZIP_RE = /^[0-9]{5}(-[0-9]{4})?$/;
const WEBSITE_RE = /^(https?:\/\/)?[^\s/]+\.[^\s/]+(\/\S*)?$/i;

const MAX_EMAILS = 5;

// Every field staff can send, with the longest text each may hold.
const TEXT_LIMITS = {
  name: 150,
  contactName: 150,
  address: 200,
  city: 100,
  phone: 100,
  fax: 100,
  website: 200,
  notes: 2000,
  doNotEmailNote: 500,
};

const FIELD_KEYS = ['name', 'contactName', 'address', 'city', 'state', 'zip', 'phone', 'emails', 'fax', 'website', 'notes', 'enabled', 'doNotEmail', 'doNotEmailNote'];

// '' and spaces mean nothing. A value that is not text at all is invalid (undefined).
function clean(v) {
  if (v == null) return null;
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? null : t;
}

// Accepts a list or one piece of text with addresses separated by commas, semicolons,
// spaces or new lines. Returns { emails } (lower case, no repeats) or { error }.
function parseEmails(input) {
  if (input == null) return { emails: [] };
  let parts;
  if (Array.isArray(input)) {
    if (input.some((x) => typeof x !== 'string')) return { error: 'Enter email addresses as text.' };
    parts = input.flatMap((x) => x.split(/[;,\s]+/));
  } else if (typeof input === 'string') {
    parts = input.split(/[;,\s]+/);
  } else {
    return { error: 'Enter email addresses as text.' };
  }
  const out = [];
  for (const raw of parts) {
    const e = raw.trim().toLowerCase();
    if (e === '') continue;
    if (e.length > 254 || !EMAIL_RE.test(e)) return { error: `"${raw.trim().slice(0, 60)}" is not a valid email address.` };
    if (!out.includes(e)) out.push(e);
  }
  if (out.length > MAX_EMAILS) return { error: `Use ${MAX_EMAILS} email addresses or fewer.` };
  return { emails: out };
}

// Returns { values } (only the fields that were sent, tidied) or { errors } (a message per field).
// partial = true for an edit (nothing is required); false for a new feedlot (name and state are).
function validateFeedlot(input, { partial = false } = {}) {
  const errors = {};
  const values = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { errors: { _: 'Nothing to save.' } };

  for (const key of Object.keys(TEXT_LIMITS)) {
    if (!(key in input)) continue;
    const v = clean(input[key]);
    if (v === undefined) {
      errors[key] = 'Enter text.';
    } else if (v !== null && v.length > TEXT_LIMITS[key]) {
      errors[key] = `Use ${TEXT_LIMITS[key]} characters or fewer.`;
    } else {
      values[key] = v;
    }
  }
  if ('name' in values && values.name === null) errors.name = 'Enter the feedlot name.';

  if ('phone' in values && values.phone !== null && (!PHONE_RE.test(values.phone) || values.phone.replace(/\D/g, '').length < 7)) {
    errors.phone = 'Enter a phone number with area code. Separate more than one with a semicolon.';
  }
  if ('fax' in values && values.fax !== null) {
    const n = values.fax.replace(/\D/g, '').length;
    if (!FAX_RE.test(values.fax) || n < 10 || n > 15) errors.fax = 'Enter one fax number with area code (10 to 15 digits).';
  }
  if ('website' in values && values.website !== null && !WEBSITE_RE.test(values.website)) {
    errors.website = 'Enter a website address like www.example.com.';
  }

  if ('state' in input) {
    const s = clean(input.state);
    if (s === undefined || s === null || !/^[A-Za-z]{2}$/.test(s)) errors.state = 'Enter the 2-letter state.';
    else values.state = s.toUpperCase();
  }
  if ('zip' in input) {
    const z = clean(input.zip);
    if (z === undefined) errors.zip = 'Enter the zip code.';
    else if (z !== null && !ZIP_RE.test(z)) errors.zip = 'Enter a 5-digit zip (or 5 digits, a dash, and 4 more).';
    else values.zip = z;
  }
  if ('emails' in input) {
    const r = parseEmails(input.emails);
    if (r.error) errors.emails = r.error;
    else values.emails = r.emails;
  }
  for (const key of ['enabled', 'doNotEmail']) {
    if (!(key in input)) continue;
    if (typeof input[key] !== 'boolean') errors[key] = 'Choose yes or no.';
    else values[key] = input[key];
  }

  if (!partial) {
    if (!('name' in input) || !values.name) errors.name = errors.name || 'Enter the feedlot name.';
    if (!('state' in input)) errors.state = 'Enter the 2-letter state.';
  }
  if (Object.keys(errors).length > 0) return { errors };
  if (Object.keys(values).length === 0) return { errors: { _: 'Nothing to save.' } };
  return { values };
}

// A link for a website that may have been typed without http.
function websiteHref(w) {
  if (!w) return null;
  const t = String(w).trim();
  if (!WEBSITE_RE.test(t)) return null;
  return /^https?:\/\//i.test(t) ? t : 'https://' + t;
}

module.exports = { validateFeedlot, parseEmails, websiteHref, clean, FIELD_KEYS, MAX_EMAILS, EMAIL_RE };
