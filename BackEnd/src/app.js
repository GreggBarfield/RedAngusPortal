'use strict';
const express = require('express');

// createApp takes the database helper as an argument so tests can pass a fake.
function createApp({ db }) {
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
