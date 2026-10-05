'use strict';
const express = require('express');
const defaultConfig = require('./config');
const { createUsersRepo } = require('./users');
const { createAuthRouter } = require('./routes/auth');
const { createBarnsRouter } = require('./routes/barns');
const { createBtn } = require('./btn');
const { createBarnsRepo } = require('./barns');
const { createListingsRouter } = require('./routes/listings');
const { createListingsRepo } = require('./listings');
const { createFeedersRouter } = require('./routes/feeders');
const { createFeedersRepo } = require('./feeders');
const { createRefRepo } = require('./ref');
const { createRefRouter } = require('./routes/ref');
const { createFeederListingsRepo } = require('./feederListings');
const { createFeederListingsRouter } = require('./routes/feederListings');
const { createBreedingListingsRepo } = require('./breedingListings');
const { createBreedingListingsRouter } = require('./routes/breedingListings');
const { createSavedFiltersRepo } = require('./savedFilters');
const { createSavedFiltersRouter } = require('./routes/savedFilters');

// createApp takes the database helper (and optionally config and any repo) as
// arguments so tests can pass fakes. The old feeders/listings repos serve the
// current screens; feederListings/breedingListings serve the new forms.
function createApp({
  db,
  config = defaultConfig,
  users = createUsersRepo(db),
  btn = createBtn(config),
  barns = createBarnsRepo({ db, btn }),
  listings = createListingsRepo(db),
  feeders = createFeedersRepo(db),
  ref = createRefRepo({ btn }),
  feederListings = createFeederListingsRepo(db),
  breedingListings = createBreedingListingsRepo(db),
  savedFilters = createSavedFiltersRepo(db),
  now,
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
  app.use('/api/listings', createListingsRouter({ listings, users, config }));
  app.use('/api/feeders', createFeedersRouter({ feeders, users, config }));

  // New listing forms, pick lists from BTN, and saved searches.
  const geo = { available: () => ref.available(), zip: (z) => ref.zip(z) };
  const groupCounter = async (ownerId) =>
    (await feederListings.countByOwner(ownerId)) + (await breedingListings.countByOwner(ownerId));
  app.use('/api/ref', createRefRouter({ ref, users, config, groupCounter, now }));
  app.use('/api/feeder-listings', createFeederListingsRouter({ feeders: feederListings, users, config, geo, now }));
  app.use('/api/breeding-listings', createBreedingListingsRouter({ breeding: breedingListings, users, config, geo, now }));
  app.use('/api/saved-filters', createSavedFiltersRouter({ filters: savedFilters, users, config }));

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
