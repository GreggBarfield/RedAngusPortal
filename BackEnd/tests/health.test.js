'use strict';
const request = require('supertest');
const { createApp } = require('../src/app');

function fakeDb({ configured = true, pingOk = true } = {}) {
  return {
    isConfigured: () => configured,
    ping: async () => {
      if (!pingOk) throw new Error('connection refused');
      return true;
    },
  };
}

describe('health routes', () => {
  test('GET /api/health returns ok', async () => {
    const app = createApp({ db: fakeDb() });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('raaaa-api');
    expect(typeof res.body.timestamp).toBe('string');
  });

  test('GET /api/health/db returns up when the database answers', async () => {
    const app = createApp({ db: fakeDb() });
    const res = await request(app).get('/api/health/db');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up' });
  });

  test('GET /api/health/db returns 503 when the database is down', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const app = createApp({ db: fakeDb({ pingOk: false }) });
    const res = await request(app).get('/api/health/db');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'error', database: 'down' });
    console.error.mockRestore();
  });

  test('GET /api/health/db returns 503 when DATABASE_URL is not set', async () => {
    const app = createApp({ db: fakeDb({ configured: false }) });
    const res = await request(app).get('/api/health/db');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'error', database: 'not_configured' });
  });

  test('unknown /api route returns 404 json', async () => {
    const app = createApp({ db: fakeDb() });
    const res = await request(app).get('/api/nothing-here');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });
});
