'use strict';
// Runs only when TEST_BARNS_URL (an empty scratch copy of BTN's database, with a
// superuser login) is set. It builds scratch copies of BTN's pick-list tables, a
// limited login with exactly the production grants, and checks the repo works
// under those column-level privileges. Never point this at the real database.
const { Client, Pool } = require('pg');
const { createRefRepo } = require('../src/ref');

const adminUrl = process.env.TEST_BARNS_URL;
const maybe = adminUrl ? describe : describe.skip;
const ROLE = 'ref_rw_test';
const TABLES = ['feeder_ref_breeds', 'feeder_ref_programs', 'feeder_ref_medications', 'feeder_ref_auctions', 'ref_epd_traits', 'zip_codes', 'lotmast'];

maybe('ref repo (real Postgres, limited login)', () => {
  let admin;
  let pool;
  let repo;

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`DROP TABLE IF EXISTS ${TABLES.map((t) => 'public.' + t).join(', ')} CASCADE`);
    await admin.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${ROLE}') THEN CREATE ROLE ${ROLE} LOGIN; END IF; END $$`);
    await admin.query(`ALTER ROLE ${ROLE} LOGIN PASSWORD 'ref'`);
    await admin.query(`
      CREATE TABLE public.feeder_ref_breeds (id serial PRIMARY KEY, name varchar(100) NOT NULL, is_active boolean NOT NULL DEFAULT true, sort_order int NOT NULL DEFAULT 0, secret text);
      CREATE TABLE public.feeder_ref_programs (id serial PRIMARY KEY, prog_name varchar(100) NOT NULL, prog_type char(2) NOT NULL, prog_image text, is_active boolean NOT NULL DEFAULT true, sort_order int NOT NULL DEFAULT 0);
      CREATE TABLE public.feeder_ref_medications (id serial PRIMARY KEY, rx_name varchar(100) NOT NULL, is_active boolean NOT NULL DEFAULT true, is_custom boolean NOT NULL DEFAULT false, added_by int, created_at timestamptz NOT NULL DEFAULT now(), rx_company varchar(100), CONSTRAINT uq_feeder_ref_medications_name UNIQUE (rx_name));
      CREATE TABLE public.feeder_ref_auctions (id serial PRIMARY KEY, auction_no int, auc_name varchar(100) NOT NULL, auc_zip varchar(10), fax_number varchar(30), auc_active boolean NOT NULL DEFAULT true, is_custom boolean NOT NULL DEFAULT false, added_by int, created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT uq_feeder_ref_auctions_no UNIQUE (auction_no));
      CREATE TABLE public.ref_epd_traits (trait_code text PRIMARY KEY, display_name text NOT NULL, description text, unit text, breed_assoc text, is_active boolean DEFAULT true, sort_order int DEFAULT 0);
      CREATE TABLE public.zip_codes (zip char(5) PRIMARY KEY, city text NOT NULL, state_code char(2) NOT NULL, lat numeric NOT NULL, lon numeric NOT NULL);
      CREATE TABLE public.lotmast (id serial PRIMARY KEY);
      INSERT INTO public.feeder_ref_breeds (name, sort_order) VALUES ('Angus', 1), ('Red Angus', 2), ('Hereford', 3), ('Red Angus Cross', 4);
      INSERT INTO public.feeder_ref_breeds (name, is_active) VALUES ('Retired Breed', false);
      INSERT INTO public.feeder_ref_programs (prog_name, prog_type, sort_order) VALUES ('Weaned 45 Days', 'PC', 1), ('Non-Hormone', 'SP', 2), ('Old', 'SP', 3);
      UPDATE public.feeder_ref_programs SET is_active = false WHERE prog_name = 'Old';
      INSERT INTO public.feeder_ref_medications (rx_name, rx_company) VALUES ('Bovi-Shield Gold 5', 'Zoetis'), ('Ultrabac 7', 'Zoetis');
      INSERT INTO public.feeder_ref_auctions (auction_no, auc_name, auc_zip) VALUES (1, 'Bryan Livestock', '77801'), (2, '100% Cattle_Market', '59101');
      INSERT INTO public.ref_epd_traits (trait_code, display_name, unit, sort_order) VALUES ('BW', 'Birth Weight', 'lb', 1), ('WW', 'Weaning Weight', 'lb', 2);
      INSERT INTO public.zip_codes VALUES ('77845', 'College Station', 'TX', 30.5844, -96.2935);
      GRANT USAGE ON SCHEMA public TO ${ROLE};
      REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${ROLE};
      GRANT SELECT (id, name, is_active, sort_order) ON public.feeder_ref_breeds TO ${ROLE};
      GRANT SELECT (id, prog_name, prog_type, prog_image, is_active, sort_order) ON public.feeder_ref_programs TO ${ROLE};
      GRANT SELECT (id, rx_name, rx_company, is_active, is_custom) ON public.feeder_ref_medications TO ${ROLE};
      GRANT SELECT (id, auction_no, auc_name, auc_zip, auc_active, is_custom) ON public.feeder_ref_auctions TO ${ROLE};
      GRANT SELECT (trait_code, display_name, description, unit, breed_assoc, is_active, sort_order) ON public.ref_epd_traits TO ${ROLE};
      GRANT SELECT (zip, city, state_code, lat, lon) ON public.zip_codes TO ${ROLE};
      GRANT INSERT (rx_name, rx_company, is_custom) ON public.feeder_ref_medications TO ${ROLE};
      GRANT INSERT (auc_name, auc_zip, is_custom) ON public.feeder_ref_auctions TO ${ROLE};
      GRANT USAGE ON SEQUENCE public.feeder_ref_medications_id_seq, public.feeder_ref_auctions_id_seq TO ${ROLE};
    `);
    const u = new URL(adminUrl);
    u.username = ROLE;
    u.password = 'ref';
    pool = new Pool({ connectionString: u.toString(), max: 2 });
    repo = createRefRepo({ btn: { canRef: () => true, ref: { query: (t, p) => pool.query(t, p) } } });
  });

  afterAll(async () => {
    await pool.end();
    await admin.query(`DROP TABLE IF EXISTS ${TABLES.map((t) => 'public.' + t).join(', ')} CASCADE`);
    await admin.query(`DROP OWNED BY ${ROLE}`);
    await admin.end();
  });

  test('breeds list Red Angus first and skip inactive ones', async () => {
    expect(await repo.breeds()).toEqual(['Red Angus', 'Red Angus Cross', 'Angus', 'Hereford']);
  });

  test('programs by type, trimmed, inactive hidden', async () => {
    expect((await repo.programs('PC')).map((p) => p.name)).toEqual(['Weaned 45 Days']);
    expect((await repo.programs('SP')).map((p) => p.name)).toEqual(['Non-Hormone']);
    expect(await repo.programs('')).toHaveLength(2);
  });

  test('EPD traits and zip lookup', async () => {
    expect((await repo.epdTraits()).map((t) => t.code)).toEqual(['BW', 'WW']);
    expect(await repo.zip('77845')).toEqual({ zip: '77845', city: 'College Station', state: 'TX', lat: 30.5844, lon: -96.2935 });
    expect(await repo.zip('00000')).toBeNull();
  });

  test('searching treats % and _ as plain text', async () => {
    expect((await repo.auctions('100%')).map((a) => a.name)).toEqual(['100% Cattle_Market']);
    expect(await repo.auctions('0_C')).toHaveLength(0);
    expect((await repo.vaccineProducts('shield')).map((p) => p.name)).toEqual(['Bovi-Shield Gold 5']);
  });

  test('adding a product works under column grants, and a repeat in other capitals returns the existing one', async () => {
    const a = await repo.addVaccineProduct({ name: 'Vira Shield 6', company: 'Elanco' });
    expect(a).toMatchObject({ created: true, product: { name: 'Vira Shield 6', company: 'Elanco' } });
    const b = await repo.addVaccineProduct({ name: 'vira shield 6', company: null });
    expect(b.created).toBe(false);
    expect(b.product.id).toBe(a.product.id);
    const row = (await admin.query("SELECT is_custom, is_active FROM public.feeder_ref_medications WHERE rx_name = 'Vira Shield 6'")).rows[0];
    expect(row).toEqual({ is_custom: true, is_active: true });
  });

  test('adding an auction works, has no auction number, and repeats return the existing one', async () => {
    const a = await repo.addAuction({ name: 'Mid State Market', zip: '77845' });
    expect(a.created).toBe(true);
    expect(a.auction.auctionNo).toBeNull();
    const second = await repo.addAuction({ name: 'Another Market', zip: null });
    expect(second.created).toBe(true);
    expect((await repo.addAuction({ name: 'MID STATE MARKET', zip: null })).created).toBe(false);
  });

  test('the login cannot read other tables, columns it was not given, or change existing rows', async () => {
    await expect(pool.query('SELECT * FROM public.lotmast')).rejects.toThrow(/permission denied/);
    await expect(pool.query('SELECT secret FROM public.feeder_ref_breeds')).rejects.toThrow(/permission denied/);
    await expect(pool.query("UPDATE public.feeder_ref_medications SET rx_name = 'x'")).rejects.toThrow(/permission denied/);
    await expect(pool.query('DELETE FROM public.feeder_ref_auctions')).rejects.toThrow(/permission denied/);
    await expect(pool.query("INSERT INTO public.feeder_ref_breeds (name) VALUES ('x')")).rejects.toThrow(/permission denied/);
  });
});
