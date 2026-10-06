'use strict';
const request = require('supertest');
const { createApp } = require('../src/app');
const { createMarketInsights } = require('../src/marketInsights');

const db = { isConfigured: () => true, ping: async () => true };
const bundle = { markets: [{ slug_id: 'abc', market_name: 'Test Barn', distance_miles: 12 }], region: { markets_found: 1 } };

function appWith(fetchFn, base = 'https://bt.example') {
  const insights = createMarketInsights({ config: { marketInsightsUrl: base }, fetchFn });
  return createApp({ db, marketInsights: insights });
}
const okFetch = (body) => jest.fn(async () => ({ json: async () => body }));

describe('market insights proxy', () => {
  test('passes the zip and the default 200 mile radius to BlockTrust', async () => {
    const f = okFetch({ ok: true, data: bundle });
    const res = await request(appWith(f)).get('/api/market-insights?zip=77840');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, data: bundle });
    expect(f.mock.calls[0][0]).toBe('https://bt.example/api/usda-market-insights?zip=77840&radius=200');
  });

  test('passes a chosen market and clamps the radius', async () => {
    const f = okFetch({ ok: true, data: bundle });
    await request(appWith(f)).get('/api/market-insights?zip=77840&radius=9999&slug_id=abc-1');
    expect(f.mock.calls[0][0]).toBe('https://bt.example/api/usda-market-insights?zip=77840&radius=500&slug_id=abc-1');
  });

  test('rejects a bad zip or market without calling BlockTrust', async () => {
    const f = okFetch({ ok: true, data: bundle });
    const app = appWith(f);
    expect((await request(app).get('/api/market-insights?zip=778')).status).toBe(400);
    expect((await request(app).get('/api/market-insights')).status).toBe(400);
    expect((await request(app).get('/api/market-insights?zip=77840&slug_id=a%26b')).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  test('hands back the service message when it has no data', async () => {
    const res = await request(appWith(okFetch({ ok: false, error: 'No markets found.' }))).get('/api/market-insights?zip=99999');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: false, error: 'No markets found.' });
  });

  test('502 when BlockTrust cannot be reached', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(appWith(jest.fn(async () => { throw new Error('down'); }))).get('/api/market-insights?zip=77840');
    expect(res.status).toBe(502);
    expect(res.body.ok).toBe(false);
    console.error.mockRestore();
  });

  test('502 when the answer is not what we expect', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(appWith(okFetch({ hello: 1 }))).get('/api/market-insights?zip=77840');
    expect(res.status).toBe(502);
    console.error.mockRestore();
  });

  test('503 when no address is set', async () => {
    const res = await request(appWith(okFetch({}), '')).get('/api/market-insights?zip=77840');
    expect(res.status).toBe(503);
  });
});
