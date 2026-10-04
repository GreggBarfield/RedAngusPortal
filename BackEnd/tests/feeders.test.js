'use strict';
const request = require('supertest');
const { createApp } = require('../src/app');
const { signToken } = require('../src/auth');
const { validateFeeder } = require('../src/routes/feeders');

const SECRET = 'test-secret-that-is-at-least-32-characters-long';
const NOW = new Date('2026-10-04T12:00:00Z');
const GOOD = {
  title: '60 black-red steer calves',
  headCount: 60,
  sex: 'steers',
  avgWeight: 550,
  weightLow: 500,
  weightHigh: 600,
  breed: '75% Red Angus',
  ageMonths: 7,
  weaned: true,
  weanedDays: 45,
  healthProgram: 'Two rounds of shots, dewormed',
  hornStatus: 'polled',
  bunkBroke: true,
  siredBy: 'Red Thunder',
  saleType: 'private_treaty',
  availableDate: '2026-11-15',
  city: 'Bryan',
  state: 'tx',
  zip: '77801',
  askingPrice: '$1.85',
  priceBasis: 'per_cwt',
  description: 'Home raised.',
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

function fakeFeeders() {
  const rows = [];
  let next = 1;
  const toRow = (id, ownerId, v) => ({
    id,
    owner_id: ownerId,
    title: v.title,
    head_count: v.headCount,
    sex: v.sex,
    avg_weight: v.avgWeight,
    weight_low: v.weightLow,
    weight_high: v.weightHigh,
    breed: v.breed,
    age_months: v.ageMonths,
    weaned: v.weaned,
    weaned_days: v.weanedDays,
    health_program: v.healthProgram,
    horn_status: v.hornStatus,
    bunk_broke: v.bunkBroke,
    sired_by: v.siredBy,
    sale_type: v.saleType,
    available_date: v.availableDate,
    city: v.city,
    state: v.state,
    zip: v.zip,
    price_basis: v.priceBasis,
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
  const feeders = fakeFeeders();
  const app = createApp({
    db: { isConfigured: () => true, ping: async () => true },
    config: { jwtSecret: SECRET },
    users: fakeUsers(),
    barns: { available: () => false },
    listings: {},
    feeders,
  });
  return { app, feeders };
}
const tok = (id, role) => 'Bearer ' + signToken({ id, role }, SECRET);
const owner = () => tok(1, 'member');
const staff = () => tok(2, 'staff');
const other = () => tok(3, 'member');
const createOne = (app, over = {}) => request(app).post('/api/feeders').set('Authorization', owner()).send({ ...GOOD, ...over });

describe('validateFeeder', () => {
  test('cleans a good lot', () => {
    const { values, errors } = validateFeeder(GOOD, NOW);
    expect(errors).toBeUndefined();
    expect(values).toMatchObject({ state: 'TX', askingPrice: 1.85, priceBasis: 'per_cwt', contactEmail: 'pat@example.com', weanedDays: 45 });
  });

  test('required fields each get a message', () => {
    const { errors } = validateFeeder({}, NOW);
    expect(Object.keys(errors).sort()).toEqual(
      ['avgWeight', 'city', 'contactEmail', 'contactName', 'contactPhone', 'headCount', 'sex', 'state', 'title', 'zip'].sort(),
    );
  });

  test('weight range must bracket the average', () => {
    expect(validateFeeder({ ...GOOD, weightLow: 560 }, NOW).errors.weightLow).toBeDefined();
    expect(validateFeeder({ ...GOOD, weightHigh: 540 }, NOW).errors.weightHigh).toBeDefined();
  });

  test('weaned days only kept when weaned', () => {
    expect(validateFeeder({ ...GOOD, weaned: false }, NOW).values.weanedDays).toBeNull();
  });

  test('call for price clears the price; a price needs a basis', () => {
    const c = validateFeeder({ ...GOOD, callForPrice: true }, NOW).values;
    expect(c).toMatchObject({ askingPrice: null, priceBasis: null, callForPrice: true });
    expect(validateFeeder({ ...GOOD, priceBasis: '' }, NOW).errors.priceBasis).toBeDefined();
    expect(validateFeeder({ ...GOOD, askingPrice: '' }, NOW).values).toMatchObject({ askingPrice: null, priceBasis: null });
  });

  test('price limits depend on the basis', () => {
    expect(validateFeeder({ ...GOOD, askingPrice: '5000' }, NOW).errors.askingPrice).toBeDefined();
    expect(validateFeeder({ ...GOOD, askingPrice: '1800', priceBasis: 'per_head' }, NOW).errors).toBeUndefined();
  });

  test('available date must be sensible', () => {
    expect(validateFeeder({ ...GOOD, availableDate: '2020-01-01' }, NOW).errors.availableDate).toBeDefined();
    expect(validateFeeder({ ...GOOD, availableDate: '' }, NOW).values.availableDate).toBeNull();
  });
});

describe('feeder lots API', () => {
  test('creating needs a login and is saved pending', async () => {
    const { app } = makeApp();
    expect((await request(app).post('/api/feeders').send(GOOD)).status).toBe(401);
    const res = await createOne(app);
    expect(res.status).toBe(201);
    expect(res.body.lot).toMatchObject({ status: 'pending', mine: true, askingPrice: 1.85, zip: '77801' });
  });

  test('bad input returns per-field messages', async () => {
    const { app } = makeApp();
    const res = await createOne(app, { sex: 'goats', headCount: 0 });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields).sort()).toEqual(['headCount', 'sex']);
  });

  test('limits creations per day', async () => {
    const { app } = makeApp();
    for (let i = 0; i < 20; i++) expect((await createOne(app)).status).toBe(201);
    expect((await createOne(app)).status).toBe(429);
  });

  test('pending lots are hidden; approval makes them public without contact details', async () => {
    const { app } = makeApp();
    const id = (await createOne(app)).body.lot.id;
    expect((await request(app).get('/api/feeders/' + id)).status).toBe(404);
    expect((await request(app).get('/api/feeders/' + id).set('Authorization', other())).status).toBe(404);
    expect((await request(app).get('/api/feeders/' + id).set('Authorization', owner())).status).toBe(200);
    expect((await request(app).post(`/api/feeders/${id}/review`).set('Authorization', owner()).send({ decision: 'approve' })).status).toBe(403);
    expect((await request(app).post(`/api/feeders/${id}/review`).set('Authorization', staff()).send({ decision: 'approve' })).status).toBe(200);
    const visitor = await request(app).get('/api/feeders/' + id);
    expect(visitor.status).toBe(200);
    expect(JSON.stringify(visitor.body)).not.toMatch(/555|pat@example|Pat Rancher|77801/);
    const member = await request(app).get('/api/feeders/' + id).set('Authorization', other());
    expect(member.body.lot.contactPhone).toBe('(979) 555-0100');
    expect(member.body.lot.mine).toBe(false);
    expect(member.body.lot.zip).toBeUndefined();
    const list = await request(app).get('/api/feeders');
    expect(list.body.total).toBe(1);
    expect(list.body.lots[0].contactPhone).toBeUndefined();
  });

  test('search passes filters through', async () => {
    const { app, feeders } = makeApp();
    await request(app).get('/api/feeders?q=angus&sex=steers&state=tx&minWeight=500&maxWeight=700&sex=bad');
    expect(feeders.lastList).toMatchObject({ q: 'angus', state: 'TX', minWeight: 500, maxWeight: 700, page: 1, pageSize: 20 });
    await request(app).get('/api/feeders?sex=goats&minWeight=abc');
    expect(feeders.lastList).toMatchObject({ sex: '', minWeight: 0 });
  });

  test('only the owner edits; an edit goes back to pending; closed lots cannot be edited', async () => {
    const { app } = makeApp();
    const id = (await createOne(app)).body.lot.id;
    await request(app).post(`/api/feeders/${id}/review`).set('Authorization', staff()).send({ decision: 'approve' });
    expect((await request(app).put('/api/feeders/' + id).set('Authorization', other()).send(GOOD)).status).toBe(404);
    const res = await request(app).put('/api/feeders/' + id).set('Authorization', owner()).send({ ...GOOD, headCount: 70 });
    expect(res.status).toBe(200);
    expect(res.body.lot).toMatchObject({ status: 'pending', headCount: 70 });
    expect((await request(app).post(`/api/feeders/${id}/close`).set('Authorization', owner()).send({ status: 'sold' })).status).toBe(200);
    expect((await request(app).put('/api/feeders/' + id).set('Authorization', owner()).send(GOOD)).status).toBe(409);
  });

  test('rejecting needs a reason; the seller sees it', async () => {
    const { app } = makeApp();
    const id = (await createOne(app)).body.lot.id;
    const bad = await request(app).post(`/api/feeders/${id}/review`).set('Authorization', staff()).send({ decision: 'reject' });
    expect(bad.status).toBe(400);
    await request(app).post(`/api/feeders/${id}/review`).set('Authorization', staff()).send({ decision: 'reject', note: 'Add weights' });
    const mine = await request(app).get('/api/feeders/mine').set('Authorization', owner());
    expect(mine.body.lots[0]).toMatchObject({ status: 'rejected', reviewNote: 'Add weights' });
    expect((await request(app).post(`/api/feeders/${id}/review`).set('Authorization', staff()).send({ decision: 'approve' })).status).toBe(409);
  });

  test('queue and pending count are staff only', async () => {
    const { app } = makeApp();
    await createOne(app);
    expect((await request(app).get('/api/feeders/queue').set('Authorization', owner())).status).toBe(403);
    expect((await request(app).get('/api/feeders/queue').set('Authorization', staff())).body.lots).toHaveLength(1);
    expect((await request(app).get('/api/feeders/pending-count').set('Authorization', staff())).body.pending).toBe(1);
    expect((await request(app).get('/api/feeders/pending-count')).status).toBe(401);
  });
});
