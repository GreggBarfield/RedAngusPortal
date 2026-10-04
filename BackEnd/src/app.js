'use strict';
const express = require('express');
const defaultConfig = require('./config');
const { createUsersRepo } = require('./users');
const { createAuthRouter } = require('./routes/auth');
const { createBarnsRouter } = require('./routes/barns');
const { createBtn } = require('./btn');
const { createBarnsRepo } = require('./barns');

// createApp takes the database helper (and optionally config, a users repo and
// a barns repo) as arguments so tests can pass fakes.
function createApp({
  db,
  config = defaultConfig,
  users = createUsersRepo(db),
  barns = createBarnsRepo({ db, btn: createBtn(config) }),
}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'raaaa-api', timestamp: new Date().toISOString() });
  });

  app.get('/api/health/db', async (req, res) => {
    if (!db.isConfigured()) {
      return res.status(503).json({ status: 'error', database: 'not_configured' });
    }
    try {
      await db.ping();
      return res.json({ status: 'ok', database: 'up' });
    } catch (err) {
      console.error('health/db failed:', err.message);
      return res.status(503).json({ status: 'error', database: 'down' });
    }
  });

  app.use('/api/auth', createAuthRouter({ users, config }));
  app.use('/api/barns', createBarnsRouter({ barns, users, config }));

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('unhandled error:', err);
    res.status(500).json({ error: 'server_error' });
  });

  return app;
}

module.exports = { createApp };
