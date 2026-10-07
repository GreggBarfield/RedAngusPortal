'use strict';
const request = require('supertest');
const { createApp } = require('../src/app');
const { signToken } = require('../src/auth');

const SECRET = 'test-secret-that-is-at-least-32-characters-long';

const ROW = {
  id: '12',
  name: 'Pinal Feeding Co.-Maricopa',
  contact_name: 'Earl Petznick',
  address: '38351 W Cowtown Rd',
  city: 'Maricopa',
  state: 'AZ',
  zip: '85138',
  phone: '(602) 252-3467',
  emails: ['info@pinalfeeding.com', 'orders@pinalfeeding.com'],
  fax: '(602) 555-0100',
  website: 'www.pinalfeeding.com',
  notes: 'Prefers morning calls.',
  enabled: true,
  do_not_email: false,
  do_not_email_at: null,
  do_not_email_note: null,
  created_at: new Date(0),
  updated_at: new Date(0),
};
const RETIRED = { ...ROW, id: '13', name: 'Closed Yard', enabled: false };

function fakeUsers() {
  const rows = [
    { id: 1, email: 'm@x.com', display_name: 'Member', role: 'member', is_active: true },
    { id: 2, email: 's@x.com', display_name: 'Staff', role: 'staff', is_active: true },
  ];
  return { findById: async (id) => rows.find((r) => String(r.id) === String(id)) || null };
}

function fakeFeedlots() {
  const calls = { list: [], create: [], update: [], remove: [] };
  const rows = new Map([
    [12, ROW],
    [13, RETIRED],
  ]);
  return {
    calls,
    async list(args) {
      calls.list.push(args);
      return { total: 1, rows: [ROW] };
    },
    async states(staff) {
      calls.statesStaff = staff;
      return [{ state: 'AZ', n: 1 }];
    },
    async stats() {
      return { total: 785, enabled: 780, with_email: 343, can_email: 340, do_not_email: 3, with_fax: 1 };
    },
    async get(id) {
      return rows.get(id) || null;
    },
    async create(values, userId) {
      calls.create.push({ values, userId });
      if (values.name === 'Dup') return { status: 'duplicate' };
      rows.set(99, { ...ROW, id: '99', name: values.name });
      return { status: 'ok', id: 99 };
    },
    async update(id, changes, userId) {
      calls.update.push({ id, changes, userId });
      if (id === 404) return { status: 'not_found' };
      if (changes.name === 'Dup') return { status: 'duplicate' };
      return { status: 'ok', changed: Object.keys(changes).map((field) => ({ field, oldValue: 'a', newValue: 'b' })) };
    },
    async remove(id, userId) {
      calls.remove.push({ id, userId });
      return id === 404 ? { status: 'not_found' } : { status: 'ok' };
    },
    async log() {
      return [{ id: 1, field: 'fax', old_value: null, new_value: '(602) 555-0100', changed_at: new Date(0), changed_by: 'Staff' }];
    },
  };
}

function makeApp() {
  const feedlots = fakeFeedlots();
  const app = createApp({
    db: { isConfigured: () => true, ping: async () => true },
    config: { jwtSecret: SECRET },
    users: fakeUsers(),
    feedlots,
  });
  return { app, feedlots };
}

const member = () => ({ Authorization: 'Bearer ' + signToken({ id: 1, role: 'member' }, SECRET) });
const staff = () => ({ Authorization: 'Bearer ' + signToken({ id: 2, role: 'staff' }, SECRET) });

describe('GET /api/feedlots (who sees what)', () => {
  test('a visitor sees name, city, state and website only', async () => {
    const { app, feedlots } = makeApp();
    const res = await request(app).get('/api/feedlots');
    expect(res.status).toBe(200);
    expect(res.body.feedlots[0]).toEqual({ id: 12, name: 'Pinal Feeding Co.-Maricopa', city: 'Maricopa', state: 'AZ', website: 'www.pinalfeeding.com' });
    expect(feedlots.calls.list[0]).toMatchObject({ staff: false, withContact: false });
  });

  test('a signed-in member also sees contact details, but not notes or email settings', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/feedlots').set(member());
    const f = res.body.feedlots[0];
    expect(f).toMatchObject({ contactName: 'Earl Petznick', phone: '(602) 252-3467', fax: '(602) 555-0100', zip: '85138' });
    expect(f.emails).toEqual(['info@pinalfeeding.com', 'orders@pinalfeeding.com']);
    expect(f).not.toHaveProperty('notes');
    expect(f).not.toHaveProperty('doNotEmail');
    expect(f).not.toHaveProperty('enabled');
  });

  test('staff also see notes and the email settings', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/feedlots').set(staff());
    expect(res.body.feedlots[0]).toMatchObject({ notes: 'Prefers morning calls.', enabled: true, doNotEmail: false });
  });

  test('a bad token is treated as a visitor', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/feedlots').set({ Authorization: 'Bearer nonsense' });
    expect(res.status).toBe(200);
    expect(res.body.feedlots[0]).not.toHaveProperty('emails');
  });

  test('filters are passed on; visitors cannot filter by whether a feedlot has email', async () => {
    const { app, feedlots } = makeApp();
    await request(app).get('/api/feedlots?q=pinal&state=az&hasEmail=1&enabled=0&doNotEmail=1&page=2&pageSize=500');
    expect(feedlots.calls.list[0]).toMatchObject({ q: 'pinal', state: 'AZ', hasEmail: '', enabled: '', doNotEmail: '', page: 2, pageSize: 100 });
    await request(app).get('/api/feedlots?hasEmail=1&enabled=0&doNotEmail=1').set(member());
    expect(feedlots.calls.list[1]).toMatchObject({ hasEmail: '1', enabled: '', doNotEmail: '', withContact: true });
    await request(app).get('/api/feedlots?hasEmail=1&enabled=0&doNotEmail=1').set(staff());
    expect(feedlots.calls.list[2]).toMatchObject({ hasEmail: '1', enabled: '0', doNotEmail: '1', staff: true });
  });

  test('junk filter values are ignored', async () => {
    const { app, feedlots } = makeApp();
    await request(app).get('/api/feedlots?state=Texas&hasEmail=maybe&page=-5&pageSize=abc').set(staff());
    expect(feedlots.calls.list[0]).toMatchObject({ state: '', hasEmail: '', page: 1, pageSize: 25 });
  });

  test('states list; staff get the retired ones counted too', async () => {
    const { app, feedlots } = makeApp();
    expect((await request(app).get('/api/feedlots/states')).body).toEqual({ states: [{ state: 'AZ', n: 1 }] });
    expect(feedlots.calls.statesStaff).toBe(false);
    await request(app).get('/api/feedlots/states').set(staff());
    expect(feedlots.calls.statesStaff).toBe(true);
  });
});

describe('GET /api/feedlots/:id', () => {
  test('shaped for the viewer', async () => {
    const { app } = makeApp();
    expect((await request(app).get('/api/feedlots/12')).body.feedlot).not.toHaveProperty('emails');
    expect((await request(app).get('/api/feedlots/12').set(member())).body.feedlot.emails).toHaveLength(2);
    expect((await request(app).get('/api/feedlots/12').set(staff())).body.feedlot.notes).toBe('Prefers morning calls.');
  });

  test('a retired feedlot is only visible to staff', async () => {
    const { app } = makeApp();
    expect((await request(app).get('/api/feedlots/13')).status).toBe(404);
    expect((await request(app).get('/api/feedlots/13').set(member())).status).toBe(404);
    expect((await request(app).get('/api/feedlots/13').set(staff())).status).toBe(200);
  });

  test('unknown or odd ids are 404', async () => {
    const { app } = makeApp();
    expect((await request(app).get('/api/feedlots/9999')).status).toBe(404);
    expect((await request(app).get('/api/feedlots/abc')).status).toBe(404);
    expect((await request(app).get('/api/feedlots/1;drop')).status).toBe(404);
  });
});

describe('staff only', () => {
  const body = { name: 'New Yard', state: 'tx', emails: 'a@x.com, b@x.com', fax: '(806) 668-4744' };

  test('stats, create, edit, delete and log need a staff sign-in', async () => {
    const { app, feedlots } = makeApp();
    const calls = [
      () => request(app).get('/api/feedlots/stats'),
      () => request(app).post('/api/feedlots').send(body),
      () => request(app).patch('/api/feedlots/12').send({ changes: { fax: '(806) 668-4744' } }),
      () => request(app).delete('/api/feedlots/12'),
      () => request(app).get('/api/feedlots/12/log'),
    ];
    for (const c of calls) {
      expect((await c()).status).toBe(401);
      expect((await c().set(member())).status).toBe(403);
    }
    expect(feedlots.calls.create).toHaveLength(0);
    expect(feedlots.calls.update).toHaveLength(0);
    expect(feedlots.calls.remove).toHaveLength(0);
  });

  test('stats', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/feedlots/stats').set(staff());
    expect(res.body.stats).toEqual({ total: 785, enabled: 780, withEmail: 343, canEmail: 340, doNotEmail: 3, withFax: 1 });
  });

  test('create: tidies the fields, records who did it, returns the staff view', async () => {
    const { app, feedlots } = makeApp();
    const res = await request(app).post('/api/feedlots').set(staff()).send(body);
    expect(res.status).toBe(201);
    expect(feedlots.calls.create[0]).toEqual({
      values: { name: 'New Yard', state: 'TX', emails: ['a@x.com', 'b@x.com'], fax: '(806) 668-4744' },
      userId: 2,
    });
    expect(res.body.feedlot).toMatchObject({ id: 99, name: 'New Yard', notes: 'Prefers morning calls.' });
  });

  test('create: bad input is a 400 with a message per field', async () => {
    const { app, feedlots } = makeApp();
    const res = await request(app).post('/api/feedlots').set(staff()).send({ name: '', state: 'Texas', emails: 'nope', fax: '12' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields).sort()).toEqual(['emails', 'fax', 'name', 'state']);
    expect(feedlots.calls.create).toHaveLength(0);
  });

  test('create: a yard that is already there is a 409', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/feedlots').set(staff()).send({ name: 'Dup', state: 'TX' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('duplicate');
  });

  test('edit: only the sent fields go to the repo', async () => {
    const { app, feedlots } = makeApp();
    const res = await request(app).patch('/api/feedlots/12').set(staff()).send({ changes: { fax: '(806) 668-4744', doNotEmail: true, doNotEmailNote: 'asked us to stop' } });
    expect(res.status).toBe(200);
    expect(feedlots.calls.update[0]).toEqual({ id: 12, changes: { fax: '(806) 668-4744', doNotEmail: true, doNotEmailNote: 'asked us to stop' }, userId: 2 });
    expect(res.body.changed.map((c) => c.field).sort()).toEqual(['doNotEmail', 'doNotEmailNote', 'fax']);
    expect(res.body.feedlot.id).toBe(12);
  });

  test('edit: clearing a field sends null', async () => {
    const { app, feedlots } = makeApp();
    await request(app).patch('/api/feedlots/12').set(staff()).send({ changes: { fax: '', emails: '' } });
    expect(feedlots.calls.update[0].changes).toEqual({ fax: null, emails: [] });
  });

  test('edit: bad input, nothing to change, unknown feedlot, and a name clash', async () => {
    const { app } = makeApp();
    expect((await request(app).patch('/api/feedlots/12').set(staff()).send({ changes: { zip: 'abc' } })).status).toBe(400);
    expect((await request(app).patch('/api/feedlots/12').set(staff()).send({})).status).toBe(400);
    expect((await request(app).patch('/api/feedlots/12').set(staff()).send({ changes: {} })).status).toBe(400);
    expect((await request(app).patch('/api/feedlots/404').set(staff()).send({ changes: { fax: '(806) 668-4744' } })).status).toBe(404);
    expect((await request(app).patch('/api/feedlots/abc').set(staff()).send({ changes: { fax: '(806) 668-4744' } })).status).toBe(404);
    expect((await request(app).patch('/api/feedlots/12').set(staff()).send({ changes: { name: 'Dup' } })).status).toBe(409);
  });

  test('delete', async () => {
    const { app, feedlots } = makeApp();
    const res = await request(app).delete('/api/feedlots/12').set(staff());
    expect(res.body).toEqual({ removed: true });
    expect(feedlots.calls.remove[0]).toEqual({ id: 12, userId: 2 });
    expect((await request(app).delete('/api/feedlots/404').set(staff())).status).toBe(404);
  });

  test('log', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/feedlots/12/log').set(staff());
    expect(res.body.log[0]).toMatchObject({ field: 'fax', oldValue: null, newValue: '(602) 555-0100', changedBy: 'Staff' });
  });
});
