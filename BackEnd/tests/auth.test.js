'use strict';
const request = require('supertest');
const { createApp } = require('../src/app');
const { createLimiter } = require('../src/rateLimit');

const SECRET = 'test-secret-that-is-at-least-32-characters-long';
const GOOD = {
  email: 'Rancher@Example.com',
  password: 'a-long-test-password',
  displayName: 'Pat Rancher',
  membershipNumber: 'RA-12345',
};

// In-memory stand-in for the users table.
function fakeUsers() {
  const rows = [];
  let nextId = 1;
  return {
    rows,
    async findByEmail(email) {
      return rows.find((r) => r.email.toLowerCase() === email.toLowerCase()) || null;
    },
    async findById(id) {
      return rows.find((r) => String(r.id) === String(id)) || null;
    },
    async create({ email, passwordHash, displayName, membershipNumber }) {
      if (rows.some((r) => r.email.toLowerCase() === email.toLowerCase())) {
        const e = new Error('duplicate key');
        e.code = '23505';
        throw e;
      }
      const row = {
        id: nextId++,
        email,
        password_hash: passwordHash,
        display_name: displayName,
        membership_number: membershipNumber,
        membership_status: 'unverified',
        role: 'member',
        is_active: true,
      };
      rows.push(row);
      return row;
    },
    async touchLogin() {},
  };
}

function makeApp(configOverride = {}) {
  const users = fakeUsers();
  const app = createApp({
    db: { isConfigured: () => true, ping: async () => true },
    config: { jwtSecret: SECRET, ...configOverride },
    users,
  });
  return { app, users };
}

describe('POST /api/auth/register', () => {
  test('creates a member account and returns a token', async () => {
    const { app, users } = makeApp();
    const res = await request(app).post('/api/auth/register').send(GOOD);
    expect(res.status).toBe(201);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user).toMatchObject({
      email: 'rancher@example.com',
      displayName: 'Pat Rancher',
      membershipNumber: 'RA-12345',
      membershipStatus: 'unverified',
      role: 'member',
    });
    expect(res.body.user.password_hash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/hash/i);
    expect(users.rows[0].password_hash).not.toBe(GOOD.password);
  });

  test('cannot choose its own role', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/auth/register').send({ ...GOOD, role: 'staff' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('member');
  });

  test('rejects bad input with a message per field', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'nope', password: 'short', displayName: '', membershipNumber: 'bad number!' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields).sort()).toEqual(['displayName', 'email', 'membershipNumber', 'password']);
  });

  test('rejects a password longer than 72 bytes', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...GOOD, password: 'x'.repeat(73) });
    expect(res.status).toBe(400);
    expect(res.body.fields.password).toBeDefined();
  });

  test('a second account with the same email (any case) is refused', async () => {
    const { app } = makeApp();
    await request(app).post('/api/auth/register').send(GOOD);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...GOOD, email: 'RANCHER@example.COM' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('email_taken');
  });
});

describe('POST /api/auth/login', () => {
  async function withAccount() {
    const ctx = makeApp();
    await request(ctx.app).post('/api/auth/register').send(GOOD);
    return ctx;
  }

  test('good password returns a token', async () => {
    const { app } = await withAccount();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'RANCHER@example.com', password: GOOD.password });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
  });

  test('wrong password and unknown email give the same answer', async () => {
    const { app } = await withAccount();
    const wrong = await request(app).post('/api/auth/login').send({ email: GOOD.email, password: 'wrong-password-1' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'who@example.com', password: 'wrong-password-1' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  test('a deactivated account cannot log in', async () => {
    const { app, users } = await withAccount();
    users.rows[0].is_active = false;
    const res = await request(app).post('/api/auth/login').send({ email: GOOD.email, password: GOOD.password });
    expect(res.status).toBe(401);
  });

  test('locks an email after 5 failures, even for the right password', async () => {
    const { app } = await withAccount();
    for (let i = 0; i < 5; i++) {
      const r = await request(app).post('/api/auth/login').send({ email: GOOD.email, password: 'wrong-password-1' });
      expect(r.status).toBe(401);
    }
    const locked = await request(app).post('/api/auth/login').send({ email: GOOD.email, password: GOOD.password });
    expect(locked.status).toBe(429);
  });
});

describe('GET /api/auth/me', () => {
  test('returns the signed-in user', async () => {
    const { app } = makeApp();
    const reg = await request(app).post('/api/auth/register').send(GOOD);
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${reg.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('rancher@example.com');
  });

  test('no token, bad token, and tokens signed with another secret are refused', async () => {
    const { app } = makeApp();
    const reg = await request(app).post('/api/auth/register').send(GOOD);
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Bearer abc')).status).toBe(401);
    const jwt = require('jsonwebtoken');
    const forged = jwt.sign({ sub: '1', role: 'staff' }, 'another-secret-another-secret-another');
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${forged}`)).status).toBe(401);
    expect(reg.status).toBe(201);
  });

  test('a token stops working when the account is deactivated', async () => {
    const { app, users } = makeApp();
    const reg = await request(app).post('/api/auth/register').send(GOOD);
    users.rows[0].is_active = false;
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${reg.body.token}`);
    expect(res.status).toBe(401);
  });
});

describe('configuration', () => {
  test('auth routes answer 503 when JWT_SECRET is missing or too short', async () => {
    for (const jwtSecret of ['', 'short']) {
      const { app } = makeApp({ jwtSecret });
      const res = await request(app).post('/api/auth/login').send({ email: 'a@b.co', password: 'x' });
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('auth_not_configured');
    }
  });
});

describe('rate limiter', () => {
  test('forgets old hits after the window', () => {
    let t = 0;
    const lim = createLimiter({ max: 2, windowMs: 1000, now: () => t });
    lim.record('k');
    lim.record('k');
    expect(lim.isBlocked('k')).toBe(true);
    t = 1500;
    expect(lim.isBlocked('k')).toBe(false);
  });
});
