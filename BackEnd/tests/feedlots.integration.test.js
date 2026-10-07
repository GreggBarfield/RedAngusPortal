'use strict';
// Runs only when TEST_DATABASE_URL (an empty scratch database) is set. It drops and
// rebuilds tables, so never point it at the real database.
const { Client } = require('pg');
const { runMigrations } = require('../src/migrate');
const { createFeedlotsRepo } = require('../src/feedlots');
const { validateFeedlot } = require('../src/feedlotFields');

const url = process.env.TEST_DATABASE_URL;
const maybe = url ? describe : describe.skip;

maybe('feedlots repo (real Postgres)', () => {
  let client;
  let repo;
  let userId;
  const quiet = () => {};

  // Same wrapper the server uses: one transaction on one connection.
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

  const make = async (input) => {
    const { values, errors } = validateFeedlot(input);
    if (errors) throw new Error(JSON.stringify(errors));
    return repo.create(values, userId);
  };

  beforeAll(async () => {
    client = new Client({ connectionString: url });
    await client.connect();
    await client.query('DROP TABLE IF EXISTS feedlot_log, feedlots, saved_filters, raa_listing_attachments, raa_listing_photos, breeding_listing_epds, breeding_listing_breeds, breeding_listings, feeder_listing_vaccinations, feeder_listing_programs, feeder_listing_breeds, feeder_listings, feeder_lots, listings, barn_contact_log, barn_settings, users, schema_migrations CASCADE');
    await runMigrations({ connectionString: url, log: quiet });
    userId = (
      await client.query("INSERT INTO users (email, password_hash, display_name, membership_number, role) VALUES ('s@x.com','x','Staff','1','staff') RETURNING id")
    ).rows[0].id;
    repo = createFeedlotsRepo(db);
  });

  afterAll(async () => {
    await client.end();
  });

  beforeEach(async () => {
    await client.query('TRUNCATE feedlot_log, feedlots RESTART IDENTITY');
  });

  const page = { page: 1, pageSize: 50 };

  test('create, read back, and the log says who made it', async () => {
    const made = await make({ name: 'Pinal Feeding Co.', state: 'az', city: 'Maricopa', zip: '85138', emails: 'a@x.com, B@x.com', fax: '(602) 555-0100', phone: '(602) 252-3467; (602) 111-2222' });
    expect(made.status).toBe('ok');
    const row = await repo.get(made.id);
    expect(row).toMatchObject({ name: 'Pinal Feeding Co.', state: 'AZ', emails: ['a@x.com', 'b@x.com'], fax: '(602) 555-0100', enabled: true, do_not_email: false });
    const log = await repo.log(made.id);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ field: 'created', new_value: 'Pinal Feeding Co.', changed_by: 'Staff' });
  });

  test('the same name, city and state cannot be added twice (ignoring case); another city is fine', async () => {
    expect((await make({ name: 'Winner Circle', state: 'KS', city: 'Dodge City' })).status).toBe('ok');
    expect((await make({ name: ' winner circle ', state: 'ks', city: 'DODGE CITY' })).status).toBe('duplicate');
    expect((await make({ name: 'Winner Circle', state: 'KS', city: 'Syracuse' })).status).toBe('ok');
    expect((await repo.list({ ...page, staff: true })).total).toBe(2);
  });

  test('list: sorted by name, search, state, email filters, paging', async () => {
    await make({ name: 'Bravo Feeders', state: 'TX', city: 'Amarillo', emails: 'b@x.com', contactName: 'Zed Zimmer' });
    await make({ name: 'alpha yard', state: 'TX', city: 'Lubbock' });
    await make({ name: 'Charlie 100% Cattle', state: 'NE', city: 'Omaha', emails: 'c@x.com' });
    await make({ name: 'Delta_Yard', state: 'NE', city: 'Ashland' });
    const names = async (args) => (await repo.list({ ...page, staff: true, ...args })).rows.map((r) => r.name);

    expect(await names({})).toEqual(['alpha yard', 'Bravo Feeders', 'Charlie 100% Cattle', 'Delta_Yard']);
    expect(await names({ q: 'yard' })).toEqual(['alpha yard', 'Delta_Yard']);
    expect(await names({ q: 'lubbock' })).toEqual(['alpha yard']);
    // % and _ in a search are plain characters, not wildcards
    expect(await names({ q: '100%' })).toEqual(['Charlie 100% Cattle']);
    expect(await names({ q: 'Delta_' })).toEqual(['Delta_Yard']);
    expect(await names({ q: '%' })).toEqual(['Charlie 100% Cattle']);
    expect(await names({ state: 'NE' })).toEqual(['Charlie 100% Cattle', 'Delta_Yard']);
    expect(await names({ hasEmail: '1' })).toEqual(['Bravo Feeders', 'Charlie 100% Cattle']);
    expect(await names({ hasEmail: '0' })).toEqual(['alpha yard', 'Delta_Yard']);
    // contact names are only searched when asked for
    expect(await names({ q: 'zimmer' })).toEqual([]);
    expect(await names({ q: 'zimmer', withContact: true })).toEqual(['Bravo Feeders']);
    const p2 = await repo.list({ staff: true, page: 2, pageSize: 3 });
    expect(p2.total).toBe(4);
    expect(p2.rows.map((r) => r.name)).toEqual(['Delta_Yard']);
  });

  test('retired feedlots are hidden from everyone but staff', async () => {
    const a = await make({ name: 'Open Yard', state: 'TX' });
    const b = await make({ name: 'Retired Yard', state: 'TX' });
    await repo.update(b.id, { enabled: false }, userId);
    expect((await repo.list({ ...page, staff: false })).rows.map((r) => r.name)).toEqual(['Open Yard']);
    expect((await repo.list({ ...page, staff: true })).total).toBe(2);
    expect((await repo.list({ ...page, staff: true, enabled: '0' })).rows.map((r) => r.name)).toEqual(['Retired Yard']);
    expect((await repo.list({ ...page, staff: true, enabled: '1' })).rows.map((r) => r.name)).toEqual(['Open Yard']);
    expect(await repo.states(false)).toEqual([{ state: 'TX', n: 1 }]);
    expect(await repo.states(true)).toEqual([{ state: 'TX', n: 2 }]);
    expect(a.status).toBe('ok');
  });

  test('update: changes and logs only what really changed', async () => {
    const { id } = await make({ name: 'Foster Feed Yard', state: 'CA', city: 'Brawley', emails: 'a@x.com', phone: '(760) 352-4171' });
    const r = await repo.update(id, { fax: '(760) 555-0101', emails: ['a@x.com', 'b@x.com'], phone: '(760) 352-4171', city: 'Brawley' }, userId);
    expect(r.status).toBe('ok');
    expect(r.changed).toEqual([
      { field: 'fax', oldValue: null, newValue: '(760) 555-0101' },
      { field: 'emails', oldValue: 'a@x.com', newValue: 'a@x.com, b@x.com' },
    ]);
    const row = await repo.get(id);
    expect(row.fax).toBe('(760) 555-0101');
    expect(row.emails).toEqual(['a@x.com', 'b@x.com']);
    expect((await client.query('SELECT updated_by FROM feedlots WHERE id = $1', [id])).rows[0].updated_by).toBe(String(userId));
    const log = await repo.log(id);
    expect(log.map((l) => l.field).sort()).toEqual(['created', 'emails', 'fax']);

    // nothing changed -> nothing logged
    const again = await repo.update(id, { fax: '(760) 555-0101' }, userId);
    expect(again).toEqual({ status: 'ok', changed: [] });
    expect(await repo.log(id)).toHaveLength(3);

    // clearing
    const cleared = await repo.update(id, { fax: null, emails: [] }, userId);
    expect(cleared.changed.map((c) => c.field)).toEqual(['fax', 'emails']);
    expect(await repo.get(id)).toMatchObject({ fax: null, emails: [] });
  });

  test('update: unknown feedlot, and a rename that would clash', async () => {
    expect(await repo.update(99999, { fax: null }, userId)).toEqual({ status: 'not_found' });
    await make({ name: 'One Yard', state: 'TX', city: 'A' });
    const two = await make({ name: 'Two Yard', state: 'TX', city: 'A' });
    expect(await repo.update(two.id, { name: 'one yard' }, userId)).toEqual({ status: 'duplicate' });
    expect((await repo.get(two.id)).name).toBe('Two Yard');
  });

  test('do-not-email: date and note are set and cleared with the flag', async () => {
    const { id } = await make({ name: 'Quiet Yard', state: 'TX', emails: 'q@x.com' });
    await repo.update(id, { doNotEmail: true, doNotEmailNote: 'Asked by phone' }, userId);
    let row = await repo.get(id);
    expect(row.do_not_email).toBe(true);
    expect(row.do_not_email_at).toBeInstanceOf(Date);
    expect(row.do_not_email_note).toBe('Asked by phone');
    expect((await repo.stats()).do_not_email).toBe(1);
    expect((await repo.stats()).can_email).toBe(0);
    expect((await repo.list({ ...page, staff: true, doNotEmail: '1' })).total).toBe(1);
    expect((await repo.list({ ...page, staff: true, doNotEmail: '0' })).total).toBe(0);

    await repo.update(id, { doNotEmail: false }, userId);
    row = await repo.get(id);
    expect(row).toMatchObject({ do_not_email: false, do_not_email_at: null, do_not_email_note: null });
    expect((await repo.stats()).can_email).toBe(1);
  });

  test('create with do-not-email already on stamps the date', async () => {
    const { id } = await make({ name: 'Born Quiet', state: 'TX', doNotEmail: true });
    expect((await repo.get(id)).do_not_email_at).toBeInstanceOf(Date);
  });

  test('remove: gone from the list, but the log keeps a record with the name', async () => {
    const { id } = await make({ name: 'Going Away', state: 'TX', city: 'Lubbock' });
    expect(await repo.remove(id, userId)).toEqual({ status: 'ok' });
    expect(await repo.get(id)).toBeNull();
    const log = await repo.log(id);
    expect(log.map((l) => l.field)).toEqual(['deleted', 'created']);
    expect(log[0].old_value).toBe('Going Away, Lubbock, TX');
    expect(await repo.remove(id, userId)).toEqual({ status: 'not_found' });
  });

  test('stats', async () => {
    await make({ name: 'A', state: 'TX', emails: 'a@x.com', fax: '(806) 668-4744' });
    await make({ name: 'B', state: 'TX' });
    const c = await make({ name: 'C', state: 'TX', emails: 'c@x.com' });
    await repo.update(c.id, { enabled: false }, userId);
    expect(await repo.stats()).toEqual({ total: 3, enabled: 2, with_email: 2, can_email: 1, do_not_email: 0, with_fax: 1 });
  });

  test('the database itself refuses bad data', async () => {
    const bad = (sql, params) => client.query(sql, params);
    await expect(bad("INSERT INTO feedlots (name, state, zip) VALUES ('x', 'TX', '123')")).rejects.toThrow();
    await expect(bad("INSERT INTO feedlots (name, state) VALUES ('   ', 'TX')")).rejects.toThrow();
    await expect(bad("INSERT INTO feedlots (name, state, emails) VALUES ('x', 'TX', ARRAY['a@x.com','b@x.com','c@x.com','d@x.com','e@x.com','f@x.com'])")).rejects.toThrow();
  });

  test('bulkInsert: a dry run saves nothing, a real run saves, a second run skips what is there', async () => {
    const rows = ['One', 'Two', 'Three'].map((name) => validateFeedlot({ name, state: 'TX', city: 'X', emails: name + '@x.com' }).values);
    const dry = await repo.bulkInsert(rows, userId, { dryRun: true });
    expect(dry).toEqual({ inserted: 3, skipped: 0 });
    expect((await repo.list({ ...page, staff: true })).total).toBe(0);
    expect(Number((await client.query('SELECT count(*) AS n FROM feedlot_log')).rows[0].n)).toBe(0);

    expect(await repo.bulkInsert(rows, userId)).toEqual({ inserted: 3, skipped: 0 });
    expect((await repo.list({ ...page, staff: true })).total).toBe(3);
    const created = (await client.query("SELECT new_value FROM feedlot_log WHERE field = 'created' ORDER BY id")).rows.map((r) => r.new_value);
    expect(created).toEqual(['One (imported)', 'Two (imported)', 'Three (imported)']);

    const more = [...rows, validateFeedlot({ name: 'Four', state: 'TX', city: 'X' }).values];
    expect(await repo.bulkInsert(more, userId)).toEqual({ inserted: 1, skipped: 3 });
    expect((await repo.list({ ...page, staff: true })).total).toBe(4);
  });

  test('bulkInsert: an error part way through saves none of it', async () => {
    const good = validateFeedlot({ name: 'Good', state: 'TX' }).values;
    const broken = { name: 'Broken', state: 'TX', zip: '12' }; // not tidied: the database refuses it
    await expect(repo.bulkInsert([good, broken], userId)).rejects.toThrow();
    expect((await repo.list({ ...page, staff: true })).total).toBe(0);
  });
});
