'use strict';
// Runs only when TEST_DATABASE_URL points at an EMPTY scratch database.
// Never point it at the real raaaa database.
const { Client } = require('pg');
const { runMigrations } = require('../src/migrate');
const { createListingsRepo } = require('../src/listings');
const { validateListing } = require('../src/routes/listings');

const url = process.env.TEST_DATABASE_URL;
const maybe = url ? describe : describe.skip;

const BASE = {
  kind: 'heifer',
  name: 'Ruby',
  regNumber: 'RA-9',
  birthDate: '2025-03-01',
  city: 'Bryan',
  state: 'TX',
  zip: '77801',
  contactName: 'Pat',
  contactPhone: '979-555-0100',
  contactEmail: 'pat@example.com',
};

maybe('listings repo (real Postgres)', () => {
  let client;
  let repo;
  let ownerId;
  let staffId;
  const quiet = () => {};
  const make = (over = {}) => validateListing({ ...BASE, ...over }, new Date('2026-10-04T00:00:00Z')).values;

  beforeAll(async () => {
    client = new Client({ connectionString: url });
    await client.connect();
    await client.query('DROP TABLE IF EXISTS feeder_lots, listings, barn_contact_log, barn_settings, users, schema_migrations CASCADE');
    await runMigrations({ connectionString: url, log: quiet });
    ownerId = (await client.query("INSERT INTO users (email, password_hash, display_name, membership_number) VALUES ('o@x.com','x','Owner','1') RETURNING id")).rows[0].id;
    staffId = (await client.query("INSERT INTO users (email, password_hash, display_name, membership_number, role) VALUES ('s@x.com','x','Staff','2','staff') RETURNING id")).rows[0].id;
    repo = createListingsRepo({ query: (t, p) => client.query(t, p) });
  });
  afterAll(async () => {
    await client.query('DROP TABLE IF EXISTS feeder_lots, listings, barn_contact_log, barn_settings, users, schema_migrations CASCADE');
    await client.end();
  });

  test('create, read back, dates and numbers come out as plain values', async () => {
    const row = await repo.create(ownerId, make({ kind: 'bull', scrotal: 36.5, askingPrice: 4500, birthWeight: 80 }));
    expect(row).toMatchObject({ status: 'pending', birth_date: '2025-03-01', asking_price: 4500, scrotal: 36.5, state: 'TX', owner_name: 'Owner' });
  });

  test('only approved listings appear in search; filters and words work', async () => {
    const a = await repo.create(ownerId, make({ name: 'Alpha 100%', city: 'Austin' }));
    const b = await repo.create(ownerId, make({ name: 'Bravo', state: 'MT', city: 'Billings' }));
    expect((await repo.list({ q: '', kind: '', state: '', page: 1, pageSize: 20 })).total).toBe(0);
    expect(await repo.review(a.id, { decision: 'approve', note: null, reviewerId: staffId })).toBe(true);
    expect(await repo.review(b.id, { decision: 'approve', note: null, reviewerId: staffId })).toBe(true);
    expect((await repo.list({ q: '', kind: '', state: '', page: 1, pageSize: 20 })).total).toBe(2);
    expect((await repo.list({ q: '100%', kind: '', state: '', page: 1, pageSize: 20 })).rows.map((r) => r.name)).toEqual(['Alpha 100%']);
    expect((await repo.list({ q: '', kind: '', state: 'MT', page: 1, pageSize: 20 })).rows.map((r) => r.name)).toEqual(['Bravo']);
    expect((await repo.list({ q: 'billings', kind: 'heifer', state: '', page: 1, pageSize: 20 })).total).toBe(1);
  });

  test('an edit sends an approved listing back to pending', async () => {
    const r = await repo.create(ownerId, make({ name: 'Edit me' }));
    await repo.review(r.id, { decision: 'approve', note: null, reviewerId: staffId });
    const up = await repo.update(r.id, make({ name: 'Edited', askingPrice: 1200 }));
    expect(up).toMatchObject({ status: 'pending', name: 'Edited', approved_at: null, asking_price: 1200 });
  });

  test('review rules: approve only from pending, pull back from approved, note kept', async () => {
    const r = await repo.create(ownerId, make({ name: 'Rules' }));
    expect(await repo.review(r.id, { decision: 'approve', note: null, reviewerId: staffId })).toBe(true);
    expect(await repo.review(r.id, { decision: 'approve', note: null, reviewerId: staffId })).toBe(false);
    expect(await repo.review(r.id, { decision: 'reject', note: 'Too blurry', reviewerId: staffId })).toBe(true);
    expect(await repo.get(r.id)).toMatchObject({ status: 'rejected', review_note: 'Too blurry' });
  });

  test('close, queue, mine and pending count', async () => {
    const r = await repo.create(ownerId, make({ name: 'Closer' }));
    expect(await repo.close(r.id, 'sold')).toBe(true);
    expect(await repo.close(r.id, 'withdrawn')).toBe(false);
    expect((await repo.mine(ownerId)).length).toBeGreaterThan(3);
    expect((await repo.queue('pending')).every((x) => x.status === 'pending')).toBe(true);
    expect(await repo.pendingCount()).toBeGreaterThanOrEqual(2);
  });

  test('the database refuses a price together with call-for-price', async () => {
    await expect(
      client.query("UPDATE listings SET call_for_price = true, asking_price = 5 WHERE id = (SELECT min(id) FROM listings)"),
    ).rejects.toThrow();
  });
});
