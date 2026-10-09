'use strict';
const { createMailer, ENDPOINT } = require('../src/mailer');

const cfg = { apiKey: 'KEY123', from: 'info@blocktrustnetwork.com', fromName: 'Red Angus Portal', replyTo: 'info@blocktrustnetwork.com' };

function fakeFetch(status, json, capture) {
  return async (url, opts) => {
    if (capture) Object.assign(capture, { url, opts });
    return { status, ok: status >= 200 && status < 300, json: async () => json };
  };
}

describe('mailer (SMTP2GO web API)', () => {
  test('sends one email to one person, key in a header, reply-to set', async () => {
    const seen = {};
    const m = createMailer({ getConfig: () => cfg, fetchImpl: fakeFetch(200, { request_id: 'r', data: { succeeded: 1, failed: 0, failures: [], email_id: 'E1' } }, seen) });
    const r = await m.send({ to: 'a@b.com', subject: 'S [ref:5]', html: '<p>x</p>', text: 'x', headers: [{ header: 'List-Unsubscribe', value: '<https://u>' }] });
    expect(r).toEqual({ ok: true, emailId: 'E1' });
    expect(seen.url).toBe(ENDPOINT);
    expect(seen.opts.headers['X-Smtp2go-Api-Key']).toBe('KEY123');
    const body = JSON.parse(seen.opts.body);
    expect(body).toMatchObject({ sender: 'Red Angus Portal <info@blocktrustnetwork.com>', to: ['a@b.com'], subject: 'S [ref:5]' });
    expect(body.custom_headers).toEqual([
      { header: 'Reply-To', value: 'info@blocktrustnetwork.com' },
      { header: 'List-Unsubscribe', value: '<https://u>' },
    ]);
    expect(seen.opts.body).not.toContain('KEY123');
  });

  test('a 200 with failures is a failure', async () => {
    const m = createMailer({ getConfig: () => cfg, fetchImpl: fakeFetch(200, { data: { succeeded: 0, failed: 1, failures: ['bad address'] } }) });
    const r = await m.send({ to: 'a@b.com', subject: 's', html: 'h', text: 't' });
    expect(r.ok).toBe(false);
    expect(r.fatal).toBe(false);
    expect(r.error).toContain('bad address');
  });

  test('a refused key is fatal (stop sending)', async () => {
    const m = createMailer({ getConfig: () => cfg, fetchImpl: fakeFetch(401, { data: { error: 'bad key' } }) });
    const r = await m.send({ to: 'a@b.com', subject: 's', html: 'h', text: 't' });
    expect(r).toMatchObject({ ok: false, fatal: true });
    const m2 = createMailer({ getConfig: () => cfg, fetchImpl: fakeFetch(400, { data: { error_code: 'E_ApiResponseCodes.ENDPOINT_PERMISSION_DENIED', error: 'no permission' } }) });
    expect(await m2.send({ to: 'a@b.com', subject: 's', html: 'h', text: 't' })).toMatchObject({ ok: false, fatal: true });
  });

  test('other errors and network problems are not fatal', async () => {
    const m = createMailer({ getConfig: () => cfg, fetchImpl: fakeFetch(500, { data: { error: 'oops' } }) });
    expect(await m.send({ to: 'a@b.com', subject: 's', html: 'h', text: 't' })).toMatchObject({ ok: false, fatal: false });
    const m2 = createMailer({
      getConfig: () => cfg,
      fetchImpl: async () => {
        throw new Error('ECONNRESET');
      },
    });
    const r = await m2.send({ to: 'a@b.com', subject: 's', html: 'h', text: 't' });
    expect(r).toMatchObject({ ok: false, fatal: false });
    expect(r.error).toContain('ECONNRESET');
  });

  test('no key set: nothing is sent', async () => {
    let called = false;
    const m = createMailer({ getConfig: () => ({ ...cfg, apiKey: '' }), fetchImpl: async () => { called = true; } });
    expect(await m.send({ to: 'a@b.com', subject: 's', html: 'h', text: 't' })).toMatchObject({ ok: false, fatal: true });
    expect(called).toBe(false);
  });
});
