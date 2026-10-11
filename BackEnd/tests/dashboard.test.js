'use strict';
const request = require('supertest');
const { createApp } = require('../src/app');
const { signToken } = require('../src/auth');

const SECRET = 'test-secret-that-is-at-least-32-characters-long';

const OVERVIEW = {
  generatedAt: '2026-10-11T12:00:00.000Z',
  listings: { feederLive: 7, breedingLive: 3, feederHead: 900, breedingHead: 5, pending: 2, outcomes: { approved: 10, pending: 2, rejected: 1, sold: 4, withdrawn: 0 } },
  sex: { steers: 500, heifers: 400 },
  states: [{ state: 'TX', feeder: 4, breeding: 1 }],
  weekly: [{ week: '2026-10-05', feeder: 2, breeding: 1 }],
  attention: { pendingOverTwoDays: 1, noPhotos: 6, pastSaleDate: 0, notesOn: 2 },
  people: { members: 40, newThisWeek: 3, sellers: 9 },
  feedlots: { total: 785, enabled: 780, withEmail: 343, canEmail: 340, doNotEmail: 3, reach: { email: 340, faxOnly: 1, neither: 439 } },
  showlists: { sent: 0, lastAt: null, emailsSent: 0, delivered: 0, submitted: 0, failed: 0, unsubscribed: 0, feedlotsReached: 0 },
};
const BARNS = { total: 1317, active: 90, withEmail: 600, reach: { email: 70, faxOnly: 10, neither: 10 } };

function fakeUsers() {
  const rows = [
    { id: 1, email: 'm@x.com', display_name: 'Member', role: 'member', is_active: true },
    { id: 2, email: 's@x.com', display_name: 'Staff', role: 'staff', is_active: true },
  ];
  return { findById: async (id) => rows.find((r) => String(r.id) === String(id)) || null };
}

function makeApp({ barns = BARNS, overviewError = false } = {}) {
  const calls = { overview: 0, barns: 0 };
  const dashboard = {
    async overview() {
      calls.overview += 1;
      if (overviewError) throw new Error('db down');
      return OVERVIEW;
    },
    async barns() {
      calls.barns += 1;
      return barns;
    },
  };
  const app = createApp({
    db: { isConfigured: () => true, ping: async () => true },
    config: { jwtSecret: SECRET },
    users: fakeUsers(),
    dashboard,
  });
  return { app, calls };
}

const tokenFor = (id) => signToken({ id }, SECRET);

describe('GET /api/dashboard', () => {
  it('turns away visitors with 401', async () => {
    const { app, calls } = makeApp();
    const res = await request(app).get('/api/dashboard');
    expect(res.status).toBe(401);
    expect(calls.overview).toBe(0);
  });

  it('turns away signed-in members with 403', async () => {
    const { app, calls } = makeApp();
    const res = await request(app).get('/api/dashboard').set('Authorization', `Bearer ${tokenFor(1)}`);
    expect(res.status).toBe(403);
    expect(calls.overview).toBe(0);
    expect(calls.barns).toBe(0);
  });

  it('gives staff the numbers, with the sale barn numbers added, and does not let browsers keep them', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/dashboard').set('Authorization', `Bearer ${tokenFor(2)}`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.dashboard.listings.feederLive).toBe(7);
    expect(res.body.dashboard.feedlots.total).toBe(785);
    expect(res.body.dashboard.barns).toEqual(BARNS);
  });

  it('still answers when the sale barn numbers are unavailable (barns is null)', async () => {
    const { app } = makeApp({ barns: null });
    const res = await request(app).get('/api/dashboard').set('Authorization', `Bearer ${tokenFor(2)}`);
    expect(res.status).toBe(200);
    expect(res.body.dashboard.barns).toBeNull();
    expect(res.body.dashboard.listings.breedingLive).toBe(3);
  });

  it('answers 500 server_error when the main database fails', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { app } = makeApp({ overviewError: true });
    const res = await request(app).get('/api/dashboard').set('Authorization', `Bearer ${tokenFor(2)}`);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'server_error' });
    spy.mockRestore();
  });
});
