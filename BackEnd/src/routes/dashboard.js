'use strict';
const express = require('express');
const { createRequireAuth, requireRole } = require('../auth');

// GET /api/dashboard - the staff dashboard numbers, all in one answer. Staff only.
function createDashboardRouter({ dashboard, users, config }) {
  const router = express.Router();
  const secret = config.jwtSecret;
  const usable = Boolean(secret) && secret.length >= 32;
  const requireAuth = createRequireAuth({ users, secret: usable ? secret : '' });

  router.get('/', requireAuth, requireRole('staff'), async (req, res, next) => {
    try {
      const [overview, barns] = await Promise.all([dashboard.overview(), dashboard.barns()]);
      res.set('Cache-Control', 'no-store');
      res.json({ dashboard: { ...overview, barns } });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createDashboardRouter };
