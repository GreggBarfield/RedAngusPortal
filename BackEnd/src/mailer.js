'use strict';
// Sends one email through SMTP2GO's web API. One call = one recipient, so nobody sees
// anyone else's address. The API key goes in a header and is never written to a log.
const ENDPOINT = 'https://api.smtp2go.com/v3/email/send';

// getConfig() returns the showlist settings each time (so .env changes need only a restart).
function createMailer({ getConfig, fetchImpl = globalThis.fetch, timeoutMs = 20000 }) {
  async function send({ to, subject, html, text, headers = [] }) {
    const cfg = getConfig();
    if (!cfg.apiKey) return { ok: false, fatal: true, error: 'SMTP2GO_API_KEY is not set' };
    const body = {
      sender: `${cfg.fromName} <${cfg.from}>`,
      to: [to],
      subject,
      html_body: html,
      text_body: text,
      custom_headers: [{ header: 'Reply-To', value: cfg.replyTo }, ...headers],
    };
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Smtp2go-Api-Key': cfg.apiKey },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
      let json = null;
      try {
        json = await res.json();
      } catch (e) {
        json = null;
      }
      const data = (json && json.data) || {};
      if (res.status === 401 || res.status === 403 || (data.error_code && /PERMISSION|API_KEY|AUTH/i.test(String(data.error_code)))) {
        return { ok: false, fatal: true, error: `SMTP2GO refused the key: ${data.error || 'HTTP ' + res.status}` };
      }
      if (!res.ok || data.error) {
        return { ok: false, fatal: false, error: `SMTP2GO error: ${data.error || 'HTTP ' + res.status}` };
      }
      if (Number(data.failed) > 0) {
        return { ok: false, fatal: false, error: `SMTP2GO could not send: ${JSON.stringify(data.failures || []).slice(0, 300)}` };
      }
      return { ok: true, emailId: data.email_id || null };
    } catch (err) {
      return { ok: false, fatal: false, error: err && err.name === 'AbortError' ? 'SMTP2GO did not answer in time' : `Could not reach SMTP2GO: ${err.message}` };
    } finally {
      clearTimeout(timer);
    }
  }
  return { send };
}

module.exports = { createMailer, ENDPOINT };
