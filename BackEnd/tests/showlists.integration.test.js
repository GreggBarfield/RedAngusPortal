'use strict';
// Runs only when TEST_DATABASE_URL (an empty scratch database) is set. It drops and
// rebuilds tables, so never point it at the real database.
const { Client } = require('pg');
const { runMigrations } = require('../src/migrate');
const { createShowlistsRepo } = require('../src/showlists');
const { createFeedlotsRepo } = require('../src/feedlots');
const { createSender } = require('../src/showlistSender');

const url = process.env.TEST_DATABASE_URL;
const maybe = url ? describe : describe.skip;

maybe('showlists repo (real Postgres)', () => {
  let client;
  let repo;
  let userId;
  const quiet = () => {};
  const db = {
    query: (text, params) => client.query(text, params),
    async transaction(fn) {
      await client.query('BEGIN');
      try {
        const out = await fn(client);
        await client.query('COMMIT');
        return out;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    },
  };

  const addFeedlot = async (name, emails, extra = {}) =>
    Number(
      (
        await client.query(
          `INSERT INTO feedlots (name, city, state, emails, enabled, do_not_email, created_by) VALUES ($1, 'Town', 'TX', $2, $3, $4, $5) RETURNING id`,
          [name, emails, extra.enabled !== false, Boolean(extra.dnm), userId],
        )
      ).rows[0].id,
    );

  const addLot = async (headline, { status = 'approved', days = 10, breeds = [] } = {}) => {
    const id = Number(
      (
        await client.query(
          `INSERT INTO feeder_listings (owner_id, group_id, headline, steer_count, heifer_count, marketing_method, marketing_date, state, zip, contact_name, contact_phone, contact_email, status, call_for_price)
           VALUES ($1, 'g', $2, 50, 20, 'off_ranch', current_date + $3::int, 'TX', '77840', 'Pat', '555', 'pat@x.com', $4, true) RETURNING id`,
          [userId, headline, days, status],
        )
      ).rows[0].id,
    );
    for (let i = 0; i < breeds.length; i++) await client.query('INSERT INTO feeder_listing_breeds (listing_id, breed_name, sort_order) VALUES ($1, $2, $3)', [id, breeds[i], i]);
    return id;
  };

  const make = async (targets) =>
    repo.create({ subject: 'Cattle', intro: 'Hi', lots: [{ id: 1, headline: 'L', breeds: [] }], targets, userId });

  beforeAll(async () => {
    client = new Client({ connectionString: url });
    await client.connect();
    await client.query('DROP TABLE IF EXISTS showlist_sends, showlists, feedlot_log, feedlots, saved_filters, raa_listing_attachments, raa_listing_photos, breeding_listing_epds, breeding_listing_breeds, breeding_listings, feeder_listing_vaccinations, feeder_listing_programs, feeder_listing_breeds, feeder_listings, feeder_lots, listings, barn_contact_log, barn_settings, users, schema_migrations CASCADE');
    await runMigrations({ connectionString: url, log: quiet });
    userId = (
      await client.query("INSERT INTO users (email, password_hash, display_name, membership_number, role) VALUES ('s@x.com','x','Staff','1','staff') RETURNING id")
    ).rows[0].id;
    repo = createShowlistsRepo(db);
  });

  afterAll(async () => {
    await client.end();
  });

  beforeEach(async () => {
    await client.query('TRUNCATE showlist_sends, showlists, feedlot_log, feedlots, feeder_listing_breeds, feeder_listings RESTART IDENTITY CASCADE');
  });

  test('lots: only approved cattle that have not sold yet, with breeds and a plain date', async () => {
    const a = await addLot('Good lot', { breeds: ['Red Angus', 'Angus'] });
    await addLot('Waiting', { status: 'pending' });
    await addLot('Old', { days: -1 });
    await addLot('Today', { days: 0 });
    const lots = await repo.lots();
    expect(lots.map((l) => l.headline)).toEqual(['Today', 'Good lot']);
    const good = lots.find((l) => l.id === a);
    expect(good.breeds).toEqual(['Red Angus', 'Angus']);
    expect(good.marketingDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(good).toMatchObject({ steerCount: 50, heiferCount: 20, callForPrice: true, contactEmail: 'pat@x.com' });
    expect((await repo.lotsByIds([a])).map((l) => l.id)).toEqual([a]);
    expect(await repo.lotsByIds([999999])).toEqual([]);
  });

  test('recipients: active, with an address, not do-not-email; blocked ones are counted', async () => {
    const ok = await addFeedlot('Alpha', ['a@alpha.com']);
    await addFeedlot('No mail', []);
    await addFeedlot('Retired', ['r@r.com'], { enabled: false });
    await addFeedlot('Opted out', ['o@o.com'], { dnm: true });
    const r = await repo.recipients();
    expect(r.rows.map((x) => Number(x.id))).toEqual([ok]);
    expect(r.blocked).toBe(1);
    expect((await repo.feedlotsByIds([ok, 99999])).map((x) => Number(x.id))).toEqual([ok]);
    expect(await repo.feedlotsByIds([ok + 1])).toEqual([]);
  });

  test('create, claim, submit, fail, requeue and the waiting counts', async () => {
    const f = await addFeedlot('Alpha', ['a@alpha.com', 'b@alpha.com', 'c@alpha.com']);
    const made = await make([
      { feedlotId: f, feedlotName: 'Alpha', email: 'a@alpha.com' },
      { feedlotId: f, feedlotName: 'Alpha', email: 'b@alpha.com' },
      { feedlotId: f, feedlotName: 'Alpha', email: 'c@alpha.com' },
    ]);
    expect(made.recipientCount).toBe(3);
    expect(await repo.anyUnfinished()).toBe(made.id);
    const got = await repo.claim(made.id, 2);
    expect(got.map((g) => g.recipient)).toEqual(['a@alpha.com', 'b@alpha.com']);
    expect(got[0].token).toMatch(/^[a-f0-9]{32}$/);
    expect(got[0].token).not.toBe(got[1].token);
    await repo.markSubmitted(got[0].id, 'EMAIL1');
    await repo.markSubmitFailed(got[1].id, 'rejected');
    expect(await repo.queuedCount(made.id)).toBe(1);
    const third = await repo.claim(made.id, 5);
    expect(third).toHaveLength(1);
    await repo.requeue(third[0].id);
    expect(await repo.queuedCount(made.id)).toBe(1);
    expect(await repo.claim(made.id, 5)).toHaveLength(1);
    expect(await repo.interruptStale(made.id)).toBe(1);
    expect(await repo.anyUnfinished()).toBeNull();
    const detail = await repo.get(made.id);
    const by = Object.fromEntries(detail.counts.map((c) => [c.status, c.n]));
    expect(by).toEqual({ SUBMITTED: 1, SUBMIT_FAILED: 2 });
    expect(detail.sends[0]).toMatchObject({ recipient: 'a@alpha.com', status: 'SUBMITTED' });
    expect(detail.sends[2].status_detail).toMatch(/Interrupted/);
    const sl = await repo.getShowlist(made.id);
    expect(sl.lots).toEqual([{ id: 1, headline: 'L', breeds: [] }]);
    const rec = await repo.recipients();
    expect(rec.rows).toHaveLength(1);
    expect(rec.rows[0].last_sent).not.toBeNull();
  });

  test('delivery reports only touch a row that matches the ref, the recipient and a waiting state', async () => {
    const f = await addFeedlot('Alpha', ['a@alpha.com']);
    const made = await make([{ feedlotId: f, feedlotName: 'Alpha', email: 'a@alpha.com' }]);
    const [row] = await repo.claim(made.id, 1);
    const ref = Number(row.id);
    const status = async () => (await client.query('SELECT status FROM showlist_sends WHERE id = $1', [ref])).rows[0].status;

    expect(await repo.applyEvent({ ref, rcpt: 'a@alpha.com', kind: 'delivered' })).toEqual({ updated: 0 }); // still SENDING
    await repo.markSubmitted(ref, 'E');
    expect(await repo.applyEvent({ ref, rcpt: 'someone@else.com', kind: 'delivered' })).toEqual({ updated: 0 });
    expect(await repo.applyEvent({ ref: ref + 50, rcpt: 'a@alpha.com', kind: 'delivered' })).toEqual({ updated: 0 });
    expect(await repo.applyEvent({ ref: 0, rcpt: 'a@alpha.com', kind: 'delivered' })).toEqual({ updated: 0 });
    expect(await status()).toBe('SUBMITTED');
    expect(await repo.applyEvent({ ref, rcpt: '  A@Alpha.com ', kind: 'delivered', detail: '{"event":"delivered"}' })).toEqual({ updated: 1 });
    expect(await status()).toBe('DELIVERED');
    expect(await repo.applyEvent({ ref, rcpt: 'a@alpha.com', kind: 'delivered' })).toEqual({ updated: 0 }); // not twice
    expect(await repo.applyEvent({ ref, rcpt: 'a@alpha.com', kind: 'failed', detail: '{"event":"bounce"}' })).toEqual({ updated: 1 });
    expect(await status()).toBe('FAILED');
    expect((await client.query('SELECT do_not_email FROM feedlots WHERE id = $1', [f])).rows[0].do_not_email).toBe(false);
  });

  test('a spam report switches the feedlot to do-not-email', async () => {
    const f = await addFeedlot('Alpha', ['a@alpha.com']);
    const made = await make([{ feedlotId: f, feedlotName: 'Alpha', email: 'a@alpha.com' }]);
    const [row] = await repo.claim(made.id, 1);
    await repo.markSubmitted(row.id, 'E');
    expect(await repo.applyEvent({ ref: Number(row.id), rcpt: 'a@alpha.com', kind: 'spam' })).toEqual({ updated: 1 });
    const fl = (await client.query('SELECT do_not_email, do_not_email_note, do_not_email_at FROM feedlots WHERE id = $1', [f])).rows[0];
    expect(fl.do_not_email).toBe(true);
    expect(fl.do_not_email_note).toMatch(/spam/);
    expect(fl.do_not_email_at).not.toBeNull();
  });

  test('unsubscribe: turns the feedlot off, can be repeated, and works even after the feedlot was removed', async () => {
    const f = await addFeedlot('Alpha', ['a@alpha.com']);
    const made = await make([{ feedlotId: f, feedlotName: 'Alpha', email: 'a@alpha.com' }]);
    const [row] = await repo.claim(made.id, 1);
    expect(await repo.findByToken(row.token)).toMatchObject({ feedlot_name: 'Alpha', off: false, feedlot_exists: true });
    expect(await repo.findByToken('0'.repeat(32))).toBeNull();
    expect(await repo.unsubscribe(row.token)).toEqual({ feedlotName: 'Alpha' });
    const fl = (await client.query('SELECT do_not_email, do_not_email_note FROM feedlots WHERE id = $1', [f])).rows[0];
    expect(fl.do_not_email).toBe(true);
    expect(fl.do_not_email_note).toBe('Unsubscribed from showlist email (a@alpha.com)');
    expect(await repo.unsubscribe(row.token)).toEqual({ feedlotName: 'Alpha' });
    expect((await repo.findByToken(row.token)).off).toBe(true);
    expect((await client.query('SELECT unsubscribed_at FROM showlist_sends WHERE id = $1', [row.id])).rows[0].unsubscribed_at).not.toBeNull();
    expect((await repo.recipients()).rows).toHaveLength(0);
    await createFeedlotsRepo(db).remove(f, userId);
    expect(await repo.unsubscribe(row.token)).toEqual({ feedlotName: 'Alpha' });
    expect(await repo.findByToken(row.token)).toMatchObject({ feedlot_exists: false, off: true });
  });

  test('history lists newest first with counts', async () => {
    const f = await addFeedlot('Alpha', ['a@alpha.com']);
    await make([{ feedlotId: f, feedlotName: 'Alpha', email: 'a@alpha.com' }]);
    const second = await make([{ feedlotId: f, feedlotName: 'Alpha', email: 'a@alpha.com' }]);
    const rows = await repo.list();
    expect(Number(rows[0].id)).toBe(second.id);
    expect(rows[0]).toMatchObject({ subject: 'Cattle', recipient_count: 1, created_by: 'Staff', lot_count: 1 });
    expect(rows[0].counts).toEqual({ QUEUED: 1 });
    expect(await repo.get(999999)).toBeNull();
  });

  test('the sender works through a showlist using the real database', async () => {
    const f1 = await addFeedlot('Alpha', ['a@alpha.com']);
    const f2 = await addFeedlot('Beta', ['b@beta.com']);
    const made = await make([
      { feedlotId: f1, feedlotName: 'Alpha', email: 'a@alpha.com' },
      { feedlotId: f2, feedlotName: 'Beta', email: 'b@beta.com' },
    ]);
    const sent = [];
    const mailer = { send: async (m) => (sent.push(m), m.to === 'b@beta.com' ? { ok: false, fatal: false, error: 'mailbox full' } : { ok: true, emailId: 'EID' }) };
    const sender = createSender({ repo, mailer, getConfig: () => ({ siteUrl: 'https://raa.example', postalAddress: 'addr', fromName: 'P' }), log: { error() {} } });
    await sender.run(made.id);
    const detail = await repo.get(made.id);
    expect(detail.sends.map((s) => s.status)).toEqual(['SUBMITTED', 'SUBMIT_FAILED']);
    expect(sent[0].subject).toBe(`Cattle [ref:${detail.sends[0].id}]`);
    expect((await client.query('SELECT smtp2go_email_id FROM showlist_sends WHERE id = $1', [detail.sends[0].id])).rows[0].smtp2go_email_id).toBe('EID');
    expect(detail.sends[1].status_detail).toBe('mailbox full');
  });
});
