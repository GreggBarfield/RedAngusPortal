'use strict';
// Runs only when TEST_DATABASE_URL points at an EMPTY scratch database.
// It drops and rebuilds tables there. Never point it at the real raaaa database.
const { Client } = require('pg');
const { runMigrations } = require('../src/migrate');
const { createFeederListingsRepo } = require('../src/feederListings');
const { createBreedingListingsRepo } = require('../src/breedingListings');
const { createSavedFiltersRepo } = require('../src/savedFilters');
const { validateFeederListing } = require('../src/routes/feederListings');
const { validateBreedingListing } = require('../src/routes/breedingListings');

const url = process.env.TEST_DATABASE_URL;
const maybe = url ? describe : describe.skip;
const NOW = new Date('2026-10-04T12:00:00Z');

const DROP =
  'DROP TABLE IF EXISTS showlist_sends, showlists, feedlot_log, feedlots, saved_filters, raa_listing_attachments, raa_listing_photos, breeding_listing_epds, breeding_listing_breeds, breeding_listings, feeder_listing_vaccinations, feeder_listing_programs, feeder_listing_breeds, feeder_listings, feeder_lots, listings, barn_contact_log, barn_settings, users, schema_migrations CASCADE';

const FEEDER = {
  groupId: 'PAT100',
  steerCount: 40,
  heiferCount: 20,
  avgWeightSteers: 600,
  avgWeightHeifers: 540,
  birthDate: '2026-03-01',
  weanDate: '2026-08-15',
  vetName: 'Dr. Lee',
  breeds: ['Red Angus', 'Angus'],
  preconditioning: ['VAC 45'],
  special: ['Angus Access'],
  description: 'Home raised.',
  nutrition: 'Hay and cake',
  vaccinations: [{ date: '2026-08-01', product: 'Bovi-Shield Gold' }, { product: 'Dewormer' }],
  marketingMethod: 'off_ranch',
  marketingDate: '2026-11-15',
  state: 'TX',
  zip: '77801',
  askingPrice: '1.85',
  priceBasis: 'per_cwt',
  contactName: 'Pat Rancher',
  contactPhone: '(979) 555-0100',
  contactEmail: 'pat@example.com',
};

const BREEDING = {
  headCount: 1,
  sexClass: 'bull',
  birthDate: '2025-02-10',
  regNumber: 'RA 12345',
  breeds: ['Red Angus'],
  breedClass: 'purebred',
  sire: 'Red Thunder',
  dam: 'Lady Red',
  saleType: 'private_treaty',
  saleDate: '2026-12-01',
  state: 'TX',
  zip: '77801',
  askingPrice: 4500,
  contactName: 'Pat Rancher',
  contactPhone: '979-555-0100',
  contactEmail: 'pat@example.com',
  epds: [{ trait: 'bw', value: '2.1' }, { trait: 'WW', value: 55 }, { trait: 'CED', unknown: true }],
};

// distance in miles, same formula the database uses
function miles(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}
const BRYAN = { lat: 30.6744, lon: -96.3699 };
const HOUSTON = { lat: 29.7604, lon: -95.3698 };
const DALLAS = { lat: 32.7767, lon: -96.797 };

maybe('new listing tables (real Postgres)', () => {
  let client;
  let feeders;
  let breeding;
  let filters;
  let ownerId;
  let staffId;
  const quiet = () => {};

  const feeder = (over = {}, where = BRYAN) => {
    const { values, errors } = validateFeederListing({ ...FEEDER, ...over }, NOW);
    if (errors) throw new Error('bad test data: ' + JSON.stringify(errors));
    values.lat = where ? where.lat : null;
    values.lon = where ? where.lon : null;
    return values;
  };
  const bull = (over = {}, where = BRYAN) => {
    const { values, errors } = validateBreedingListing({ ...BREEDING, ...over }, NOW);
    if (errors) throw new Error('bad test data: ' + JSON.stringify(errors));
    values.lat = where ? where.lat : null;
    values.lon = where ? where.lon : null;
    return values;
  };
  const fsearch = (o = {}) => feeders.list({ page: 1, pageSize: 20, ...o });
  const bsearch = (o = {}) => breeding.list({ page: 1, pageSize: 20, ...o });
  const approve = async (repo, id) => expect(await repo.review(id, { decision: 'approve', note: null, reviewerId: staffId })).toBe(true);

  beforeAll(async () => {
    client = new Client({ connectionString: url });
    await client.connect();
    await client.query(DROP);
    await runMigrations({ connectionString: url, log: quiet });
    ownerId = (await client.query("INSERT INTO users (email, password_hash, display_name, membership_number) VALUES ('o@x.com','x','Owner','1') RETURNING id")).rows[0].id;
    staffId = (await client.query("INSERT INTO users (email, password_hash, display_name, membership_number, role) VALUES ('s@x.com','x','Staff','2','staff') RETURNING id")).rows[0].id;
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
    breeding = createBreedingListingsRepo(db);
    filters = createSavedFiltersRepo(db);
  });
  afterAll(async () => {
    await client.query(DROP);
    await client.end();
  });

  describe('feeder listings', () => {
    test('create and read back every part of the form', async () => {
      const row = await feeders.create(ownerId, feeder());
      expect(row).toMatchObject({
        status: 'pending',
        group_id: 'PAT100',
        steer_count: 40,
        heifer_count: 20,
        head_count: 60,
        avg_weight: 580,
        birth_date: '2026-03-01',
        wean_date: '2026-08-15',
        marketing_method: 'off_ranch',
        marketing_date: '2026-11-15',
        asking_price: 1.85,
        price_basis: 'per_cwt',
        owner_name: 'Owner',
        headline: '40 steers and 20 heifers - Red Angus, 580 lbs',
      });
      expect(row.breeds).toEqual(['Red Angus', 'Angus']);
      expect(row.programs).toEqual([
        { name: 'VAC 45', type: 'PC' },
        { name: 'Angus Access', type: 'SP' },
      ]);
      expect(row.vaccinations).toEqual([
        { date: '2026-08-01', product: 'Bovi-Shield Gold' },
        { date: null, product: 'Dewormer' },
      ]);
    });

    test('a failed save leaves nothing behind', async () => {
      const before = Number((await client.query('SELECT count(*) AS n FROM feeder_listing_breeds')).rows[0].n);
      const bad = feeder();
      bad.marketingMethod = 'garage_sale'; // the database refuses this
      await expect(feeders.create(ownerId, bad)).rejects.toThrow();
      expect(Number((await client.query('SELECT count(*) AS n FROM feeder_listing_breeds')).rows[0].n)).toBe(before);
    });

    test('breed amounts are saved with each breed, replaced on edit, and cleared when the mode is dropped', async () => {
      const v = (extra) => feeder({ breedMode: 'percent', breedAmounts: { 'Red Angus': '75', Angus: '25' }, ...extra });
      const r = await feeders.create(ownerId, v());
      expect(r.breed_mode).toBe('percent');
      expect(r.breeds).toEqual(['Red Angus', 'Angus']);
      expect(r.breed_amounts).toEqual([75, 25]);
      const up = await feeders.update(r.id, v({ breedMode: 'head', breedAmounts: { 'Red Angus': '45', Angus: '15' } }));
      expect(up.breed_mode).toBe('head');
      expect(up.breed_amounts).toEqual([45, 15]);
      const none = await feeders.update(r.id, feeder());
      expect(none.breed_mode).toBeNull();
      expect(none.breed_amounts).toEqual([null, null]);
    });

    test('only approved listings appear in search; words reach breeds, programs, vaccines and group id', async () => {
      await client.query('DELETE FROM feeder_listings');
      const a = await feeders.create(ownerId, feeder({ groupId: 'ALPHA100' }));
      const b = await feeders.create(
        ownerId,
        feeder({
          groupId: 'BRAVO200',
          groupIdOptout: true,
          breeds: ['Hereford'],
          preconditioning: [],
          special: ['Certified Hereford Beef'],
          vaccinations: [{ product: 'Ultrabac 7' }],
          state: 'MT',
          marketingMethod: 'auction',
          auctionName: 'Billings Livestock',
          marketingDate: '2026-12-10',
          steerCount: 0,
          heiferCount: 100,
          avgWeightHeifers: 700,
          avgWeightSteers: null,
          birthDate: '2025-10-01',
          tagEidStart: '840003123456',
        }, HOUSTON),
      );
      expect((await fsearch()).total).toBe(0);
      await approve(feeders, a.id);
      await approve(feeders, b.id);
      expect((await fsearch()).total).toBe(2);
      const names = async (o) => (await fsearch(o)).rows.map((r) => r.group_id);
      expect(await names({ q: 'hereford' })).toEqual(['BRAVO200']);
      expect(await names({ q: 'ultrabac' })).toEqual(['BRAVO200']);
      expect(await names({ q: 'angus access' })).toEqual(['ALPHA100']);
      expect(await names({ q: 'alpha' })).toEqual(['ALPHA100']);
      expect(await names({ q: 'bravo' })).toEqual([]); // opted-out group ids are not searchable
      expect(await names({ q: 'billings' })).toEqual(['BRAVO200']);
      expect(await names({ q: '100%' })).toEqual([]);
    });

    test('state, breed, program, method, date, tag, weight and age filters', async () => {
      const names = async (o) => (await fsearch({ sort: 'marketingDate', dir: 'asc', ...o })).rows.map((r) => r.group_id);
      expect(await names({ state: 'MT' })).toEqual(['BRAVO200']);
      expect(await names({ breeds: ['red angus'] })).toEqual(['ALPHA100']);
      expect(await names({ breeds: ['Red Angus', 'Hereford'] })).toEqual(['ALPHA100', 'BRAVO200']);
      expect(await names({ programs: ['certified hereford beef'] })).toEqual(['BRAVO200']);
      expect(await names({ method: 'auction' })).toEqual(['BRAVO200']);
      expect(await names({ dateFrom: '2026-12-01' })).toEqual(['BRAVO200']);
      expect(await names({ dateTo: '2026-11-30' })).toEqual(['ALPHA100']);
      expect(await names({ tagged: true })).toEqual(['BRAVO200']);
      expect(await names({ minWeight: 650 })).toEqual(['BRAVO200']);
      expect(await names({ maxWeight: 600 })).toEqual(['ALPHA100']);
      expect(await names({ minAge: 10 })).toEqual(['BRAVO200']); // born 2025-10-01
      expect(await names({ maxAge: 9 })).toEqual(['ALPHA100']); // born 2026-03-01
    });

    test('distance search measures from the zip code and can sort by it', async () => {
      const near = await fsearch({ center: { ...BRYAN, miles: 30 } });
      expect(near.rows.map((r) => r.group_id)).toEqual(['ALPHA100']);
      expect(near.rows[0].distance_miles).toBeLessThan(1);
      const wide = await fsearch({ center: { ...DALLAS, miles: 500 }, sort: 'distance', dir: 'asc' });
      expect(wide.rows.map((r) => r.group_id)).toEqual(['ALPHA100', 'BRAVO200']);
      expect(wide.rows[0].distance_miles).toBeCloseTo(miles(DALLAS, BRYAN), 0);
      expect(wide.rows[1].distance_miles).toBeCloseTo(miles(DALLAS, HOUSTON), 0);
      expect((await fsearch({ center: { ...DALLAS, miles: 150 } })).rows.map((r) => r.group_id)).toEqual(['ALPHA100']);
    });

    test('sorting and paging', async () => {
      const first = await fsearch({ sort: 'headCount', dir: 'desc', pageSize: 1 });
      expect(first.total).toBe(2);
      expect(first.rows.map((r) => r.group_id)).toEqual(['BRAVO200']); // 100 head
      const second = await fsearch({ sort: 'headCount', dir: 'desc', pageSize: 1, page: 2 });
      expect(second.rows.map((r) => r.group_id)).toEqual(['ALPHA100']); // 60 head
    });

    test('an edit replaces the child rows and sends the listing back to pending', async () => {
      const r = await feeders.create(ownerId, feeder({ groupId: 'EDIT100' }));
      await approve(feeders, r.id);
      const up = await feeders.update(r.id, feeder({ groupId: 'EDIT100', breeds: ['Charolais'], preconditioning: [], special: [], vaccinations: [] }));
      expect(up).toMatchObject({ status: 'pending', approved_at: null });
      expect(up.breeds).toEqual(['Charolais']);
      expect(up.programs).toEqual([]);
      expect(up.vaccinations).toEqual([]);
    });

    test('review rules, close, queue, counts', async () => {
      const r = await feeders.create(ownerId, feeder({ groupId: 'RULES100' }));
      expect(await feeders.review(r.id, { decision: 'approve', note: null, reviewerId: staffId })).toBe(true);
      expect(await feeders.review(r.id, { decision: 'approve', note: null, reviewerId: staffId })).toBe(false);
      expect(await feeders.review(r.id, { decision: 'reject', note: 'Add weights', reviewerId: staffId })).toBe(true);
      expect(await feeders.get(r.id)).toMatchObject({ status: 'rejected', review_note: 'Add weights' });
      expect(await feeders.close(r.id, 'sold')).toBe(true);
      expect(await feeders.close(r.id, 'withdrawn')).toBe(false);
      expect((await feeders.queue('pending')).every((x) => x.status === 'pending')).toBe(true);
      expect(await feeders.pendingCount()).toBeGreaterThanOrEqual(1);
      expect(await feeders.countByOwner(ownerId)).toBeGreaterThanOrEqual(4);
      expect((await feeders.mine(ownerId))[0].breeds.length).toBeGreaterThan(0);
    });

    test('the database refuses bad combinations', async () => {
      const id = (await client.query('SELECT min(id) AS id FROM feeder_listings')).rows[0].id;
      await expect(client.query('UPDATE feeder_listings SET asking_price = 5, price_basis = NULL WHERE id = $1', [id])).rejects.toThrow();
      await expect(client.query("UPDATE feeder_listings SET call_for_price = true, asking_price = 5, price_basis = 'per_head' WHERE id = $1", [id])).rejects.toThrow();
      await expect(client.query('UPDATE feeder_listings SET steer_count = 0, heifer_count = 0 WHERE id = $1', [id])).rejects.toThrow();
      await expect(client.query("INSERT INTO feeder_listing_programs (listing_id, program_name, program_type) VALUES ($1, 'x', 'ZZ')", [id])).rejects.toThrow();
    });

    test('deleting a listing removes its child rows', async () => {
      const r = await feeders.create(ownerId, feeder({ groupId: 'GONE100' }));
      await client.query('DELETE FROM feeder_listings WHERE id = $1', [r.id]);
      for (const t of ['feeder_listing_breeds', 'feeder_listing_programs', 'feeder_listing_vaccinations']) {
        expect(Number((await client.query(`SELECT count(*) AS n FROM ${t} WHERE listing_id = $1`, [r.id])).rows[0].n)).toBe(0);
      }
    });
  });

  describe('breeding listings', () => {
    test('create and read back, with EPD rows in order', async () => {
      const row = await breeding.create(ownerId, bull());
      expect(row).toMatchObject({
        status: 'pending',
        sex_class: 'bull',
        head_count: 1,
        reg_number: 'RA 12345',
        primary_breed: 'Red Angus',
        breed_class: 'purebred',
        sale_type: 'private_treaty',
        sale_date: '2026-12-01',
        asking_price: 4500,
        headline: 'Red Angus Bull',
        owner_name: 'Owner',
      });
      expect(row.breeds).toEqual(['Red Angus']);
      expect(row.epds).toEqual([
        { trait: 'BW', value: 2.1, unknown: false },
        { trait: 'WW', value: 55, unknown: false },
        { trait: 'CED', value: null, unknown: true },
      ]);
    });

    test('search filters: words, class, breed, dates, EPD ranges, distance', async () => {
      await client.query('DELETE FROM breeding_listings');
      const a = await breeding.create(ownerId, bull({ sire: 'Alpha Sire' }));
      const b = await breeding.create(
        ownerId,
        bull(
          {
            sexClass: 'cow',
            headCount: 3,
            breeds: ['Angus', 'Red Angus'],
            primaryBreed: 'Angus',
            regNumber: null,
            sire: 'Bravo Sire',
            saleType: 'auction',
            auctionName: 'Dallas Livestock',
            saleDate: '2026-11-10',
            state: 'TX',
            epds: [{ trait: 'BW', value: 4.5 }, { trait: 'WW', value: 40 }],
          },
          DALLAS,
        ),
      );
      await approve(breeding, a.id);
      await approve(breeding, b.id);
      const sires = async (o) => (await bsearch({ sort: 'saleDate', dir: 'asc', ...o })).rows.map((r) => r.sire);
      expect(await sires({})).toEqual(['Bravo Sire', 'Alpha Sire']);
      expect(await sires({ q: 'alpha' })).toEqual(['Alpha Sire']);
      expect(await sires({ q: 'dallas' })).toEqual(['Bravo Sire']);
      expect(await sires({ classes: ['cow'] })).toEqual(['Bravo Sire']);
      expect(await sires({ classes: ['bull', 'cow'] })).toHaveLength(2);
      expect(await sires({ breeds: ['angus'] })).toEqual(['Bravo Sire']);
      expect(await sires({ dateFrom: '2026-11-20' })).toEqual(['Alpha Sire']);
      expect(await sires({ dateTo: '2026-11-20' })).toEqual(['Bravo Sire']);
      // EPD: BW 2.1 vs 4.5; CED is unknown for the bull so it never matches a range
      expect(await sires({ epds: [{ code: 'bw', min: null, max: 3 }] })).toEqual(['Alpha Sire']);
      expect(await sires({ epds: [{ code: 'BW', min: 4, max: null }] })).toEqual(['Bravo Sire']);
      expect(await sires({ epds: [{ code: 'BW', min: 1, max: 5 }, { code: 'WW', min: 50, max: null }] })).toEqual(['Alpha Sire']);
      expect(await sires({ epds: [{ code: 'CED', min: -50, max: 50 }] })).toEqual([]);
      const near = await bsearch({ center: { ...BRYAN, miles: 40 } });
      expect(near.rows.map((r) => r.sire)).toEqual(['Alpha Sire']);
    });

    test('an edit replaces breeds and EPD rows and returns to pending', async () => {
      const r = await breeding.create(ownerId, bull());
      await approve(breeding, r.id);
      const up = await breeding.update(r.id, bull({ breeds: ['Hereford'], epds: [] }));
      expect(up).toMatchObject({ status: 'pending', approved_at: null });
      expect(up.breeds).toEqual(['Hereford']);
      expect(up.epds).toEqual([]);
    });

    test('review, close, queue, counts and database rules', async () => {
      const r = await breeding.create(ownerId, bull());
      expect(await breeding.review(r.id, { decision: 'reject', note: 'Add a photo later', reviewerId: staffId })).toBe(true);
      expect(await breeding.close(r.id, 'withdrawn')).toBe(true);
      expect(await breeding.pendingCount()).toBeGreaterThanOrEqual(1);
      expect(await breeding.countByOwner(ownerId)).toBeGreaterThanOrEqual(3);
      expect((await breeding.queue('pending')).every((x) => x.status === 'pending')).toBe(true);
      await expect(client.query("INSERT INTO breeding_listing_epds (listing_id, trait_code, value, unknown) VALUES ($1, 'BW', 1, true)", [r.id])).rejects.toThrow();
      await expect(client.query("INSERT INTO breeding_listing_epds (listing_id, trait_code, value, unknown) VALUES ($1, 'BW', NULL, false)", [r.id])).rejects.toThrow();
      await expect(client.query("UPDATE breeding_listings SET sex_class = 'goat' WHERE id = $1", [r.id])).rejects.toThrow();
    });
  });

  describe('saved filters', () => {
    test('save, replace by name, list by kind, remove only your own', async () => {
      const a = await filters.save(ownerId, 'feeder', 'Texas steers', { state: 'TX', breed: ['Red Angus'] });
      expect(a).toMatchObject({ kind: 'feeder', name: 'Texas steers', params: { state: 'TX', breed: ['Red Angus'] } });
      const again = await filters.save(ownerId, 'feeder', 'Texas steers', { state: 'OK' });
      expect(again.id).toBe(a.id);
      expect(again.params).toEqual({ state: 'OK' });
      await filters.save(ownerId, 'breeding', 'Low BW bulls', { class: ['bull'], epd: ['BW::3'] });
      expect((await filters.list(ownerId, 'feeder')).map((f) => f.name)).toEqual(['Texas steers']);
      expect(await filters.list(ownerId, '')).toHaveLength(2);
      expect(await filters.remove(staffId, a.id)).toBe(false);
      expect(await filters.remove(ownerId, a.id)).toBe(true);
      expect(await filters.list(ownerId, 'feeder')).toEqual([]);
    });
  });
});
