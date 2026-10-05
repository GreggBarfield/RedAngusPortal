'use strict';
const express = require('express');
const { createLimiter } = require('../rateLimit');
const { COUNTRIES, DAY, createAccess } = require('../common');

// Names sellers add go into BTN's shared lists, so only plain characters are allowed.
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 .,&'()/#+%\-]{1,99}$/;

function cleanName(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/\s+/g, ' ');
  return NAME_RE.test(t) ? t : null;
}

// BARFIELD100 style suggestion: last word of the name plus a number that goes up with each listing.
function suggestGroupId(displayName, listingCount) {
  const last = String(displayName || '').trim().split(/\s+/).pop() || '';
  const letters = last.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 20);
  return `${letters || 'RAA'}${100 + listingCount}`;
}

function createRefRouter({ ref, users, config, groupCounter, now }) {
  const router = express.Router();
  const { requireAuth } = createAccess({ users, config });
  const addLimit = createLimiter({ max: 30, windowMs: DAY, now });

  function needRef(req, res, next) {
    if (!ref.available()) return res.status(503).json({ error: 'reference_not_configured' });
    return next();
  }

  router.get('/countries', (req, res) => res.json({ countries: COUNTRIES }));

  router.get('/breeds', needRef, async (req, res, next) => {
    try {
      res.json({ breeds: await ref.breeds() });
    } catch (err) {
      next(err);
    }
  });

  router.get('/programs', needRef, async (req, res, next) => {
    try {
      const type = req.query.type === 'PC' || req.query.type === 'SP' ? req.query.type : '';
      res.json({ programs: await ref.programs(type) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/epd-traits', needRef, async (req, res, next) => {
    try {
      res.json({ traits: await ref.epdTraits() });
    } catch (err) {
      next(err);
    }
  });

  router.get('/vaccine-products', needRef, async (req, res, next) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
      res.json({ products: await ref.vaccineProducts(q) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/auctions', needRef, async (req, res, next) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
      res.json({ auctions: await ref.auctions(q) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/zip/:zip', needRef, async (req, res, next) => {
    try {
      if (!/^\d{5}$/.test(req.params.zip)) return res.status(404).json({ error: 'not_found' });
      const z = await ref.zip(req.params.zip);
      if (!z) return res.status(404).json({ error: 'not_found' });
      return res.json(z);
    } catch (err) {
      return next(err);
    }
  });

  router.get('/group-id', requireAuth, async (req, res, next) => {
    try {
      const n = groupCounter ? await groupCounter(req.user.id) : 0;
      res.json({ groupId: suggestGroupId(req.user.display_name, n) });
    } catch (err) {
      next(err);
    }
  });

  // "Add Product Not Listed": saved in BTN's list too.
  router.post('/vaccine-products', requireAuth, needRef, async (req, res, next) => {
    try {
      const b = req.body || {};
      const name = cleanName(b.name);
      if (!name) {
        return res.status(400).json({ error: 'validation', fields: { name: 'Use 2 to 100 letters, numbers and common punctuation.' } });
      }
      let company = null;
      if (b.company != null && b.company !== '') {
        company = cleanName(b.company);
        if (!company) return res.status(400).json({ error: 'validation', fields: { company: 'Use 2 to 100 letters, numbers and common punctuation.' } });
      }
      if (addLimit.isBlocked(String(req.user.id))) return res.status(429).json({ error: 'too_many_requests' });
      const r = await ref.addVaccineProduct({ name, company });
      if (r.created) addLimit.record(String(req.user.id));
      return res.status(r.created ? 201 : 200).json({ product: r.product, created: r.created });
    } catch (err) {
      return next(err);
    }
  });

  // "Add Auction Not Listed": saved in BTN's list too.
  router.post('/auctions', requireAuth, needRef, async (req, res, next) => {
    try {
      const b = req.body || {};
      const name = cleanName(b.name);
      if (!name) {
        return res.status(400).json({ error: 'validation', fields: { name: 'Use 2 to 100 letters, numbers and common punctuation.' } });
      }
      let zip = null;
      if (b.zip != null && b.zip !== '') {
        zip = typeof b.zip === 'string' ? b.zip.trim() : '';
        if (!/^\d{5}$/.test(zip)) return res.status(400).json({ error: 'validation', fields: { zip: 'Enter a 5-digit zip code.' } });
      }
      if (addLimit.isBlocked(String(req.user.id))) return res.status(429).json({ error: 'too_many_requests' });
      const r = await ref.addAuction({ name, zip });
      if (r.created) addLimit.record(String(req.user.id));
      return res.status(r.created ? 201 : 200).json({ auction: r.auction, created: r.created });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = { createRefRouter, suggestGroupId, cleanName };
