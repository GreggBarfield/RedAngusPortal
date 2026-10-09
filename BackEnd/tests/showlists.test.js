'use strict';
const request = require('supertest');
const { createApp } = require('../src/app');
const { createShowlist } = require('../src/showlistModule');
const { signToken } = require('../src/auth');

const SECRET = 'test-secret-that-is-at-least-32-characters-long';
const TOKEN = 'a'.repeat(32);

const LOT = {
  id: 7, headline: 'Red Angus steers', steerCount: 80, heiferCount: 0, marketingMethod: 'off_ranch', marketingDate: '2026-10-20',
  city: 'Gonzales', state: 'TX', callForPrice: true, contactName: 'Pat', contactPhone: '555', contactEmail: 'pat@x.com', breeds: ['Red Angus'],
};

function fakeUsers() {
  const rows = [
    { id: 1, email: 'm@x.com', display_name: 'Member', role: 'member', is_active: true },
    { id: 2, email: 's@x.com', display_name: 'Staff', role: 'staff', is_active: true },
  ];
  return { findById: async (id) => rows.find((r) => String(r.id) === String(id)) || null };
}

function fakeRepo() {
  const calls = { create: [], event: [], unsub: [], interrupt: [] };
  return {
    calls,
    unfinished: null,
    queued: 3,
    async lots() { return [LOT]; },
    async lotsByIds(ids) { return ids.filter((i) => i === 7).map(() => LOT); },
    async recipients() {
      return { blocked: 2, rows: [{ id: '10', name: 'Pinal', city: 'Maricopa', state: 'AZ', emails: ['a@pinal.com', 'b@pinal.com'], last_sent: null }] };
    },
    async feedlotsByIds(ids) {
      const all = [
        { id: 10, name: 'Pinal', emails: ['a@pinal.com', 'B@pinal.com'] },
        { id: 11, name: 'Pinal Two', emails: ['b@pinal.com', 'c@two.com'] },
      ];
      return all.filter((f) => ids.includes(f.id));
    },
    async create(args) { calls.create.push(args); return { id: 55, recipientCount: args.targets.length }; },
    async getShowlist(id) { return id === 404 ? null : { id }; },
    async interruptStale(id) { calls.interrupt.push(id); return 0; },
    async queuedCount() { return this.queued; },
    async anyUnfinished() { return this.unfinished; },
    async list() {
      return [{ id: '55', subject: 'Hi', recipient_count: 3, created_at: new Date(0), created_by: 'Staff', lot_count: 1, counts: { SUBMITTED: 2, DELIVERED: 1 } }];
    },
    async get(id) {
      if (id === 404) return null;
      return {
        showlist: { id: '55', subject: 'Hi', intro: '', recipient_count: 1, created_at: new Date(0), created_by: 'Staff', lots: [{ id: 7, headline: 'Red Angus steers' }] },
        counts: [{ status: 'DELIVERED', n: 1 }],
        sends: [{ id: '1', feedlot_id: '10', feedlot_name: 'Pinal', recipient: 'a@pinal.com', status: 'DELIVERED', status_detail: null, submitted_at: new Date(0), delivered_at: new Date(1), failed_at: null, unsubscribed_at: null }],
      };
    },
    async applyEvent(e) { calls.event.push(e); return { updated: e.ref === 1 ? 1 : 0 }; },
    async findByToken(t) { return t === TOKEN ? { feedlot_name: 'Pinal', off: false } : null; },
    async unsubscribe(t) { calls.unsub.push(t); return t === TOKEN ? { feedlotName: 'Pinal' } : null; },
  };
}

function makeApp({ env = {}, mailer, sender } = {}) {
  const repo = fakeRepo();
  const sent = [];
  const started = [];
  const theMailer = mailer || { send: async (m) => (sent.push(m), { ok: true, emailId: 'E1' }) };
  const theSender = sender || { start: (id) => started.push(id), isActive: () => false, anyActive: () => false };
  const config = { jwtSecret: SECRET, siteUrl: 'https://raa.example' };
  const users = fakeUsers();
  const showlist = createShowlist({
    db: {},
    config,
    users,
    log: { warn() {}, error() {} },
    env: { SMTP2GO_API_KEY: 'K', SHOWLIST_POSTAL_ADDRESS: '1 Main St', SMTP2GO_WEBHOOK_TOKEN: 'hook-secret', ...env },
    overrides: { showlists: repo, mailer: theMailer, sender: theSender },
  });
  const app = createApp({ db: { isConfigured: () => true, ping: async () => true }, config, users, showlist });
  return { app, repo, sent, started };
}

const member = () => ({ Authorization: 'Bearer ' + signToken({ id: 1, role: 'member' }, SECRET) });
const staff = () => ({ Authorization: 'Bearer ' + signToken({ id: 2, role: 'staff' }, SECRET) });
const compose = { subject: 'Cattle for sale', intro: 'Hello', lotIds: [7] };

describe('showlist staff routes', () => {
  test('staff only', async () => {
    const { app } = makeApp();
    for (const [m, p] of [['get', '/status'], ['get', '/lots'], ['get', '/recipients'], ['post', '/preview'], ['post', '/test'], ['post', '/'], ['get', '/'], ['get', '/5'], ['post', '/5/resume']]) {
      expect((await request(app)[m]('/api/showlists' + p)).status).toBe(401);
      expect((await request(app)[m]('/api/showlists' + p).set(member())).status).toBe(403);
    }
  });

  test('status says what is still missing', async () => {
    const ok = await request(makeApp().app).get('/api/showlists/status').set(staff());
    expect(ok.body).toMatchObject({ configured: true, missing: [], from: 'info@blocktrustnetwork.com', replyTo: 'info@blocktrustnetwork.com' });
    const bad = await request(makeApp({ env: { SMTP2GO_API_KEY: '', SHOWLIST_POSTAL_ADDRESS: '' } }).app).get('/api/showlists/status').set(staff());
    expect(bad.body).toMatchObject({ configured: false, missing: ['SMTP2GO_API_KEY', 'SHOWLIST_POSTAL_ADDRESS'] });
  });

  test('lots and recipients', async () => {
    const { app } = makeApp();
    expect((await request(app).get('/api/showlists/lots').set(staff())).body.lots[0].headline).toBe('Red Angus steers');
    const r = await request(app).get('/api/showlists/recipients').set(staff());
    expect(r.body.blocked).toBe(2);
    expect(r.body.feedlots[0]).toEqual({ id: 10, name: 'Pinal', city: 'Maricopa', state: 'AZ', emails: ['a@pinal.com', 'b@pinal.com'], lastSent: null });
  });

  test('preview works even before email is set up, with a placeholder address', async () => {
    const { app } = makeApp({ env: { SMTP2GO_API_KEY: '', SHOWLIST_POSTAL_ADDRESS: '' } });
    const res = await request(app).post('/api/showlists/preview').set(staff()).send(compose);
    expect(res.status).toBe(200);
    expect(res.body.html).toContain('Red Angus steers');
    expect(res.body.html).toContain('[mailing address not set yet]');
  });

  test('bad input is a 400 with a message per field', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/showlists/preview').set(staff()).send({ subject: 'x', lotIds: [] });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields).sort()).toEqual(['lotIds', 'subject']);
    const nl = await request(app).post('/api/showlists/preview').set(staff()).send({ ...compose, subject: 'Two\nlines' });
    expect(nl.body.fields.subject).toMatch(/one line/);
    const gone = await request(app).post('/api/showlists/preview').set(staff()).send({ ...compose, lotIds: [7, 8] });
    expect(gone.status).toBe(400);
    expect(gone.body.fields.lotIds).toMatch(/no longer available/);
  });

  test('test send goes to one address, marked TEST, with no ref number', async () => {
    const { app, sent } = makeApp();
    const res = await request(app).post('/api/showlists/test').set(staff()).send({ ...compose, to: 'me@x.com' });
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'me@x.com', subject: '[TEST] Cattle for sale' });
    expect(sent[0].subject).not.toContain('[ref:');
    const bad = await request(app).post('/api/showlists/test').set(staff()).send({ ...compose, to: 'nope' });
    expect(bad.status).toBe(400);
    expect(bad.body.fields.to).toBeDefined();
  });

  test('test send reports a SMTP2GO problem', async () => {
    const { app } = makeApp({ mailer: { send: async () => ({ ok: false, error: 'SMTP2GO refused the key' }) } });
    const res = await request(app).post('/api/showlists/test').set(staff()).send({ ...compose, to: 'me@x.com' });
    expect(res.status).toBe(502);
    expect(res.body.message).toMatch(/refused/);
  });

  test('sending is refused until the key and mailing address are set', async () => {
    const { app, repo } = makeApp({ env: { SMTP2GO_API_KEY: '' } });
    const res = await request(app).post('/api/showlists').set(staff()).send({ ...compose, feedlotIds: [10] });
    expect(res.status).toBe(503);
    expect(res.body.missing).toEqual(['SMTP2GO_API_KEY']);
    expect(repo.calls.create).toHaveLength(0);
    expect((await request(app).post('/api/showlists/test').set(staff()).send({ ...compose, to: 'me@x.com' })).status).toBe(503);
  });

  test('send: one email per address, repeated addresses once, then the sender starts', async () => {
    const { app, repo, started } = makeApp();
    const res = await request(app).post('/api/showlists').set(staff()).send({ ...compose, feedlotIds: [10, 11] });
    expect(res.status).toBe(202);
    expect(res.body.showlist).toEqual({ id: 55, recipientCount: 3 });
    const c = repo.calls.create[0];
    expect(c.userId).toBe(2);
    expect(c.targets.map((t) => t.email)).toEqual(['a@pinal.com', 'B@pinal.com', 'c@two.com']);
    expect(c.targets[2]).toMatchObject({ feedlotId: 11, feedlotName: 'Pinal Two' });
    expect(c.lots[0].id).toBe(7);
    expect(started).toEqual([55]);
  });

  test('send: feedlots that cannot be emailed are a 400; a showlist already going is a 409', async () => {
    const { app, repo } = makeApp();
    const none = await request(app).post('/api/showlists').set(staff()).send({ ...compose, feedlotIds: [99] });
    expect(none.status).toBe(400);
    expect(none.body.fields.feedlotIds).toMatch(/None of those/);
    repo.unfinished = 40;
    const busy = await request(app).post('/api/showlists').set(staff()).send({ ...compose, feedlotIds: [10] });
    expect(busy.status).toBe(409);
    expect(repo.calls.create).toHaveLength(0);
  });

  test('history and detail', async () => {
    const { app } = makeApp();
    const list = await request(app).get('/api/showlists').set(staff());
    expect(list.body.showlists[0]).toMatchObject({ id: 55, recipientCount: 3, lotCount: 1, createdBy: 'Staff' });
    expect(list.body.showlists[0].counts).toMatchObject({ QUEUED: 0, SUBMITTED: 2, DELIVERED: 1 });
    const one = await request(app).get('/api/showlists/55').set(staff());
    expect(one.body.counts.DELIVERED).toBe(1);
    expect(one.body.sends[0]).toMatchObject({ recipient: 'a@pinal.com', status: 'DELIVERED' });
    expect(one.body.showlist.lots).toEqual([{ id: 7, headline: 'Red Angus steers' }]);
    expect((await request(app).get('/api/showlists/404').set(staff())).status).toBe(404);
    expect((await request(app).get('/api/showlists/abc').set(staff())).status).toBe(404);
  });

  test('resume: restarts what is waiting; nothing waiting is a 400; unknown is a 404', async () => {
    const { app, repo, started } = makeApp();
    const ok = await request(app).post('/api/showlists/55/resume').set(staff());
    expect(ok.status).toBe(202);
    expect(started).toEqual([55]);
    expect(repo.calls.interrupt).toEqual([55]);
    repo.queued = 0;
    expect((await request(app).post('/api/showlists/55/resume').set(staff())).status).toBe(400);
    expect((await request(app).post('/api/showlists/404/resume').set(staff())).status).toBe(404);
  });
});

describe('unsubscribe link (public)', () => {
  test('GET shows who it is for; POST turns the emails off', async () => {
    const { app, repo } = makeApp();
    const g = await request(app).get('/api/unsubscribe/' + TOKEN);
    expect(g.body).toEqual({ feedlotName: 'Pinal', alreadyOff: false });
    const p = await request(app).post('/api/unsubscribe/' + TOKEN);
    expect(p.body).toEqual({ done: true, feedlotName: 'Pinal' });
    expect(repo.calls.unsub).toEqual([TOKEN]);
  });

  test('the one-click form post from a mail program works too', async () => {
    const { app } = makeApp();
    const p = await request(app).post('/api/unsubscribe/' + TOKEN).type('form').send('List-Unsubscribe=One-Click');
    expect(p.status).toBe(200);
  });

  test('a GET never changes anything (mail scanners open links)', async () => {
    const { app, repo } = makeApp();
    await request(app).get('/api/unsubscribe/' + TOKEN);
    expect(repo.calls.unsub).toHaveLength(0);
  });

  test('unknown or malformed tokens are 404', async () => {
    const { app } = makeApp();
    expect((await request(app).get('/api/unsubscribe/' + 'b'.repeat(32))).status).toBe(404);
    expect((await request(app).post('/api/unsubscribe/' + 'b'.repeat(32))).status).toBe(404);
    expect((await request(app).get('/api/unsubscribe/preview')).status).toBe(404);
    expect((await request(app).post('/api/unsubscribe/test-only')).status).toBe(404);
  });
});

describe('SMTP2GO delivery reports', () => {
  const hook = (app, body, q = '?token=hook-secret') => request(app).post('/api/smtp2go/callback' + q).send(body);

  test('needs the secret (header or query)', async () => {
    const { app, repo } = makeApp();
    expect((await hook(app, { event: 'delivered' }, '')).status).toBe(401);
    expect((await hook(app, { event: 'delivered' }, '?token=wrong')).status).toBe(401);
    const viaHeader = await request(app).post('/api/smtp2go/callback').set('Authorization', 'Bearer hook-secret').send({ event: 'processed' });
    expect(viaHeader.status).toBe(200);
    expect(repo.calls.event).toHaveLength(0);
    const off = makeApp({ env: { SMTP2GO_WEBHOOK_TOKEN: '' } });
    expect((await hook(off.app, { event: 'delivered' })).status).toBe(503);
  });

  test('delivered, bounce, reject and spam are matched on the ref number and the recipient', async () => {
    const { app, repo } = makeApp();
    const r = await hook(app, { event: 'delivered', subject: 'Cattle [ref:1]', rcpt: 'A@Pinal.com' });
    expect(r.body).toEqual({ ok: true, updated: 1 });
    expect(repo.calls.event[0]).toMatchObject({ ref: 1, rcpt: 'A@Pinal.com', kind: 'delivered' });
    await hook(app, { event: 'bounce', Subject: 'Cattle [ref:2]', rcpt: 'x@y.com' });
    await hook(app, { event: 'reject', subject: 'Cattle [ref:3]', recipients: ['z@y.com'] });
    await hook(app, { event: 'spam', subject: 'Cattle [ref:4]', rcpt: 'q@y.com' });
    expect(repo.calls.event.map((e) => e.kind)).toEqual(['delivered', 'failed', 'failed', 'spam']);
    expect(repo.calls.event[2].rcpt).toBe('z@y.com');
  });

  test('mail with no ref tag (the other businesses on this SMTP2GO account) is ignored', async () => {
    const { app, repo } = makeApp();
    const r = await hook(app, { event: 'delivered', subject: 'Your invoice', rcpt: 'a@b.com' });
    expect(r.body).toEqual({ ok: true, ignored: true });
    expect(repo.calls.event).toHaveLength(0);
  });

  test('a report that matches nothing waiting changes nothing but still answers 200', async () => {
    const { app } = makeApp();
    const r = await hook(app, { event: 'delivered', subject: 'x [ref:999]', rcpt: 'a@b.com' });
    expect(r.status).toBe(200);
    expect(r.body.updated).toBe(0);
  });

  test('form-encoded reports work as well as JSON', async () => {
    const { app, repo } = makeApp();
    await request(app).post('/api/smtp2go/callback?token=hook-secret').type('form').send('event=delivered&rcpt=a%40b.com&subject=Hi+%5Bref%3A1%5D');
    expect(repo.calls.event[0]).toMatchObject({ ref: 1, rcpt: 'a@b.com', kind: 'delivered' });
  });
});
