'use strict';
const express = require('express');
const { createLimiter } = require('../rateLimit');
const { ZIP_RE, SLUG_RE } = require('../marketInsights');

function createMarketInsightsRouter({ insights, now }) {
  const router = express.Router();
  const limit = createLimiter({ max: 300, windowMs: 60 * 60 * 1000, now });

  // GET /api/market-insights?zip=77840&radius=200&slug_id=abc
  router.get('/', async (req, res) => {
    if (!insights.available()) return res.status(503).json({ ok: false, error: 'not_configured' });
    const zip = typeof req.query.zip === 'string' ? req.query.zip.trim() : '';
    if (!ZIP_RE.test(zip)) return res.status(400).json({ ok: false, error: 'Enter a 5-digit zip code.' });
    const slugId = typeof req.query.slug_id === 'string' ? req.query.slug_id.trim() : '';
    if (slugId && !SLUG_RE.test(slugId)) return res.status(400).json({ ok: false, error: 'Unknown market.' });

    // The site sits behind IIS, so req.ip is the proxy; use the forwarded address when there is one.
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const key = forwarded || req.ip || 'unknown';
    if (limit.isBlocked(key)) return res.status(429).json({ ok: false, error: 'Too many requests. Try again later.' });
    limit.record(key);

    try {
      res.json(await insights.lookup({ zip, radius: req.query.radius, slugId }));
    } catch (err) {
      console.error('market insights failed:', err.message);
      res.status(502).json({ ok: false, error: 'Market insights are not available right now.' });
    }
  });

  return router;
}

module.exports = { createMarketInsightsRouter };
