'use strict';
const request = require('supertest');
const { createApp } = require('../src/app');
const { signToken } = require('../src/auth');
const { validateListing } = require('../src/routes/listings');

const SECRET = 'test-secret-that-is-at-least-32-characters-long';
const GOOD = {
  kind: 'bull',
  name: 'Red Thunder 12A',
  regNumber: 'RA-1234567',
  tag: 'A12',
  birthDate: '2024-02-10',
  sireName: 'Big Red',
  sireReg: 'RA-111',
  damName: 'Rosie',
  damReg: 'RA-222',
  birthWeight: 78,
  weaningWeight: 640,
  yearlingWeight: 1150,
  scrotal: 36.5,
  headCount: 1,
  city: 'Bryan',
  state: 'tx',
  zip: '77801',
  askingPrice: '$4,500',
  description: 'Gentle, calving ease.',
  contactName: 'Pat Rancher',
  contactPhone: '(979) 555-0100',
  contactEmail: 'Pat@Example.com',
};

function fakeUsers() {
  const rows = [
    { id: 1, display_name: 'Owner', role: 'member', is_active: true },
    { id: 2, display_name: 'Staff', role: 'staff', is_active: true },
    { id: 3, display_name: 'Other', role: 'member', is_active: true },
  ];
  return { findById: async (id) => rows.find((r) => String(r.id) === String(id)) || null };
}

// In-memory stand-in with the same behavior rules as the SQL.
function fakeListings() {
  const rows = [];
  let next = 1;
  const toRow = (id, ownerId, v, extra = {}) => ({
    id,
    owner_id: ownerId,
    kind: v.kind,
    name: v.name,
    reg_number: v.regNumber,
    tag: v.tag,
    birth_date: v.birthDate,
    sire_name: v.sireName,
    sire_reg: v.sireReg,
    dam_name: v.damName,
    dam_reg: v.damReg,
    birth_weight: v.birthWeight,
    weaning_weight: v.weaningWeight,
    yearling_weight: v.yearlingWeight,
    scrotal: v.scrotal,
    bred_to: v.bredTo,
    due_date: v.dueDate,
    head_count: v.headCount,
    city: v.city,
    state: v.state,
    zip: v.zip,
    asking_price: v.askingPrice,
    call_for_price: v.callForPrice,
    description: v.description,
    contact_name: v.contactName,
    contact_phone: v.contactPhone,
    contact_email: v.contactEmail,
    status: 'pending',
    review_note: null,
    approved_at: null,
    owner_name: 'Owner',
    ...extra,
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
  };
}

function makeApp() {
  const listings = fakeListings();
  const app = createApp({
    db: { isConfigured: () => true, ping: async () => true },
    config: { jwtSecret: SECRET },
    users: fakeUsers(),
    barns: { available: () => false },
    listings,
  });
  return { app, listings };
}
const tok = (id, role) => 'Bearer ' + signToken({ id, role }, SECRET);
const owner = () => tok(1, 'member');
const staff = () => tok(2, 'staff');
const other = () => tok(3, 'member');

async function createOne(app, over = {}) {
  const res = await request(app).post('/api/listings').set('Authorization', owner()).send({ ...GOOD, ...over });
  return res;
}

describe('creating a listing', () => {
  test('needs a login', async () => {
    const { app } = makeApp();
    expect((await request(app).post('/api/listings').send(GOOD)).status).toBe(401);
  });

  test('is saved as pending with cleaned values', async () => {
    const { app } = makeApp();
    const res = await createOne(app);
    expect(res.status).toBe(201);
    expect(res.body.listing).toMatchObject({
      status: 'pending',
      state: 'TX',
      askingPrice: 4500,
      contactEmail: 'pat@example.com',
      scrotal: 36.5,
    });
  });

  test('each missing or bad field gets its own message', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', owner())
      .send({ kind: 'dog', name: '', birthDate: 'soon', city: '', state: 'Texas', zip: '1', contactName: '', contactPhone: '12', contactEmail: 'x' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields).sort()).toEqual(
      ['birthDate', 'city', 'contactEmail', 'contactName', 'contactPhone', 'kind', 'name', 'state', 'zip'].sort(),
    );
  });

  test('limits how many a person can post per day', async () => {
    const { app } = makeApp();
    for (let i = 0; i < 20; i++) expect((await createOne(app)).status).toBe(201);
    expect((await createOne(app)).status).toBe(429);
  });
});

describe('visibility', () => {
  test('pending listings are hidden from the public, other members and search', async () => {
    const { app } = makeApp();
    const id = (await createOne(app)).body.listing.id;
    expect((await request(app).get('/api/listings/' + id)).status).toBe(404);
    expect((await request(app).get('/api/listings/' + id).set('Authorization', other())).status).toBe(404);
    expect((await request(app).get('/api/listings/' + id).set('Authorization', owner())).status).toBe(200);
    expect((await request(app).get('/api/listings/' + id).set('Authorization', staff())).status).toBe(200);
    expect((await request(app).get('/api/listings')).body.total).toBe(0);
  });

  test('approved listings are public but contact details need a login', async () => {
    const { app } = makeApp();
    const id = (await createOne(app)).body.listing.id;
    await request(app).post(`/api/listings/${id}/review`).set('Authorization', staff()).send({ decision: 'approve' });
    const visitor = await request(app).get('/api/listings/' + id);
    expect(visitor.status).toBe(200);
    expect(visitor.body.listing.name).toBe('Red Thunder 12A');
    expect(JSON.stringify(visitor.body)).not.toMatch(/555|pat@example|Pat Rancher|A12|77801/);
    const member = await request(app).get('/api/listings/' + id).set('Authorization', other());
    expect(member.body.listing.contactPhone).toBe('(979) 555-0100');
    expect(member.body.listing.tag).toBeUndefined();
    expect(member.body.listing.mine).toBe(false);
    const mine = await request(app).get('/api/listings/' + id).set('Authorization', owner());
    expect(mine.body.listing.mine).toBe(true);
    const list = await request(app).get('/api/listings');
    expect(list.body.total).toBe(1);
    expect(list.body.listings[0].contactPhone).toBeUndefined();
  });
});

describe('editing and closing', () => {
  test('only the owner can edit, and an edit goes back to pending', async () => {
    const { app } = makeApp();
    const id = (await createOne(app)).body.listing.id;
    await request(app).post(`/api/listings/${id}/review`).set('Authorization', staff()).send({ decision: 'approve' });
    expect((await request(app).put('/api/listings/' + id).set('Authorization', other()).send(GOOD)).status).toBe(404);
    const res = await request(app).put('/api/listings/' + id).set('Authorization', owner()).send({ ...GOOD, askingPrice: 5000 });
    expect(res.status).toBe(200);
    expect(res.body.listing.status).toBe('pending');
    expect((await request(app).get('/api/listings/' + id)).status).toBe(404);
  });

  test('owner can mark sold; sold listings cannot be edited', async () => {
    const { app } = makeApp();
    const id = (await createOne(app)).body.listing.id;
    expect((await request(app).post(`/api/listings/${id}/close`).set('Authorization', other()).send({ status: 'sold' })).status).toBe(404);
    expect((await request(app).post(`/api/listings/${id}/close`).set('Authorization', owner()).send({ status: 'bad' })).status).toBe(400);
    expect((await request(app).post(`/api/listings/${id}/close`).set('Authorization', owner()).send({ status: 'sold' })).status).toBe(200);
    expect((await request(app).put('/api/listings/' + id).set('Authorization', owner()).send(GOOD)).status).toBe(409);
  });

  test('my listings shows only mine', async () => {
    const { app } = makeApp();
    await createOne(app);
    expect((await request(app).get('/api/listings/mine').set('Authorization', owner())).body.listings).toHaveLength(1);
    expect((await request(app).get('/api/listings/mine').set('Authorization', other())).body.listings).toHaveLength(0);
    expect((await request(app).get('/api/listings/mine')).status).toBe(401);
  });
});

describe('staff review', () => {
  test('queue and counts are staff only', async () => {
    const { app } = makeApp();
    await createOne(app);
    expect((await request(app).get('/api/listings/queue').set('Authorization', owner())).status).toBe(403);
    expect((await request(app).get('/api/listings/queue').set('Authorization', staff())).body.listings).toHaveLength(1);
    expect((await request(app).get('/api/listings/pending-count').set('Authorization', staff())).body.pending).toBe(1);
  });

  test('reject needs a reason; approve does not; wrong status is refused', async () => {
    const { app } = makeApp();
    const id = (await createOne(app)).body.listing.id;
    const noNote = await request(app).post(`/api/listings/${id}/review`).set('Authorization', staff()).send({ decision: 'reject' });
    expect(noNote.status).toBe(400);
    expect((await request(app).post(`/api/listings/${id}/review`).set('Authorization', owner()).send({ decision: 'approve' })).status).toBe(403);
    expect((await request(app).post(`/api/listings/${id}/review`).set('Authorization', staff()).send({ decision: 'approve' })).status).toBe(200);
    expect((await request(app).post(`/api/listings/${id}/review`).set('Authorization', staff()).send({ decision: 'approve' })).status).toBe(409);
    const pull = await request(app).post(`/api/listings/${id}/review`).set('Authorization', staff()).send({ decision: 'reject', note: 'Photo missing' });
    expect(pull.status).toBe(200);
    const mine = await request(app).get('/api/listings/mine').set('Authorization', owner());
    expect(mine.body.listings[0]).toMatchObject({ status: 'rejected', reviewNote: 'Photo missing' });
  });
});

describe('search words', () => {
  test('are cleaned before reaching the database', async () => {
    const { app, listings } = makeApp();
    await request(app).get('/api/listings?q=thunder&kind=bull&state=tx&page=-3&pageSize=999');
    expect(listings.lastList).toEqual({ q: 'thunder', kind: 'bull', state: 'TX', page: 1, pageSize: 50 });
    await request(app).get('/api/listings?kind=dog&state=Texas');
    expect(listings.lastList).toMatchObject({ kind: '', state: '' });
  });
});

describe('validateListing', () => {
  const now = new Date('2026-10-04T00:00:00Z');
  test('drops bull-only and female-only details for the wrong type', () => {
    const bull = validateListing({ ...GOOD, bredTo: 'X', dueDate: '2026-12-01' }, now).values;
    expect(bull.bredTo).toBeNull();
    expect(bull.dueDate).toBeNull();
    const cow = validateListing({ ...GOOD, kind: 'cow', scrotal: 40, bredTo: 'Big Red', dueDate: '2027-02-01' }, now).values;
    expect(cow.scrotal).toBeNull();
    expect(cow.bredTo).toBe('Big Red');
    expect(cow.dueDate).toBe('2027-02-01');
  });
  test('call for price clears the price', () => {
    expect(validateListing({ ...GOOD, callForPrice: true }, now).values.askingPrice).toBeNull();
  });
  test('birth date cannot be in the future', () => {
    expect(validateListing({ ...GOOD, birthDate: '2027-01-01' }, now).errors.birthDate).toBeDefined();
  });
  test('weights must be in a sensible range', () => {
    expect(Object.keys(validateListing({ ...GOOD, birthWeight: 5, weaningWeight: 5000 }, now).errors).sort()).toEqual(['birthWeight', 'weaningWeight']);
  });
});
