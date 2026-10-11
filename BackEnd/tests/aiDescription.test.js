'use strict';
const request = require('supertest');
const { createApp } = require('../src/app');
const { signToken } = require('../src/auth');
const { createAiDescription, readInput, buildPayload, cleanOutput, trimSummary, PROMPT_RULES } = require('../src/aiDescription');
const { validateFeederListing, shape } = require('../src/routes/feederListings');
const { buildDatasheetHtml } = require('../src/datasheet');

const SECRET = 'test-secret-that-is-at-least-32-characters-long';
const NOW = new Date('2026-10-11T12:00:00Z');
const KEY = 'sk-ant-test-key-never-shown';

const FORM = {
  steerCount: '40',
  heiferCount: '20',
  avgWeightSteers: '600',
  avgWeightHeifers: '550',
  breeds: ['Red Angus', 'Angus'],
  breedMode: 'percent',
  breedAmounts: { 'Red Angus': '75', Angus: '25' },
  birthDate: '2026-03-01',
  weanDate: '2026-09-01',
  vetName: 'Dr. Smith',
  birthCountry: 'United States',
  preconditioning: ['Weaned 45 Days'],
  special: [],
  description: 'Home raised.',
  nutrition: 'Creep feed and mineral.',
  vaccinations: [{ date: '2026-08-01', product: 'Bovi-Shield Gold 5' }, { date: '', product: '' }],
  marketingMethod: 'auction',
  auctionName: 'Bryan Livestock',
  marketingDate: '2026-11-15',
  tagVisualStart: 'V100',
  // These must never reach Claude:
  contactName: 'Pat Rancher',
  contactPhone: '(979) 555-0100',
  contactEmail: 'pat@example.com',
  zip: '77845',
  askingPrice: '1.85',
};

function fakeFetch(reply = { content: [{ type: 'text', text: 'One.[BREAK]Two.[BREAK]Three.' }], usage: { input_tokens: 10, output_tokens: 5 } }, status = 200) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return { ok: status >= 200 && status < 300, status, json: async () => reply };
  };
  fn.calls = calls;
  return fn;
}

describe('readInput', () => {
  it('needs head count and a breed, and says which are missing', () => {
    const r = readInput({}, NOW);
    expect(r.errors.steerCount).toBeTruthy();
    expect(r.errors.breeds).toBeTruthy();
    expect(Object.keys(r.errors).sort()).toEqual(['breeds', 'steerCount']);
    expect(readInput({ steerCount: '0', heiferCount: '0', breeds: ['Red Angus'] }, NOW).errors.steerCount).toMatch(/at least one/);
  });

  it('accepts a partly filled form and leaves out what is wrong instead of failing', () => {
    const r = readInput({ steerCount: '10', breeds: ['Red Angus'], birthDate: 'not a date', avgWeightSteers: '5', marketingMethod: 'bogus' }, NOW);
    expect(r.errors).toBeUndefined();
    expect(r.values.steerCount).toBe(10);
    expect(r.values.heiferCount).toBe(0);
    expect(r.values.birthDate).toBeUndefined();
    expect(r.values.avgWeightSteers).toBeUndefined();
    expect(r.values.marketingMethod).toBeUndefined();
    expect(r.values.birthCountry).toBe('United States');
  });

  it('reads breed makeup, vaccinations and programs', () => {
    const { values } = readInput(FORM, NOW);
    expect(values.breedMode).toBe('percent');
    expect(values.breedAmounts).toEqual({ 'Red Angus': 75, Angus: 25 });
    expect(values.vaccinations).toEqual([{ date: '2026-08-01', product: 'Bovi-Shield Gold 5' }]);
    expect(values.preconditioning).toEqual(['Weaned 45 Days']);
  });

  it('ignores a breed makeup with no usable amounts', () => {
    const { values } = readInput({ ...FORM, breedAmounts: { 'Red Angus': 'x' } }, NOW);
    expect(values.breedMode).toBeNull();
  });
});

describe('buildPayload', () => {
  const payload = () => buildPayload(readInput(FORM, NOW).values, [], NOW);

  it('carries the cattle facts', () => {
    const p = payload();
    expect(p.head_count).toBe('60');
    expect(p.avg_weight_steers).toBe('600');
    expect(p.breed).toBe('Red Angus 75%, Angus 25%');
    expect(p.age_months).toBe('7');
    expect(p.weaned_days).toBe('40');
    expect(p.vaccinations).toBe('08/01/2026 - Bovi-Shield Gold 5');
    expect(p.market_method).toBe('Auction');
    expect(p.market_date).toBe('11/15/2026');
    expect(p.location).toBe('Bryan Livestock');
    expect(p.has_tags).toBe('Yes');
    expect(p.partner_program_details).toBeUndefined();
  });

  it('never carries contact details, zip code or price', () => {
    const text = JSON.stringify(payload()).toLowerCase();
    for (const secret of ['pat rancher', '555-0100', 'pat@example.com', '77845', '1.85']) expect(text).not.toContain(secret);
  });

  it('adds program details only when there are some, and says Off Ranch for off ranch sales', () => {
    const v = readInput({ ...FORM, marketingMethod: 'off_ranch', auctionName: 'Ignored' }, NOW).values;
    const p = buildPayload(v, [{ program_name: 'Weaned 45 Days', buyer_value_prop: 'x' }], NOW);
    expect(p.partner_program_details).toHaveLength(1);
    expect(p.location).toBe('Off Ranch');
  });
});

describe('cleanOutput', () => {
  it('turns paragraph markers into blank lines and keeps plain ASCII', () => {
    const t = cleanOutput('First — one.[BREAK]Second “quote”.  [BREAK]  Third.\r\n');
    expect(t).toBe('First - one.\n\nSecond "quote".\n\nThird.');
  });
  it('stops at 2000 characters on a word boundary', () => {
    const t = cleanOutput('word '.repeat(1000));
    expect(t.length).toBeLessThanOrEqual(2000);
    expect(t.endsWith('word')).toBe(true);
  });
  it('trims long program summaries', () => {
    const s = trimSummary({ a: 'x'.repeat(5000), list: Array.from({ length: 50 }, (_, i) => String(i)), fn: () => 1 });
    expect(s.a.length).toBe(1000);
    expect(s.list).toHaveLength(12);
    expect(s.fn).toBeUndefined();
  });
});

describe('programDetails', () => {
  it('asks BlockTrust for active program summaries by name and returns them', async () => {
    const queries = [];
    const btn = {
      canRef: () => true,
      ref: {
        async query(sql, params) {
          queries.push({ sql, params });
          return { rows: [{ prog_name: 'Weaned 45 Days', structured_summary: { buyer_value_prop: 'Calm cattle', key_requirements: ['45 days'] } }] };
        },
      },
    };
    const ai = createAiDescription({ config: { anthropicApiKey: KEY }, btn });
    const d = await ai.programDetails(['Weaned 45 Days', 'weaned 45 days', ' ']);
    expect(d).toEqual([{ program_name: 'Weaned 45 Days', buyer_value_prop: 'Calm cattle', key_requirements: ['45 days'] }]);
    expect(queries[0].params[0]).toEqual(['weaned 45 days']);
    expect(queries[0].sql).toMatch(/status = 'active'/);
    expect(queries[0].sql).toMatch(/^\s*SELECT/);
  });

  it('returns nothing when there are no programs or BlockTrust cannot be read', async () => {
    let called = 0;
    const btn = { canRef: () => true, ref: { query: async () => { called += 1; throw new Error('permission denied'); } } };
    const ai = createAiDescription({ config: { anthropicApiKey: KEY }, btn });
    expect(await ai.programDetails([])).toEqual([]);
    expect(called).toBe(0);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(await ai.programDetails(['X'])).toEqual([]);
    spy.mockRestore();
    expect(await createAiDescription({ config: {}, btn: { canRef: () => false } }).programDetails(['X'])).toEqual([]);
  });
});

describe('generate', () => {
  const noBtn = { canRef: () => false };
  const values = () => readInput(FORM, NOW).values;

  it('sends one request to Claude and returns the cleaned notes', async () => {
    const f = fakeFetch();
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const ai = createAiDescription({ config: { anthropicApiKey: KEY, anthropicModel: 'claude-test' }, btn: noBtn, fetchFn: f });
    const r = await ai.generate(values(), NOW);
    log.mockRestore();
    expect(r.text).toBe('One.\n\nTwo.\n\nThree.');
    expect(f.calls).toHaveLength(1);
    const { url, init, body } = f.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe(KEY);
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
    expect(body.model).toBe('claude-test');
    expect(body.messages[0].content.startsWith(PROMPT_RULES)).toBe(true);
    expect(body.messages[0].content).toContain('"head_count": "60"');
    expect(JSON.stringify(body)).not.toContain(KEY);
    expect(JSON.stringify(body)).not.toContain('555-0100');
  });

  it('includes program details from BlockTrust in the request', async () => {
    const f = fakeFetch();
    const btn = { canRef: () => true, ref: { query: async () => ({ rows: [{ prog_name: 'Weaned 45 Days', structured_summary: { buyer_value_prop: 'Calm cattle' } }] }) } };
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const ai = createAiDescription({ config: { anthropicApiKey: KEY }, btn, fetchFn: f });
    await ai.generate(values(), NOW);
    console.log.mockRestore();
    expect(f.calls[0].body.messages[0].content).toContain('Calm cattle');
  });

  it('fails clearly without a key, on an error answer, and on an empty answer (never showing the key)', async () => {
    await expect(createAiDescription({ config: {}, btn: noBtn }).generate(values(), NOW)).rejects.toThrow(/not set/);
    const bad = createAiDescription({ config: { anthropicApiKey: KEY }, btn: noBtn, fetchFn: fakeFetch({ error: 'x' }, 529) });
    await expect(bad.generate(values(), NOW)).rejects.toThrow('status 529');
    const empty = createAiDescription({ config: { anthropicApiKey: KEY }, btn: noBtn, fetchFn: fakeFetch({ content: [] }) });
    await expect(empty.generate(values(), NOW)).rejects.toThrow(/no text/);
  });
});

describe('POST /api/feeder-listings/ai-description', () => {
  const tok = () => 'Bearer ' + signToken({ id: 1, role: 'member' }, SECRET);
  const users = { findById: async (id) => (String(id) === '1' ? { id: 1, display_name: 'Pat', role: 'member', is_active: true } : null) };

  function makeApp(ai) {
    return createApp({
      db: { isConfigured: () => true, ping: async () => true },
      config: { jwtSecret: SECRET },
      users,
      barns: { available: () => false },
      listings: {},
      feeders: {},
      ref: { available: () => false },
      feederListings: {},
      breedingListings: {},
      savedFilters: {},
      ai,
      now: () => NOW.getTime(),
    });
  }
  const fakeAi = (over = {}) => ({
    available: () => true,
    readInput,
    generate: jest.fn(async () => ({ text: 'Notes.' })),
    ...over,
  });

  it('needs a signed-in user', async () => {
    const res = await request(makeApp(fakeAi())).post('/api/feeder-listings/ai-description').send(FORM);
    expect(res.status).toBe(401);
  });

  it('says not available when there is no key', async () => {
    const res = await request(makeApp(fakeAi({ available: () => false }))).post('/api/feeder-listings/ai-description').set('Authorization', tok()).send(FORM);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('ai_not_available');
  });

  it('asks for head count and breed first', async () => {
    const ai = fakeAi();
    const res = await request(makeApp(ai)).post('/api/feeder-listings/ai-description').set('Authorization', tok()).send({});
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields).sort()).toEqual(['breeds', 'steerCount']);
    expect(ai.generate).not.toHaveBeenCalled();
  });

  it('returns the notes', async () => {
    const ai = fakeAi();
    const res = await request(makeApp(ai)).post('/api/feeder-listings/ai-description').set('Authorization', tok()).send(FORM);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ text: 'Notes.' });
    expect(ai.generate.mock.calls[0][0].steerCount).toBe(40);
  });

  it('answers 502 when Claude cannot be reached, without leaking the reason', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const ai = fakeAi({ generate: async () => { throw new Error('boom ' + KEY); } });
    const res = await request(makeApp(ai)).post('/api/feeder-listings/ai-description').set('Authorization', tok()).send(FORM);
    spy.mockRestore();
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain(KEY);
  });

  it('allows 30 a day per person, then 429', async () => {
    const app = makeApp(fakeAi());
    for (let i = 0; i < 30; i += 1) {
      const ok = await request(app).post('/api/feeder-listings/ai-description').set('Authorization', tok()).send(FORM);
      expect(ok.status).toBe(200);
    }
    const res = await request(app).post('/api/feeder-listings/ai-description').set('Authorization', tok()).send(FORM);
    expect(res.status).toBe(429);
  });
});

describe('saving and showing the notes', () => {
  const base = {
    groupId: 'BARFIELD100',
    steerCount: 40,
    heiferCount: 20,
    breeds: ['Red Angus'],
    marketingMethod: 'off_ranch',
    marketingDate: '2026-11-15',
    state: 'tx',
    zip: '77845',
    contactName: 'Pat Rancher',
    contactPhone: '(979) 555-0100',
    contactEmail: 'pat@example.com',
  };
  const NOTES = 'Line one.\r\n\r\nLine two.';

  it('keeps the notes when the box is ticked, with plain line breaks', () => {
    const { values, errors } = validateFeederListing({ ...base, includeAi: true, aiDescription: NOTES }, NOW);
    expect(errors).toBeUndefined();
    expect(values.includeAi).toBe(true);
    expect(values.aiDescription).toBe('Line one.\n\nLine two.');
  });

  it('does not include notes when the box is not ticked or the text is empty', () => {
    expect(validateFeederListing({ ...base, includeAi: false, aiDescription: NOTES }, NOW).values.includeAi).toBe(false);
    expect(validateFeederListing({ ...base, includeAi: true, aiDescription: '   ' }, NOW).values.includeAi).toBe(false);
    expect(validateFeederListing(base, NOW).values.includeAi).toBe(false);
  });

  it('rejects notes over 2000 characters', () => {
    const r = validateFeederListing({ ...base, includeAi: true, aiDescription: 'x'.repeat(2001) }, NOW);
    expect(r.errors.aiDescription).toBeTruthy();
  });

  const row = (over = {}) => ({ id: 5, owner_id: 1, status: 'approved', headline: 'h', steer_count: 1, heifer_count: 0, head_count: 1, breeds: [], include_ai: true, ai_description: 'Notes.', ...over });

  it('shows the notes to everyone only when included; the owner always sees their text', () => {
    expect(shape(row(), 'public', NOW).aiDescription).toBe('Notes.');
    expect(shape(row(), 'member', NOW).aiDescription).toBe('Notes.');
    const off = row({ include_ai: false });
    expect(shape(off, 'public', NOW).aiDescription).toBeNull();
    expect(shape(off, 'member', NOW).aiDescription).toBeNull();
    expect(shape(off, 'owner', NOW).aiDescription).toBe('Notes.');
    expect(shape(off, 'owner', NOW).includeAi).toBe(false);
    expect(shape(row(), 'staff', NOW).includeAi).toBe(true);
    expect(shape(row(), 'public', NOW).includeAi).toBeUndefined();
  });

  it('puts the notes on the data sheet, escaped, and leaves the section out when there are none', () => {
    const assets = { logo: '', qr: 'data:image/png;base64,AA==' };
    const l = shape(row({ ai_description: 'Calm <b>cattle</b>.\n\nSecond paragraph.' }), 'member', NOW);
    const html = buildDatasheetHtml(l, assets);
    expect(html).toContain('Listing Notes:');
    expect(html).toContain('Calm &lt;b&gt;cattle&lt;/b&gt;.');
    expect(html).not.toContain('<b>cattle</b>');
    const none = buildDatasheetHtml(shape(row({ include_ai: false }), 'member', NOW), assets);
    expect(none).not.toContain('Listing Notes:');
  });
});
