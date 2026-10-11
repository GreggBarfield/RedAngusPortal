'use strict';
// Runs only when TEST_DATABASE_URL points at an EMPTY scratch database.
// It drops and rebuilds tables there. Never point it at the real raaaa database.
const { Client } = require('pg');
const { runMigrations } = require('../src/migrate');
const { createFeederListingsRepo } = require('../src/feederListings');
const { validateFeederListing, shape } = require('../src/routes/feederListings');

const url = process.env.TEST_DATABASE_URL;
const maybe = url ? describe : describe.skip;
const NOW = new Date('2026-10-11T12:00:00Z');

const DROP =
  'DROP TABLE IF EXISTS showlist_sends, showlists, feedlot_log, feedlots, saved_filters, raa_listing_attachments, raa_listing_photos, breeding_listing_epds, breeding_listing_breeds, breeding_listings, feeder_listing_vaccinations, feeder_listing_programs, feeder_listing_breeds, feeder_listings, feeder_lots, listings, barn_contact_log, barn_settings, users, schema_migrations CASCADE';

const FEEDER = {
  groupId: 'PAT100',
  steerCount: 40,
  heiferCount: 20,
  breeds: ['Red Angus'],
  marketingMethod: 'off_ranch',
  marketingDate: '2026-11-15',
  state: 'TX',
  zip: '77801',
  contactName: 'Pat Rancher',
  contactPhone: '(979) 555-0100',
  contactEmail: 'pat@example.com',
};

maybe('listing notes columns (real Postgres)', () => {
  let client;
  let feeders;
  let ownerId;

  const values = (over = {}) => {
    const { values: v, errors } = validateFeederListing({ ...FEEDER, ...over }, NOW);
    if (errors) throw new Error('bad test data: ' + JSON.stringify(errors));
    v.lat = null;
    v.lon = null;
    return v;
  };

  beforeAll(async () => {
    client = new Client({ connectionString: url });
    await client.connect();
    await client.query(DROP);
    await runMigrations({ connectionString: url, log: () => {} });
    ownerId = (await client.query("INSERT INTO users (email, password_hash, display_name, membership_number) VALUES ('o@x.com','x','Owner','1') RETURNING id")).rows[0].id;
    const db = {
      query: (t, p) => client.query(t, p),
      transaction: async (fn) => {
        await client.query('BEGIN');
        try {
          const r = await fn(client);
          await client.query('COMMIT');
          return r;
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        }
      },
    };
    feeders = createFeederListingsRepo(db);
  });

  afterAll(async () => {
    await client.end();
  });

  it('a listing without notes has none and is not marked as including them', async () => {
    const row = await feeders.create(ownerId, values());
    expect(row.include_ai).toBe(false);
    expect(row.ai_description).toBeNull();
    expect(shape(row, 'public', NOW).aiDescription).toBeNull();
  });

  it('saves and returns the notes, and an edit can change or switch them off', async () => {
    const row = await feeders.create(ownerId, values({ includeAi: true, aiDescription: 'Line one.\r\n\r\nLine two.' }));
    expect(row.include_ai).toBe(true);
    expect(row.ai_description).toBe('Line one.\n\nLine two.');
    expect(shape(row, 'member', NOW).aiDescription).toBe('Line one.\n\nLine two.');

    const changed = await feeders.update(row.id, values({ includeAi: true, aiDescription: 'Changed by the seller.' }));
    expect(changed.ai_description).toBe('Changed by the seller.');
    expect(changed.status).toBe('pending');

    const off = await feeders.update(row.id, values({ includeAi: false, aiDescription: 'Changed by the seller.' }));
    expect(off.include_ai).toBe(false);
    expect(shape(off, 'member', NOW).aiDescription).toBeNull();
    expect(shape(off, 'owner', NOW).aiDescription).toBe('Changed by the seller.');
  });

  it('the database itself refuses notes over 2000 characters', async () => {
    await expect(client.query("UPDATE feeder_listings SET ai_description = $1 WHERE id = (SELECT min(id) FROM feeder_listings)", ['x'.repeat(2001)])).rejects.toThrow(/check constraint/);
  });
});
