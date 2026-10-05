'use strict';
const request = require('supertest');
const { createApp } = require('../src/app');
const { signToken } = require('../src/auth');
const { validateFeederListing } = require('../src/routes/feederListings');
const { validateBreedingListing } = require('../src/routes/breedingListings');
const { suggestGroupId, cleanName } = require('../src/routes/ref');
const { cleanParams } = require('../src/routes/savedFilters');

const SECRET = 'test-secret-that-is-at-least-32-characters-long';
const NOW = new Date('2026-10-04T12:00:00Z');

const FEEDER = {
  groupId: 'BARFIELD100',
  steerCount: 40,
  heiferCount: 20,
  avgWeightSteers: 600,
  avgWeightHeifers: 550,
  breeds: ['Red Angus'],
  marketingMethod: 'off_ranch',
  marketingDate: '2026-11-15',
  state: 'tx',
  zip: '77845',
  askingPrice: '1.85',
  priceBasis: 'per_cwt',
  contactName: 'Pat Rancher',
  contactPhone: '(979) 555-0100',
  contactEmail: 'Pat@Example.com',
};
const BREEDING = {
  headCount: 3,
  sexClass: 'bull',
  breeds: ['Red Angus'],
  saleType: 'private_treaty',
  saleDate: '2026-11-15',
  state: 'TX',
  zip: '77845',
  callForPrice: true,
  contactName: 'Pat Rancher',
  contactPhone: '(979) 555-0100',
  contactEmail: 'pat@example.com',
  epds: [{ trait: 'bw', value: '1.5' }, { trait: 'ww', unknown: true }],
};

function fakeUsers() {
  const rows = [
    { id: 1, display_name: 'Pat Barfield', role: 'member', is_active: true },
    { id: 2, display_name: 'Staff', role: 'staff', is_active: true },
    { id: 3, display_name: 'Other', role: 'member', is_active: true },
  ];
  return { findById: async (id) => rows.find((r) => String(r.id) === String(id)) || null };
}

// Stores whatever it is given, shaped like database rows.
function fakeListings() {
  const rows = [];
  let next = 1;
  const toRow = (id, ownerId, v, status = 'pending') => ({
    id,
    owner_id: ownerId,
    status,
    owner_name: 'Pat Barfield',
    group_id: v.groupId,
    group_id_optout: v.groupIdOptout,
    headline: v.headline,
    steer_count: v.steerCount,
    heifer_count: v.heiferCount,
    head_count: v.headCount != null ? v.headCount : v.steerCount + v.heiferCount,
    breeds: v.breeds,
    state: v.state,
    city: v.city,
    zip: v.zip,
    tag_visual_start: v.tagVisualStart,
    contact_name: v.contactName,
    contact_email: v.contactEmail,
    contact_phone: v.contactPhone,
    epds: v.epds,
    review_note: null,
  });
  return {
    rows,
    async create(ownerId, v) {
      const r = toRow(next++, ownerId, v);
      rows.push(r);
      return r;
    },
    async update(id, v) {
      const i = rows.findIndex((r) => String(r.id) === String(id));
      rows[i] = toRow(rows[i].id, rows[i].owner_id, v);
      return rows[i];
    },
    async get(id) {
      return rows.find((r) => String(r.id) === String(id)) || null;
    },
    async list(args) {
      this.lastList = args;
      const r = rows.filter((x) => x.status === 'approved');
      return { total: r.length, rows: r };
    },
    async mine(ownerId) {
      return rows.filter((r) => r.owner_id === ownerId);
    },
    async queue(status) {
      return rows.filter((r) => r.status === status);
    },
    async review(id, { decision, note }) {
      const r = rows.find((x) => String(x.id) === String(id));
      const from = decision === 'approve' ? ['pending'] : ['pending', 'approved'];
      if (!from.includes(r.status)) return false;
      r.status = decision === 'approve' ? 'approved' : 'rejected';
      r.review_note = note;
      return true;
    },
    async close(id, status) {
      const r = rows.find((x) => String(x.id) === String(id));
      if (!['approved', 'pending', 'rejected'].includes(r.status)) return false;
      r.status = status;
      return true;
    },
    async pendingCount() {
      return rows.filter((r) => r.status === 'pending').length;
    },
    async countByOwner(ownerId) {
      return rows.filter((r) => r.owner_id === ownerId).length;
    },
  };
}

function fakeFilters() {
  const rows = [];
  let next = 1;
  return {
    async list(ownerId, kind) {
      return rows.filter((r) => r.owner_id === ownerId && (!kind || r.kind === kind));
    },
    async save(ownerId, kind, name, params) {
      let r = rows.find((x) => x.owner_id === ownerId && x.kind === kind && x.name === name);
      if (r) r.params = params;
      else {
        r = { id: next++, owner_id: ownerId, kind, name, params, created_at: NOW };
        rows.push(r);
      }
      return r;
    },
    async remove(ownerId, id) {
      const i = rows.findIndex((x) => x.owner_id === ownerId && String(x.id) === String(id));
      if (i < 0) return false;
      rows.splice(i, 1);
      return true;
    },
  };
}

function fakeRef({ available = true } = {}) {
  const calls = { vaccine: [], auction: [] };
  const zips = { 77845: { zip: '77845', city: 'College Station', state: 'TX', lat: 30.6, lon: -96.3 } };
  return {
    calls,
    available: () => available,
    breeds: async () => ['Red Angus', 'Angus'],
    programs: async (t) => [{ name: 'Weaned 45 days', type: 'PC' }, { name: 'Non-Hormone', type: 'SP' }].filter((p) => !t || p.type === t),
    epdTraits: async () => [{ code: 'BW', name: 'Birth Weight' }],
    vaccineProducts: async () => [{ id: 1, name: 'Bovi-Shield' }],
    auctions: async () => [{ id: 1, name: 'Bryan Livestock' }],
    zip: async (z) => zips[z] || null,
    async addVaccineProduct(x) {
      calls.vaccine.push(x);
      return { created: true, product: { id: 9, name: x.name, company: x.company } };
    },
    async addAuction(x) {
      calls.auction.push(x);
      return { created: true, auction: { id: 9, name: x.name, zip: x.zip } };
    },
  };
}

function makeApp(refOpts) {
  const feederListings = fakeListings();
  const breedingListings = fakeListings();
  const savedFilters = fakeFilters();
  const ref = fakeRef(refOpts);
  const app = createApp({
    db: { isConfigured: () => true, ping: async () => true },
    config: { jwtSecret: SECRET },
    users: fakeUsers(),
    barns: { available: () => false },
    listings: {},
    feeders: {},
    ref,
    feederListings,
    breedingListings,
    savedFilters,
    now: () => NOW.getTime(),
  });
  return { app, feederListings, breedingListings, savedFilters, ref };
}
const tok = (id, role) => 'Bearer ' + signToken({ id, role }, SECRET);
const owner = () => tok(1, 'member');
const staff = () => tok(2, 'staff');
const other = () => tok(3, 'member');

describe('validateFeederListing', () => {
  test('cleans a good listing and builds weight and headline', () => {
    const { values, errors } = validateFeederListing(FEEDER, NOW);
    expect(errors).toBeUndefined();
    expect(values).toMatchObject({
      steerCount: 40,
      heiferCount: 20,
      avgWeight: 583,
      state: 'TX',
      askingPrice: 1.85,
      contactEmail: 'pat@example.com',
      birthCountry: 'United States',
      headline: '40 steers and 20 heifers - Red Angus, 583 lbs',
    });
  });

  describe('breed makeup', () => {
    const mk = (extra) => validateFeederListing({ ...FEEDER, breeds: ['Red Angus', 'Angus'], ...extra }, NOW);

    test('is optional: no mode means no amounts', () => {
      const { values, errors } = mk({ breedAmounts: { 'Red Angus': '75' } });
      expect(errors).toBeUndefined();
      expect(values.breedMode).toBeNull();
      expect(values.breedAmounts).toEqual([null, null]);
    });

    test('percent amounts line up with the breeds (names matched ignoring case)', () => {
      const { values, errors } = mk({ breedMode: 'percent', breedAmounts: { 'red angus': '75', Angus: 25 } });
      expect(errors).toBeUndefined();
      expect(values.breedMode).toBe('percent');
      expect(values.breedAmounts).toEqual([75, 25]);
    });

    test('head counts; a blank amount is allowed; totals are not enforced', () => {
      const { values, errors } = mk({ breedMode: 'head', breedAmounts: { 'Red Angus': '10', Angus: '' } });
      expect(errors).toBeUndefined();
      expect(values.breedMode).toBe('head');
      expect(values.breedAmounts).toEqual([10, null]);
    });

    test('bad amounts and modes are refused', () => {
      expect(mk({ breedMode: 'percent', breedAmounts: { 'Red Angus': '101' } }).errors.breedAmounts).toMatch(/1 to 100/);
      expect(mk({ breedMode: 'percent', breedAmounts: { 'Red Angus': 'abc' } }).errors.breedAmounts).toBeDefined();
      expect(mk({ breedMode: 'head', breedAmounts: { 'Red Angus': '2.5' } }).errors.breedAmounts).toBeDefined();
      expect(mk({ breedMode: 'head', breedAmounts: { 'Red Angus': '0' } }).errors.breedAmounts).toBeDefined();
      expect(mk({ breedMode: 'half' }).errors.breedMode).toBeDefined();
      expect(mk({ breedMode: 'percent', breedAmounts: ['75'] }).errors.breedAmounts).toBeDefined();
    });
  });

  test('required fields each get a message', () => {
    const { errors } = validateFeederListing({}, NOW);
    expect(Object.keys(errors)).toEqual(expect.arrayContaining(['steerCount', 'breeds', 'marketingMethod', 'marketingDate', 'contactName', 'contactPhone', 'contactEmail']));
  });

  test('needs at least one head; heifers only is fine', () => {
    expect(validateFeederListing({ ...FEEDER, steerCount: 0, heiferCount: 0 }, NOW).errors.steerCount).toBeDefined();
    const ok = validateFeederListing({ ...FEEDER, steerCount: 0, avgWeightSteers: undefined, heiferCount: 12 }, NOW);
    expect(ok.errors).toBeUndefined();
    expect(ok.values.headline).toMatch(/^12 heifers/);
  });

  test('vaccination rows: blanks dropped, product required, dates checked', () => {
    const ok = validateFeederListing({ ...FEEDER, vaccinations: [{ product: 'Bovi-Shield', date: '2026-08-01' }, {}] }, NOW);
    expect(ok.values.vaccinations).toEqual([{ date: '2026-08-01', product: 'Bovi-Shield' }]);
    expect(validateFeederListing({ ...FEEDER, vaccinations: [{ date: '2026-08-01' }] }, NOW).errors.vaccinations).toBeDefined();
    expect(validateFeederListing({ ...FEEDER, vaccinations: [{ product: 'X', date: 'bad' }] }, NOW).errors.vaccinations).toBeDefined();
  });

  test('wean date cannot precede birth date; marketing date window', () => {
    expect(validateFeederListing({ ...FEEDER, birthDate: '2026-03-01', weanDate: '2026-02-01' }, NOW).errors.weanDate).toBeDefined();
    expect(validateFeederListing({ ...FEEDER, marketingDate: '2020-01-01' }, NOW).errors.marketingDate).toBeDefined();
  });

  test('price needs a basis; call for price clears it', () => {
    expect(validateFeederListing({ ...FEEDER, priceBasis: '' }, NOW).errors.priceBasis).toBeDefined();
    expect(validateFeederListing({ ...FEEDER, callForPrice: true }, NOW).values).toMatchObject({ askingPrice: null, priceBasis: null, callForPrice: true });
  });
});

describe('validateBreedingListing', () => {
  test('cleans a good listing; unknown EPDs have no value', () => {
    const { values, errors } = validateBreedingListing(BREEDING, NOW);
    expect(errors).toBeUndefined();
    expect(values.epds).toEqual([{ trait: 'BW', value: 1.5 }, { trait: 'WW', value: null }]);
    expect(values.headline).toBe('3 Red Angus Bulls');
  });

  test('bad EPD rows are rejected', () => {
    expect(validateBreedingListing({ ...BREEDING, epds: [{ trait: 'BW', value: 'abc' }] }, NOW).errors.epds).toBeDefined();
    expect(validateBreedingListing({ ...BREEDING, epds: [{ trait: 'BW', value: 1 }, { trait: 'bw', value: 2 }] }, NOW).errors.epds).toMatch(/twice/);
  });

  test('primary breed must be one of the breeds', () => {
    expect(validateBreedingListing({ ...BREEDING, primaryBreed: 'Hereford' }, NOW).errors.primaryBreed).toBeDefined();
  });
});

describe('feeder listings API', () => {
  const create = (app, over = {}) => request(app).post('/api/feeder-listings').set('Authorization', owner()).send({ ...FEEDER, ...over });

  test('creating needs a login, fills city from the zip, and starts pending', async () => {
    const { app } = makeApp();
    expect((await request(app).post('/api/feeder-listings').send(FEEDER)).status).toBe(401);
    const res = await create(app);
    expect(res.status).toBe(201);
    expect(res.body.listing).toMatchObject({ status: 'pending', mine: true, zip: '77845', groupId: 'BARFIELD100' });
  });

  test('zip that does not match the state is refused', async () => {
    const { app } = makeApp();
    const res = await create(app, { state: 'OK' });
    expect(res.status).toBe(400);
    expect(res.body.fields).toBeDefined();
  });

  test('21st listing in a day is refused', async () => {
    const { app } = makeApp();
    for (let i = 0; i < 20; i += 1) expect((await create(app)).status).toBe(201);
    expect((await create(app)).status).toBe(429);
  });

  test('visibility: public hides contact and tags; members see contact but not zip; owner sees all', async () => {
    const { app, feederListings } = makeApp();
    await create(app, { tagVisualStart: 'V100' });
    feederListings.rows[0].status = 'approved';
    const pub = (await request(app).get('/api/feeder-listings/1')).body.listing;
    expect(pub.contactEmail).toBeUndefined();
    expect(pub.tagVisualStart).toBeUndefined();
    expect(pub.zip).toBeUndefined();
    const mem = (await request(app).get('/api/feeder-listings/1').set('Authorization', other())).body.listing;
    expect(mem).toMatchObject({ contactEmail: 'pat@example.com', tagVisualStart: 'V100', mine: false });
    expect(mem.zip).toBeUndefined();
    const own = (await request(app).get('/api/feeder-listings/1').set('Authorization', owner())).body.listing;
    expect(own).toMatchObject({ zip: '77845', mine: true });
  });

  test('group id opt-out hides the id from others but not the owner', async () => {
    const { app, feederListings } = makeApp();
    await create(app, { groupIdOptout: true });
    feederListings.rows[0].status = 'approved';
    expect((await request(app).get('/api/feeder-listings/1').set('Authorization', other())).body.listing.groupId).toBeNull();
    expect((await request(app).get('/api/feeder-listings/1').set('Authorization', owner())).body.listing.groupId).toBe('BARFIELD100');
  });

  test('unapproved listings are hidden from others; search passes filters through', async () => {
    const { app, feederListings } = makeApp();
    await create(app);
    expect((await request(app).get('/api/feeder-listings/1')).status).toBe(404);
    expect((await request(app).get('/api/feeder-listings/1').set('Authorization', other())).status).toBe(404);
    expect((await request(app).get('/api/feeder-listings/1').set('Authorization', staff())).status).toBe(200);
    await request(app).get('/api/feeder-listings?breed=Red%20Angus&state=tx&tagged=1&zip=77845&miles=100&sort=distance&pageSize=500');
    expect(feederListings.lastList).toMatchObject({
      breeds: ['Red Angus'],
      state: 'TX',
      tagged: true,
      sort: 'distance',
      pageSize: 50,
      center: { lat: 30.6, lon: -96.3, miles: 100 },
    });
  });

  test('distance search with an unknown zip is a validation error', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/feeder-listings?zip=00000&miles=50');
    expect(res.status).toBe(400);
  });

  test('editing is owner only and sends the listing back to pending', async () => {
    const { app, feederListings } = makeApp();
    await create(app);
    feederListings.rows[0].status = 'approved';
    expect((await request(app).put('/api/feeder-listings/1').set('Authorization', other()).send(FEEDER)).status).toBe(404);
    const res = await request(app).put('/api/feeder-listings/1').set('Authorization', owner()).send({ ...FEEDER, steerCount: 10 });
    expect(res.status).toBe(200);
    expect(res.body.listing.status).toBe('pending');
  });

  test('closed listings cannot be edited; closing is owner only', async () => {
    const { app } = makeApp();
    await create(app);
    expect((await request(app).post('/api/feeder-listings/1/close').set('Authorization', other()).send({ status: 'sold' })).status).toBe(404);
    expect((await request(app).post('/api/feeder-listings/1/close').set('Authorization', owner()).send({ status: 'bad' })).status).toBe(400);
    expect((await request(app).post('/api/feeder-listings/1/close').set('Authorization', owner()).send({ status: 'sold' })).status).toBe(200);
    expect((await request(app).put('/api/feeder-listings/1').set('Authorization', owner()).send(FEEDER)).status).toBe(409);
  });

  test('staff review: members are refused; approve then a second approve conflicts', async () => {
    const { app } = makeApp();
    await create(app);
    expect((await request(app).post('/api/feeder-listings/1/review').set('Authorization', owner()).send({ decision: 'approve' })).status).toBe(403);
    expect((await request(app).get('/api/feeder-listings/pending-count').set('Authorization', staff())).body.pending).toBe(1);
    expect((await request(app).post('/api/feeder-listings/1/review').set('Authorization', staff()).send({ decision: 'approve' })).status).toBe(200);
    expect((await request(app).post('/api/feeder-listings/1/review').set('Authorization', staff()).send({ decision: 'approve' })).status).toBe(409);
  });
});

describe('breeding listings API', () => {
  test('create, read back as member, pending count', async () => {
    const { app, breedingListings } = makeApp();
    const res = await request(app).post('/api/breeding-listings').set('Authorization', owner()).send(BREEDING);
    expect(res.status).toBe(201);
    breedingListings.rows[0].status = 'approved';
    const list = await request(app).get('/api/breeding-listings?class=bull&epd=BW:0:3').set('Authorization', other());
    expect(list.status).toBe(200);
    expect(list.body.listings).toHaveLength(1);
    expect(breedingListings.lastList.epds).toEqual([{ code: 'BW', min: 0, max: 3 }]);
    expect(list.body.listings[0].contactEmail).toBe('pat@example.com');
  });

  test('validation errors come back per field', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/breeding-listings').set('Authorization', owner()).send({});
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields)).toEqual(expect.arrayContaining(['headCount', 'sexClass', 'breeds', 'saleType', 'saleDate']));
  });
});

describe('reference API', () => {
  test('lists are public; zip lookup works and 404s', async () => {
    const { app } = makeApp();
    expect((await request(app).get('/api/ref/breeds')).body.breeds[0]).toBe('Red Angus');
    expect((await request(app).get('/api/ref/programs?type=SP')).body.programs).toHaveLength(1);
    expect((await request(app).get('/api/ref/countries')).body.countries).toContain('United States');
    expect((await request(app).get('/api/ref/zip/77845')).body.city).toBe('College Station');
    expect((await request(app).get('/api/ref/zip/00000')).status).toBe(404);
    expect((await request(app).get('/api/ref/zip/abc')).status).toBe(404);
  });

  test('503 when BTN is not configured', async () => {
    const { app } = makeApp({ available: false });
    const res = await request(app).get('/api/ref/breeds');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('reference_not_configured');
  });

  test('group id suggestion uses last name and counts listings', async () => {
    const { app } = makeApp();
    expect((await request(app).get('/api/ref/group-id')).status).toBe(401);
    await request(app).post('/api/feeder-listings').set('Authorization', owner()).send(FEEDER);
    expect((await request(app).get('/api/ref/group-id').set('Authorization', owner())).body.groupId).toBe('BARFIELD101');
    expect(suggestGroupId('', 0)).toBe('RAA100');
  });

  test('adding products and auctions needs login, clean names, and is limited', async () => {
    const { app, ref } = makeApp();
    expect((await request(app).post('/api/ref/auctions').send({ name: 'X Market' })).status).toBe(401);
    expect((await request(app).post('/api/ref/auctions').set('Authorization', owner()).send({ name: '<script>' })).status).toBe(400);
    expect((await request(app).post('/api/ref/auctions').set('Authorization', owner()).send({ name: 'Mid State Market', zip: 'abc' })).status).toBe(400);
    const ok = await request(app).post('/api/ref/auctions').set('Authorization', owner()).send({ name: 'Mid  State Market', zip: '77845' });
    expect(ok.status).toBe(201);
    expect(ref.calls.auction[0]).toEqual({ name: 'Mid State Market', zip: '77845' });
    expect((await request(app).post('/api/ref/vaccine-products').set('Authorization', owner()).send({ name: 'Vira Shield 6', company: 'Elanco' })).status).toBe(201);
    for (let i = 0; i < 28; i += 1) await request(app).post('/api/ref/vaccine-products').set('Authorization', owner()).send({ name: `Product ${i}` });
    expect((await request(app).post('/api/ref/vaccine-products').set('Authorization', owner()).send({ name: 'One More' })).status).toBe(429);
  });

  test('cleanName', () => {
    expect(cleanName('  Bovi-Shield   Gold 5 ')).toBe('Bovi-Shield Gold 5');
    expect(cleanName("x'; DROP TABLE")).toBeNull();
    expect(cleanName('a')).toBeNull();
  });
});

describe('saved filters API', () => {
  test('save, replace by name, list, delete; others cannot delete', async () => {
    const { app } = makeApp();
    const post = (b, who = owner()) => request(app).post('/api/saved-filters').set('Authorization', who).send(b);
    expect((await request(app).get('/api/saved-filters')).status).toBe(401);
    const a = await post({ kind: 'feeder', name: 'Texas reds', params: { state: 'TX', breed: ['Red Angus'], junk: 'x' } });
    expect(a.status).toBe(201);
    expect(a.body.filter.params).toEqual({ state: 'TX', breed: ['Red Angus'] });
    const b = await post({ kind: 'feeder', name: 'texas REDS', params: { state: 'OK' } });
    expect(b.status).toBe(200);
    expect((await request(app).get('/api/saved-filters?kind=feeder').set('Authorization', owner())).body.filters).toHaveLength(1);
    expect((await request(app).get('/api/saved-filters?kind=breeding').set('Authorization', owner())).body.filters).toHaveLength(0);
    expect((await request(app).delete('/api/saved-filters/1').set('Authorization', other())).status).toBe(404);
    expect((await request(app).delete('/api/saved-filters/1').set('Authorization', owner())).status).toBe(200);
  });

  test('needs a kind, a name and at least one filter; capped at 25 per kind', async () => {
    const { app } = makeApp();
    const post = (b) => request(app).post('/api/saved-filters').set('Authorization', owner()).send(b);
    expect((await post({ kind: 'cats', name: 'x', params: { q: 'a' } })).status).toBe(400);
    expect((await post({ kind: 'feeder', name: '', params: { q: 'a' } })).status).toBe(400);
    expect((await post({ kind: 'feeder', name: 'x', params: { bogus: 'a' } })).status).toBe(400);
    for (let i = 0; i < 25; i += 1) expect((await post({ kind: 'feeder', name: `s${i}`, params: { q: 'a' } })).status).toBe(201);
    expect((await post({ kind: 'feeder', name: 'one too many', params: { q: 'a' } })).status).toBe(409);
    expect((await post({ kind: 'feeder', name: 's3', params: { q: 'b' } })).status).toBe(200);
  });

  test('cleanParams keeps only known keys per kind', () => {
    expect(cleanParams('breeding', { class: ['bull'], tagged: '1', epd: ['BW:0:3'] })).toEqual({ class: ['bull'], epd: ['BW:0:3'] });
  });
});
