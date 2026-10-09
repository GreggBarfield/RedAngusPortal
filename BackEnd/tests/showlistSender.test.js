'use strict';
const { createSender } = require('../src/showlistSender');

function fakeRepo(n) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: i + 1, feedlot_id: 100 + i, feedlot_name: `Yard ${i + 1}`, recipient: `y${i + 1}@x.com`, token: 't'.repeat(31) + i, status: 'QUEUED' }));
  return {
    rows,
    async getShowlist() {
      return { id: 1, subject: 'Hello', intro: 'Hi', lots: [{ id: 5, headline: 'Lot', breeds: [] }] };
    },
    async claim(id, limit) {
      const out = rows.filter((r) => r.status === 'QUEUED').slice(0, limit);
      out.forEach((r) => (r.status = 'SENDING'));
      return out;
    },
    async markSubmitted(id, emailId) {
      const r = rows.find((x) => x.id === id);
      r.status = 'SUBMITTED';
      r.emailId = emailId;
    },
    async markSubmitFailed(id, detail) {
      const r = rows.find((x) => x.id === id);
      r.status = 'SUBMIT_FAILED';
      r.detail = detail;
    },
    async requeue(id) {
      rows.find((x) => x.id === id).status = 'QUEUED';
    },
  };
}

const cfg = () => ({ siteUrl: 'https://raa.example', postalAddress: 'addr', fromName: 'Portal' });
const quiet = { error() {}, warn() {} };

describe('showlist sender', () => {
  test('sends every waiting email with its own ref number and unsubscribe link', async () => {
    const repo = fakeRepo(5);
    const sent = [];
    const mailer = { send: async (m) => (sent.push(m), { ok: true, emailId: 'E' + sent.length }) };
    const s = createSender({ repo, mailer, getConfig: cfg, log: quiet });
    const r = await s.run(1);
    expect(r.stopped).toBe(false);
    expect(repo.rows.every((x) => x.status === 'SUBMITTED')).toBe(true);
    expect(sent.map((m) => m.subject)).toEqual(expect.arrayContaining(['Hello [ref:1]', 'Hello [ref:5]']));
    const m3 = sent.find((m) => m.to === 'y3@x.com');
    expect(m3.html).toContain('https://raa.example/unsubscribe/' + repo.rows[2].token);
    expect(m3.headers).toEqual([
      { header: 'List-Unsubscribe', value: `<https://raa.example/api/unsubscribe/${repo.rows[2].token}>` },
      { header: 'List-Unsubscribe-Post', value: 'List-Unsubscribe=One-Click' },
    ]);
    expect(s.anyActive()).toBe(false);
  });

  test('one bad address does not stop the rest', async () => {
    const repo = fakeRepo(4);
    const mailer = { send: async (m) => (m.to === 'y2@x.com' ? { ok: false, fatal: false, error: 'rejected' } : { ok: true, emailId: 'E' }) };
    await createSender({ repo, mailer, getConfig: cfg, log: quiet }).run(1);
    expect(repo.rows.map((r) => r.status)).toEqual(['SUBMITTED', 'SUBMIT_FAILED', 'SUBMITTED', 'SUBMITTED']);
    expect(repo.rows[1].detail).toBe('rejected');
  });

  test('a refused key stops the run and leaves the rest waiting', async () => {
    const repo = fakeRepo(10);
    const mailer = { send: async () => ({ ok: false, fatal: true, error: 'bad key' }) };
    const r = await createSender({ repo, mailer, getConfig: cfg, log: quiet, concurrency: 3 }).run(1);
    expect(r).toMatchObject({ stopped: true, error: 'bad key' });
    expect(repo.rows.every((x) => x.status === 'QUEUED')).toBe(true);
  });

  test('the same showlist is never run twice at once', async () => {
    const repo = fakeRepo(3);
    let release;
    const gate = new Promise((res) => (release = res));
    const mailer = { send: async () => (await gate, { ok: true, emailId: 'E' }) };
    const s = createSender({ repo, mailer, getConfig: cfg, log: quiet });
    const first = s.run(1);
    await new Promise((r) => setImmediate(r));
    expect(s.isActive(1)).toBe(true);
    expect(await s.run(1)).toEqual({ skipped: true });
    release();
    await first;
    expect(s.isActive(1)).toBe(false);
  });
});
