'use strict';
// Runs only when TEST_DATABASE_URL (an empty scratch database) is set. It drops and
// rebuilds tables, so never point it at the real database.
const { Client } = require('pg');
const { runMigrations } = require('../src/migrate');
const { createDashboardRepo } = require('../src/dashboard');

const url = process.env.TEST_DATABASE_URL;
const maybe = url ? describe : describe.skip;

maybe('dashboard repo (real Postgres)', () => {
  let client;
  let repo;
  const quiet = () => {};
  const q = (text, params) => client.query(text, params);

  async function user(email, role, createdAgo = '30 days') {
    return (
      await q(
        `INSERT INTO users (email, password_hash, display_name, membership_number, role, created_at)
         VALUES ($1, 'x', $1, '1', $2, now() - $3::interval) RETURNING id`,
        [email, role, createdAgo],
      )
    ).rows[0].id;
  }

  async function feeder(owner, { status = 'approved', state = 'TX', steers = 10, heifers = 5, date = '2099-01-01', created = '0 days', updated = '0 days', ai = false } = {}) {
    return (
      await q(
        `INSERT INTO feeder_listings (owner_id, group_id, headline, steer_count, heifer_count, marketing_method, marketing_date,
                                      state, zip, contact_name, contact_phone, contact_email, status, created_at, updated_at,
                                      include_ai, ai_description)
         VALUES ($1, 'g', 'h', $2, $3, 'off_ranch', $4, $5, '77840', 'c', 'p', 'e@x.com', $6, now() - $7::interval, now() - $8::interval, $9, $10)
         RETURNING id`,
        [owner, steers, heifers, date, state, status, created, updated, ai, ai ? 'Nice cattle.' : null],
      )
    ).rows[0].id;
  }

  async function breeding(owner, { status = 'approved', state = 'TX', head = 1, date = '2099-01-01', created = '0 days' } = {}) {
    return (
      await q(
        `INSERT INTO breeding_listings (owner_id, head_count, sex_class, headline, sale_type, sale_date, state, zip,
                                        contact_name, contact_phone, contact_email, status, created_at)
         VALUES ($1, $2, 'bull', 'h', 'private_treaty', $3, $4, '77840', 'c', 'p', 'e@x.com', $5, now() - $6::interval)
         RETURNING id`,
        [owner, head, date, state, status, created],
      )
    ).rows[0].id;
  }

  beforeAll(async () => {
    client = new Client({ connectionString: url });
    await client.connect();
    await client.query('DROP TABLE IF EXISTS showlist_sends, showlists, feedlot_log, feedlots, saved_filters, raa_listing_attachments, raa_listing_photos, breeding_listing_epds, breeding_listing_breeds, breeding_listings, feeder_listing_vaccinations, feeder_listing_programs, feeder_listing_breeds, feeder_listings, feeder_lots, listings, barn_contact_log, barn_settings, users, schema_migrations CASCADE');
    await runMigrations({ connectionString: url, log: quiet });
    repo = createDashboardRepo({ db: { query: q }, btn: null });
  });

  afterAll(async () => {
    await client.end();
  });

  beforeEach(async () => {
    await q('TRUNCATE showlist_sends, showlists, feedlots, raa_listing_photos, breeding_listings, feeder_listings, users RESTART IDENTITY CASCADE');
  });

  it('is all zeros and empty lists on an empty database (and always 12 weeks)', async () => {
    const d = await repo.overview();
    expect(d.listings).toMatchObject({ feederLive: 0, breedingLive: 0, feederHead: 0, pending: 0 });
    expect(d.listings.outcomes).toEqual({ approved: 0, pending: 0, rejected: 0, sold: 0, withdrawn: 0 });
    expect(d.sex).toEqual({ steers: 0, heifers: 0 });
    expect(d.states).toEqual([]);
    expect(d.weekly).toHaveLength(12);
    expect(d.showlists).toMatchObject({ sent: 0, lastAt: null, emailsSent: 0 });
    expect(d.feedlots.total).toBe(0);
    expect(d.people.members).toBe(0);
  });

  it('counts live listings, head, pending, outcomes, sex and states', async () => {
    await user('s@x.com', 'staff');
    const m1 = await user('m1@x.com', 'member');
    const m2 = await user('m2@x.com', 'member', '2 days');
    await feeder(m1, { steers: 100, heifers: 50, state: 'TX', ai: true });
    await feeder(m1, { steers: 20, heifers: 0, state: 'TX' });
    await feeder(m2, { steers: 0, heifers: 30, state: 'OK' });
    await feeder(m2, { status: 'pending', steers: 999 });
    await feeder(m2, { status: 'rejected' });
    await feeder(m2, { status: 'sold' });
    await breeding(m1, { head: 3, state: 'TX' });
    await breeding(m2, { status: 'pending' });
    await breeding(m2, { status: 'withdrawn' });
    const d = await repo.overview();
    expect(d.listings).toMatchObject({ feederLive: 3, breedingLive: 1, feederHead: 200, breedingHead: 3, pending: 2 });
    expect(d.listings.outcomes).toEqual({ approved: 4, pending: 2, rejected: 1, sold: 1, withdrawn: 1 });
    expect(d.sex).toEqual({ steers: 120, heifers: 80 });
    expect(d.states).toEqual([
      { state: 'TX', feeder: 2, breeding: 1 },
      { state: 'OK', feeder: 1, breeding: 0 },
    ]);
    expect(d.attention.notesOn).toBe(1);
    // The staff account is not a member. Of the two members, one signed up 2 days ago and one 30 days ago.
    expect(d.people).toEqual({ members: 2, newThisWeek: 1, sellers: 2 });
  });

  it('puts new listings in the right week, oldest first, ending with this week', async () => {
    const m = await user('m@x.com', 'member');
    await feeder(m, { created: '0 days' });
    await feeder(m, { created: '0 days' });
    await feeder(m, { created: '15 days' });
    await breeding(m, { created: '15 days' });
    await feeder(m, { created: '200 days' }); // outside the 12 weeks
    const d = await repo.overview();
    expect(d.weekly).toHaveLength(12);
    const weeks = d.weekly.map((w) => w.week);
    expect([...weeks].sort()).toEqual(weeks);
    expect(d.weekly[11]).toMatchObject({ feeder: 2, breeding: 0 });
    const total = d.weekly.reduce((s, w) => s + w.feeder + w.breeding, 0);
    expect(total).toBe(4);
  });

  it('flags old pending, missing photos, and approved listings past their sale date', async () => {
    const m = await user('m@x.com', 'member');
    const withPhoto = await feeder(m);
    await feeder(m); // no photo
    await feeder(m, { date: '2000-01-01' }); // past sale date, no photo
    await feeder(m, { status: 'pending', updated: '3 days' });
    await feeder(m, { status: 'pending', updated: '1 hour' });
    await breeding(m, { date: '2000-01-01' });
    await q(
      `INSERT INTO raa_listing_photos (feeder_listing_id, s3_key, s3_key_medium, s3_key_thumb, file_size_bytes, uploaded_by)
       VALUES ($1, 'listings/raa/feeder/1/a.jpg', 'listings/raa/feeder/1/b.jpg', 'listings/raa/feeder/1/c.jpg', 10, $2)`,
      [withPhoto, m],
    );
    const d = await repo.overview();
    expect(d.attention).toMatchObject({ pendingOverTwoDays: 1, noPhotos: 3, pastSaleDate: 2 });
  });

  it('counts feedlots and how many can be reached', async () => {
    await q(`INSERT INTO feedlots (name, city, state, emails, fax, enabled, do_not_email) VALUES
      ('A', 'x', 'TX', '{a@x.com}', NULL, true, false),
      ('B', 'x', 'TX', '{b@x.com,b2@x.com}', NULL, true, true),
      ('C', 'x', 'TX', '{}', '5551234567', true, false),
      ('D', 'x', 'TX', '{}', NULL, true, false),
      ('E', 'x', 'TX', '{e@x.com}', NULL, false, false)`);
    const f = (await repo.overview()).feedlots;
    expect(f).toEqual({
      total: 5,
      enabled: 4,
      withEmail: 3,
      canEmail: 1,
      doNotEmail: 1,
      reach: { email: 2, faxOnly: 1, neither: 1 },
    });
  });

  it('counts showlists and email results', async () => {
    const staff = await user('s@x.com', 'staff');
    const sl = (await q(`INSERT INTO showlists (subject, lots, recipient_count, created_by) VALUES ('s', '[]', 6, $1) RETURNING id`, [staff])).rows[0].id;
    const row = (status, feedlot, unsub = false) =>
      q(
        `INSERT INTO showlist_sends (showlist_id, feedlot_id, feedlot_name, recipient, token, status, submitted_at, unsubscribed_at)
         VALUES ($1, $2, 'n', 'r@x.com', md5(random()::text), $3, CASE WHEN $3 IN ('SUBMITTED','DELIVERED','FAILED') THEN now() END, CASE WHEN $4 THEN now() END)`,
        [sl, feedlot, status, unsub],
      );
    await row('DELIVERED', 1);
    await row('DELIVERED', 1, true);
    await row('SUBMITTED', 2);
    await row('FAILED', 3);
    await row('SUBMIT_FAILED', 4);
    await row('QUEUED', 5);
    const s = (await repo.overview()).showlists;
    expect(s).toMatchObject({ sent: 1, emailsSent: 4, delivered: 2, submitted: 1, failed: 2, unsubscribed: 1, feedlotsReached: 3 });
    expect(typeof s.lastAt).toBe('string');
  });

  describe('sale barn numbers from BTN', () => {
    beforeAll(async () => {
      await q(`CREATE TABLE IF NOT EXISTS public.auction_barns (auction_no int, is_active boolean, auc_email text, auc_fax text)`);
    });
    afterAll(async () => {
      await q('DROP TABLE IF EXISTS public.auction_barns');
    });
    beforeEach(async () => {
      await q('TRUNCATE public.auction_barns');
    });

    it('counts total, active, and reachability (empty text counts as nothing)', async () => {
      await q(`INSERT INTO public.auction_barns VALUES
        (1, true, 'a@x.com', ''),
        (2, true, '', '5551112222'),
        (3, true, NULL, NULL),
        (4, true, '  ', '  '),
        (5, false, 'z@x.com', NULL)`);
      const btn = { canRead: () => true, read: { query: (t, p) => q(t, p) } };
      const barns = await createDashboardRepo({ db: { query: q }, btn }).barns();
      expect(barns).toEqual({ total: 5, active: 4, withEmail: 2, reach: { email: 1, faxOnly: 1, neither: 2 } });
    });

    it('returns null (not an error) when BTN is not configured or fails', async () => {
      expect(await createDashboardRepo({ db: { query: q }, btn: { canRead: () => false } }).barns()).toBeNull();
      const bad = { canRead: () => true, read: { query: async () => { throw new Error('nope'); } } };
      const quietLog = { error: () => {} };
      expect(await createDashboardRepo({ db: { query: q }, btn: bad, log: quietLog }).barns()).toBeNull();
    });
  });
});
