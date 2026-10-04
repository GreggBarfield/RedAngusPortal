'use strict';
// Runs only when BOTH TEST_DATABASE_URL (an empty scratch database) and
// TEST_BARNS_URL (a scratch copy of the BTN barn table that the login can
// update) are set. Never point these at the real databases.
const { Client, Pool } = require('pg');
const { runMigrations } = require('../src/migrate');
const { createBarnsRepo } = require('../src/barns');

const url = process.env.TEST_DATABASE_URL;
const barnsUrl = process.env.TEST_BARNS_URL;
const maybe = url && barnsUrl ? describe : describe.skip;

maybe('barns repo (real Postgres)', () => {
  let app;
  let btnClient;
  let pool;
  let repo;
  let userId;
  const quiet = () => {};

  beforeAll(async () => {
    app = new Client({ connectionString: url });
    await app.connect();
    await app.query('DROP TABLE IF EXISTS barn_contact_log, barn_settings, users, schema_migrations CASCADE');
    await runMigrations({ connectionString: url, log: quiet });
    userId = (
      await app.query(
        "INSERT INTO users (email, password_hash, display_name, membership_number, role) VALUES ('s@x.com','x','Staff','1','staff') RETURNING id",
      )
    ).rows[0].id;
    btnClient = new Client({ connectionString: barnsUrl });
    await btnClient.connect();
    await btnClient.query('DROP TABLE IF EXISTS public.auction_barns');
    await btnClient.query(`CREATE TABLE public.auction_barns (
      auction_no int PRIMARY KEY, auc_name text NOT NULL, auc_addr text, auc_city text, auc_state text, auc_zip text,
      auc_email text, auc_phone text, auc_fax text, contact_name text, preferred_method text, is_active boolean NOT NULL DEFAULT true,
      category text NOT NULL DEFAULT 'REG', updated_at timestamptz NOT NULL DEFAULT now())`);
    await btnClient.query(`INSERT INTO public.auction_barns (auction_no, auc_name, auc_city, auc_state, auc_fax, auc_email)
      VALUES (1,'Alpha Auction','Bryan','TX','979-555-0001','a@x.com'), (2,'Bravo 100% Barn','Billings','MT',NULL,NULL), (3,'Charlie_Sale','Boise','ID',NULL,NULL)`);
    pool = new Pool({ connectionString: barnsUrl, max: 2 });
    repo = createBarnsRepo({
      db: { query: (t, p) => app.query(t, p) },
      btn: {
        canRead: () => true,
        canWrite: () => true,
        read: { query: (t, p) => pool.query(t, p) },
        write: { connect: () => pool.connect() },
      },
    });
  });
  afterAll(async () => {
    await app.query('DROP TABLE IF EXISTS barn_contact_log, barn_settings, users, schema_migrations CASCADE');
    await btnClient.query('DROP TABLE IF EXISTS public.auction_barns');
    await app.end();
    await btnClient.end();
    await pool.end();
  });

  test('search treats % and _ as plain text, filters by state', async () => {
    expect((await repo.list({ q: '100%', page: 1, pageSize: 25 })).total).toBe(1);
    expect((await repo.list({ q: 'e_s', page: 1, pageSize: 25 })).total).toBe(1);
    expect((await repo.list({ q: 'a', state: 'MT', page: 1, pageSize: 25 })).rows.map((r) => r.auction_no)).toEqual([2]);
    expect((await repo.states()).map((s) => s.state)).toEqual(['ID', 'MT', 'TX']);
  });

  test('contact change writes to BTN and is logged', async () => {
    const r = await repo.updateContact({ auctionNo: 1, changes: { fax: '979-555-0002' }, expected: { fax: '979-555-0001' }, overwrite: false, userId });
    expect(r.status).toBe('ok');
    expect((await repo.get(1)).auc_fax).toBe('979-555-0002');
    const log = await repo.log(1);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ field: 'fax', old_value: '979-555-0001', new_value: '979-555-0002', overwrote: false, changed_by: 'Staff' });
  });

  test('warns when BTN changed since the editor opened, overwrites only when told', async () => {
    await btnClient.query("UPDATE public.auction_barns SET auc_fax = '979-555-0777' WHERE auction_no = 1");
    const warn = await repo.updateContact({ auctionNo: 1, changes: { fax: '979-555-0003' }, expected: { fax: '979-555-0002' }, overwrite: false, userId });
    expect(warn.status).toBe('conflict');
    expect(warn.current.fax).toBe('979-555-0777');
    expect((await repo.get(1)).auc_fax).toBe('979-555-0777');
    const go = await repo.updateContact({ auctionNo: 1, changes: { fax: '979-555-0003' }, expected: { fax: '979-555-0002' }, overwrite: true, userId });
    expect(go.status).toBe('ok');
    const log = await repo.log(1);
    expect(log[0]).toMatchObject({ old_value: '979-555-0777', new_value: '979-555-0003', overwrote: true });
  });

  test('no real change writes nothing; unknown barn is reported', async () => {
    const same = await repo.updateContact({ auctionNo: 1, changes: { fax: '979-555-0003' }, expected: null, overwrite: false, userId });
    expect(same.changed).toEqual([]);
    expect((await repo.updateContact({ auctionNo: 99, changes: { fax: '979-555-0003' }, expected: null, overwrite: false, userId })).status).toBe('not_found');
  });

  test('a value can be cleared', async () => {
    const r = await repo.updateContact({ auctionNo: 1, changes: { email: null }, expected: { email: 'a@x.com' }, overwrite: false, userId });
    expect(r.changed[0]).toMatchObject({ field: 'email', newValue: null });
    expect((await repo.get(1)).auc_email).toBeNull();
  });

  test('empty strings in BTN count as empty: no false warning, no false change', async () => {
    await btnClient.query("UPDATE public.auction_barns SET auc_fax = '', auc_email = '' WHERE auction_no = 3");
    const r = await repo.updateContact({
      auctionNo: 3,
      changes: { fax: null, email: null },
      expected: { fax: '', email: '' },
      overwrite: false,
      userId,
    });
    expect(r.status).toBe('ok');
    expect(r.changed).toEqual([]);
    expect((await repo.get(3)).auc_fax).toBe('');
    const set = await repo.updateContact({ auctionNo: 3, changes: { fax: '979-555-0300' }, expected: { fax: null }, overwrite: false, userId });
    expect(set.status).toBe('ok');
    expect(set.changed).toHaveLength(1);
  });

  test('settings upsert', async () => {
    await repo.saveSettings(2, { sendMethod: 'fax', enabled: false, notes: 'n' }, userId);
    await repo.saveSettings(2, { sendMethod: null, enabled: true, notes: null }, userId);
    const m = await repo.settingsFor([2, 3]);
    expect(m.get(2)).toMatchObject({ send_method: null, enabled: true });
    expect(m.has(3)).toBe(false);
  });
});
