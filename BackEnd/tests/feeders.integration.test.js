'use strict';
// Runs only when TEST_DATABASE_URL points at an EMPTY scratch database.
// Never point it at the real raaaa database.
const { Client } = require('pg');
const { runMigrations } = require('../src/migrate');
const { createFeedersRepo } = require('../src/feeders');
const { validateFeeder } = require('../src/routes/feeders');

const url = process.env.TEST_DATABASE_URL;
const maybe = url ? describe : describe.skip;

const BASE = {
  title: '40 steers',
  headCount: 40,
  sex: 'steers',
  avgWeight: 600,
  city: 'Bryan',
  state: 'TX',
  zip: '77801',
  contactName: 'Pat',
  contactPhone: '979-555-0100',
  contactEmail: 'pat@example.com',
};

maybe('feeder repo (real Postgres)', () => {
  let client;
  let repo;
  let ownerId;
  let staffId;
  const quiet = () => {};
  const make = (over = {}) => validateFeeder({ ...BASE, ...over }, new Date('2026-10-04T00:00:00Z')).values;
  const search = (o = {}) => repo.list({ q: '', sex: '', state: '', minWeight: 0, maxWeight: 0, page: 1, pageSize: 20, ...o });

  beforeAll(async () => {
    client = new Client({ connectionString: url });
    await client.connect();
    await client.query('DROP TABLE IF EXISTS saved_filters, breeding_listing_epds, breeding_listing_breeds, breeding_listings, feeder_listing_vaccinations, feeder_listing_programs, feeder_listing_breeds, feeder_listings, feeder_lots, listings, barn_contact_log, barn_settings, users, schema_migrations CASCADE');
    await runMigrations({ connectionString: url, log: quiet });
    ownerId = (await client.query("INSERT INTO users (email, password_hash, display_name, membership_number) VALUES ('o@x.com','x','Owner','1') RETURNING id")).rows[0].id;
    staffId = (await client.query("INSERT INTO users (email, password_hash, display_name, membership_number, role) VALUES ('s@x.com','x','Staff','2','staff') RETURNING id")).rows[0].id;
    repo = createFeedersRepo({ query: (t, p) => client.query(t, p) });
  });
  afterAll(async () => {
    await client.query('DROP TABLE IF EXISTS saved_filters, breeding_listing_epds, breeding_listing_breeds, breeding_listings, feeder_listing_vaccinations, feeder_listing_programs, feeder_listing_breeds, feeder_listings, feeder_lots, listings, barn_contact_log, barn_settings, users, schema_migrations CASCADE');
    await client.end();
  });

  test('create and read back plain values', async () => {
    const row = await repo.create(ownerId, make({ askingPrice: 1.85, priceBasis: 'per_cwt', availableDate: '2026-11-15', weaned: true, weanedDays: 30 }));
    expect(row).toMatchObject({ status: 'pending', asking_price: 1.85, price_basis: 'per_cwt', available_date: '2026-11-15', weaned_days: 30, owner_name: 'Owner' });
  });

  test('only approved lots appear in search; words, sex, state and weight filters work', async () => {
    const a = await repo.create(ownerId, make({ title: 'Alpha 100%', city: 'Austin', avgWeight: 450 }));
    const b = await repo.create(ownerId, make({ title: 'Bravo heifers', sex: 'heifers', state: 'MT', city: 'Billings', avgWeight: 700 }));
    expect((await search()).total).toBe(0);
    expect(await repo.review(a.id, { decision: 'approve', note: null, reviewerId: staffId })).toBe(true);
    expect(await repo.review(b.id, { decision: 'approve', note: null, reviewerId: staffId })).toBe(true);
    expect((await search()).total).toBe(2);
    expect((await search({ q: '100%' })).rows.map((r) => r.title)).toEqual(['Alpha 100%']);
    expect((await search({ sex: 'heifers' })).rows.map((r) => r.title)).toEqual(['Bravo heifers']);
    expect((await search({ state: 'TX' })).rows.map((r) => r.title)).toEqual(['Alpha 100%']);
    expect((await search({ minWeight: 500 })).rows.map((r) => r.title)).toEqual(['Bravo heifers']);
    expect((await search({ maxWeight: 500 })).rows.map((r) => r.title)).toEqual(['Alpha 100%']);
  });

  test('an edit sends an approved lot back to pending', async () => {
    const r = await repo.create(ownerId, make({ title: 'Edit me' }));
    await repo.review(r.id, { decision: 'approve', note: null, reviewerId: staffId });
    const up = await repo.update(r.id, make({ title: 'Edited', headCount: 55 }));
    expect(up).toMatchObject({ status: 'pending', title: 'Edited', head_count: 55, approved_at: null });
  });

  test('review rules, close, queue and counts', async () => {
    const r = await repo.create(ownerId, make({ title: 'Rules' }));
    expect(await repo.review(r.id, { decision: 'approve', note: null, reviewerId: staffId })).toBe(true);
    expect(await repo.review(r.id, { decision: 'approve', note: null, reviewerId: staffId })).toBe(false);
    expect(await repo.review(r.id, { decision: 'reject', note: 'Add weights', reviewerId: staffId })).toBe(true);
    expect(await repo.get(r.id)).toMatchObject({ status: 'rejected', review_note: 'Add weights' });
    expect(await repo.close(r.id, 'sold')).toBe(true);
    expect(await repo.close(r.id, 'withdrawn')).toBe(false);
    expect((await repo.mine(ownerId)).length).toBeGreaterThan(3);
    expect((await repo.queue('pending')).every((x) => x.status === 'pending')).toBe(true);
    expect(await repo.pendingCount()).toBeGreaterThanOrEqual(1);
  });

  test('the database refuses a price without a basis, and a price with call-for-price', async () => {
    await expect(client.query("UPDATE feeder_lots SET asking_price = 5, price_basis = NULL WHERE id = (SELECT min(id) FROM feeder_lots)")).rejects.toThrow();
    await expect(
      client.query("UPDATE feeder_lots SET call_for_price = true, asking_price = 5, price_basis = 'per_head' WHERE id = (SELECT min(id) FROM feeder_lots)"),
    ).rejects.toThrow();
  });
});
