'use strict';
const request = require('supertest');
const { createApp } = require('../src/app');
const { signToken } = require('../src/auth');
const { validateContactChanges } = require('../src/routes/barns');

const SECRET = 'test-secret-that-is-at-least-32-characters-long';

const BARN = {
  auction_no: 7,
  auc_name: 'Test Livestock Auction',
  auc_addr: '1 Main St',
  auc_city: 'Bryan',
  auc_state: 'TX',
  auc_zip: '77801',
  auc_email: 'sales@test.example',
  auc_phone: '979-555-0100',
  auc_fax: '979-555-0101',
  contact_name: 'Sam Seller',
  preferred_method: 'FAX',
  is_active: true,
  category: 'REG',
};

function fakeUsers() {
  const rows = [
    { id: 1, email: 'm@x.com', display_name: 'Member', role: 'member', is_active: true },
    { id: 2, email: 's@x.com', display_name: 'Staff', role: 'staff', is_active: true },
  ];
  return { findById: async (id) => rows.find((r) => String(r.id) === String(id)) || null };
}

function fakeBarns({ canWrite = true } = {}) {
  const calls = { update: [], saved: [] };
  const settings = new Map([[7, { auction_no: 7, send_method: 'email', enabled: true, notes: 'internal note' }]]);
  return {
    calls,
    available: () => true,
    canWrite: () => canWrite,
    async list(args) {
      calls.list = args;
      return { total: 1, rows: [BARN] };
    },
    async states() {
      return [{ state: 'TX', n: 1 }];
    },
    async get(id) {
      return id === 7 ? BARN : null;
    },
    async settingsFor(ids) {
      return new Map(ids.filter((i) => settings.has(i)).map((i) => [i, settings.get(i)]));
    },
    async saveSettings(id, s, userId) {
      calls.saved.push({ id, s, userId });
      return { auction_no: id, send_method: s.sendMethod, enabled: s.enabled, notes: s.notes };
    },
    async log() {
      return [{ id: 1, field: 'fax', old_value: 'a', new_value: 'b', overwrote: false, changed_at: new Date(0), changed_by: 'Staff' }];
    },
    async updateContact(args) {
      calls.update.push(args);
      if (args.auctionNo !== 7) return { status: 'not_found' };
      if (args.expected && args.expected.fax === 'stale' && !args.overwrite) {
        return { status: 'conflict', current: { email: 'a', phone: 'b', fax: 'c', contactName: 'd' }, conflicts: ['fax'] };
      }
      return { status: 'ok', changed: [{ field: 'fax', oldValue: 'x', newValue: 'y' }], logged: true };
    },
  };
}

function makeApp(opts) {
  const barns = fakeBarns(opts);
  const app = createApp({
    db: { isConfigured: () => true, ping: async () => true },
    config: { jwtSecret: SECRET },
    users: fakeUsers(),
    barns,
  });
  return { app, barns };
}
const tok = (id, role) => 'Bearer ' + signToken({ id, role }, SECRET);

describe('GET /api/barns', () => {
  test('a visitor sees names and places but no contact details', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/barns?q=test');
    expect(res.status).toBe(200);
    expect(res.body.barns[0]).toEqual({
      auctionNo: 7,
      name: 'Test Livestock Auction',
      city: 'Bryan',
      state: 'TX',
      category: 'REG',
      isActive: true,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/555|sales@|Sam Seller|internal note/);
  });

  test('a bad token is treated as a visitor', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/barns').set('Authorization', 'Bearer nonsense');
    expect(res.status).toBe(200);
    expect(res.body.barns[0].fax).toBeUndefined();
  });

  test('a signed-in member sees contacts but not staff notes', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/barns').set('Authorization', tok(1, 'member'));
    expect(res.body.barns[0]).toMatchObject({ email: 'sales@test.example', fax: '979-555-0101', sendMethod: 'email', btnPreferredMethod: 'fax' });
    expect(res.body.barns[0].notes).toBeUndefined();
  });

  test('staff also see notes', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/barns/7').set('Authorization', tok(2, 'staff'));
    expect(res.body.barn.notes).toBe('internal note');
  });

  test('query values are cleaned before they reach the database', async () => {
    const { app, barns } = makeApp();
    await request(app).get('/api/barns?state=tx&category=reg&page=-4&pageSize=9999&active=1');
    expect(barns.calls.list).toMatchObject({ state: 'TX', category: 'REG', page: 1, pageSize: 100, activeOnly: true });
    await request(app).get('/api/barns?state=Texas&category=zzz');
    expect(barns.calls.list).toMatchObject({ state: '', category: '' });
  });

  test('unknown barn and odd ids give 404', async () => {
    const { app } = makeApp();
    expect((await request(app).get('/api/barns/999')).status).toBe(404);
    expect((await request(app).get('/api/barns/abc')).status).toBe(404);
  });

  test('lists states', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/barns/states');
    expect(res.body.states).toEqual([{ state: 'TX', n: 1 }]);
  });
});

describe('staff editing', () => {
  const body = { changes: { fax: '(979) 555-0199' }, expected: { fax: '979-555-0101' } };

  test('needs a login, and staff role', async () => {
    const { app } = makeApp();
    expect((await request(app).patch('/api/barns/7/contact').send(body)).status).toBe(401);
    const res = await request(app).patch('/api/barns/7/contact').set('Authorization', tok(1, 'member')).send(body);
    expect(res.status).toBe(403);
  });

  test('staff change goes through with the user id', async () => {
    const { app, barns } = makeApp();
    const res = await request(app).patch('/api/barns/7/contact').set('Authorization', tok(2, 'staff')).send(body);
    expect(res.status).toBe(200);
    expect(res.body.changed[0].field).toBe('fax');
    expect(barns.calls.update[0]).toMatchObject({ auctionNo: 7, userId: 2, overwrite: false, changes: { fax: '(979) 555-0199' } });
  });

  test('a changed value in BTN comes back as a warning, and overwrite goes through', async () => {
    const { app, barns } = makeApp();
    const stale = { changes: { fax: '979-555-0199' }, expected: { fax: 'stale' } };
    const warn = await request(app).patch('/api/barns/7/contact').set('Authorization', tok(2, 'staff')).send(stale);
    expect(warn.status).toBe(409);
    expect(warn.body.error).toBe('conflict');
    expect(warn.body.current.fax).toBe('c');
    const go = await request(app).patch('/api/barns/7/contact').set('Authorization', tok(2, 'staff')).send({ ...stale, overwrite: true });
    expect(go.status).toBe(200);
    expect(barns.calls.update[1].overwrite).toBe(true);
  });

  test('bad values are refused before BTN is touched', async () => {
    const { app, barns } = makeApp();
    const res = await request(app)
      .patch('/api/barns/7/contact')
      .set('Authorization', tok(2, 'staff'))
      .send({ changes: { email: 'nope', fax: '123', phone: 'abc' } });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields).sort()).toEqual(['email', 'fax', 'phone']);
    expect(barns.calls.update).toHaveLength(0);
  });

  test('cannot change any other BTN field', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .patch('/api/barns/7/contact')
      .set('Authorization', tok(2, 'staff'))
      .send({ changes: { name: 'Hacked', is_active: false } });
    expect(res.status).toBe(400);
  });

  test('unknown barn is 404; write login missing is 503', async () => {
    const a = makeApp();
    expect((await request(a.app).patch('/api/barns/8/contact').set('Authorization', tok(2, 'staff')).send(body)).status).toBe(404);
    const b = makeApp({ canWrite: false });
    expect((await request(b.app).patch('/api/barns/7/contact').set('Authorization', tok(2, 'staff')).send(body)).status).toBe(503);
  });

  test('settings: staff only, validated', async () => {
    const { app, barns } = makeApp();
    expect((await request(app).put('/api/barns/7/settings').set('Authorization', tok(1, 'member')).send({ enabled: true })).status).toBe(403);
    const bad = await request(app).put('/api/barns/7/settings').set('Authorization', tok(2, 'staff')).send({ sendMethod: 'carrier pigeon', enabled: 'yes' });
    expect(bad.status).toBe(400);
    const ok = await request(app).put('/api/barns/7/settings').set('Authorization', tok(2, 'staff')).send({ sendMethod: 'fax', enabled: false, notes: ' hi ' });
    expect(ok.status).toBe(200);
    expect(barns.calls.saved[0]).toMatchObject({ id: 7, userId: 2, s: { sendMethod: 'fax', enabled: false, notes: 'hi' } });
  });

  test('change log is staff only', async () => {
    const { app } = makeApp();
    expect((await request(app).get('/api/barns/7/log').set('Authorization', tok(1, 'member'))).status).toBe(403);
    const res = await request(app).get('/api/barns/7/log').set('Authorization', tok(2, 'staff'));
    expect(res.body.log[0]).toMatchObject({ field: 'fax', changedBy: 'Staff' });
  });
});

describe('not configured', () => {
  test('503 when the barn database is not set up', async () => {
    const app = createApp({
      db: { isConfigured: () => true, ping: async () => true },
      config: { jwtSecret: SECRET },
      users: fakeUsers(),
      barns: { available: () => false },
    });
    expect((await request(app).get('/api/barns')).status).toBe(503);
  });
});

describe('validateContactChanges', () => {
  test('lowercases email, allows clearing a value', () => {
    expect(validateContactChanges({ email: ' A@B.COM ', fax: '' }).values).toEqual({ email: 'a@b.com', fax: null });
  });
  test('nothing to change is an error', () => {
    expect(validateContactChanges({}).errors).toBeDefined();
  });
});
