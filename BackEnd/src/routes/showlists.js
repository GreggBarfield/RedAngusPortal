'use strict';
const crypto = require('crypto');
const express = require('express');
const { createRequireAuth, requireRole } = require('../auth');
const { renderShowlist } = require('../showlistEmail');
const { missingSettings } = require('../showlistConfig');

const ID_RE = /^\d{1,12}$/;
const TOKEN_RE = /^[a-f0-9]{32}$/;
const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
const MAX_LOTS = 25;
const MAX_FEEDLOTS = 1000;

function counts(rows) {
  const out = { QUEUED: 0, SENDING: 0, SUBMITTED: 0, DELIVERED: 0, FAILED: 0, SUBMIT_FAILED: 0 };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

// subject, intro and the lot list. Returns { values } or { errors }.
function validateCompose(body, { needFeedlots }) {
  const b = body && typeof body === 'object' ? body : {};
  const errors = {};
  const subject = typeof b.subject === 'string' ? b.subject.trim() : '';
  if (subject.length < 3 || subject.length > 150) errors.subject = 'Enter a subject of 3 to 150 characters.';
  else if (/[\r\n]/.test(subject)) errors.subject = 'The subject must be on one line.';
  const intro = typeof b.intro === 'string' ? b.intro.trim() : '';
  if (intro.length > 3000) errors.intro = 'Keep the message under 3000 characters.';
  const ids = (v, max) => {
    if (!Array.isArray(v)) return null;
    const out = [];
    for (const x of v) {
      const n = Number(x);
      if (!Number.isInteger(n) || n <= 0) return null;
      if (!out.includes(n)) out.push(n);
    }
    return out.length >= 1 && out.length <= max ? out : null;
  };
  const lotIds = ids(b.lotIds, MAX_LOTS);
  if (!lotIds) errors.lotIds = `Pick 1 to ${MAX_LOTS} lots of cattle.`;
  let feedlotIds = null;
  if (needFeedlots) {
    feedlotIds = ids(b.feedlotIds, MAX_FEEDLOTS);
    if (!feedlotIds) errors.feedlotIds = `Pick 1 to ${MAX_FEEDLOTS} feedlots.`;
  }
  if (Object.keys(errors).length) return { errors };
  return { values: { subject, intro, lotIds, feedlotIds } };
}

// Staff screens: pick cattle, pick feedlots, preview, send, watch the results.
function createShowlistsRouter({ showlists, sender, mailer, users, config, getShowlistConfig }) {
  const router = express.Router();
  const secret = config.jwtSecret;
  const usable = Boolean(secret) && secret.length >= 32;
  const requireAuth = createRequireAuth({ users, secret: usable ? secret : '' });
  router.use(requireAuth, requireRole('staff'));

  const ready = () => {
    const cfg = getShowlistConfig();
    return { cfg, missing: missingSettings(cfg) };
  };

  router.get('/status', async (req, res, next) => {
    try {
      const { cfg, missing } = ready();
      res.json({
        configured: missing.length === 0,
        missing,
        from: cfg.from,
        replyTo: cfg.replyTo,
        sending: sender.anyActive(),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/lots', async (req, res, next) => {
    try {
      res.json({ lots: await showlists.lots() });
    } catch (err) {
      next(err);
    }
  });

  router.get('/recipients', async (req, res, next) => {
    try {
      const { rows, blocked } = await showlists.recipients();
      res.json({
        blocked,
        feedlots: rows.map((r) => ({
          id: Number(r.id),
          name: r.name,
          city: r.city,
          state: r.state,
          emails: r.emails || [],
          lastSent: r.last_sent || null,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  async function composeLots(res, values) {
    const lots = await showlists.lotsByIds(values.lotIds);
    if (lots.length !== values.lotIds.length) {
      res.status(400).json({ error: 'validation', fields: { lotIds: 'One of the lots is no longer available. Reload the page and pick again.' } });
      return null;
    }
    return lots;
  }

  router.post('/preview', async (req, res, next) => {
    try {
      const v = validateCompose(req.body, { needFeedlots: false });
      if (v.errors) return res.status(400).json({ error: 'validation', fields: v.errors });
      const lots = await composeLots(res, v.values);
      if (!lots) return undefined;
      const { cfg } = ready();
      const { html, text } = renderShowlist({
        subject: v.values.subject,
        intro: v.values.intro,
        lots,
        siteUrl: cfg.siteUrl,
        postalAddress: cfg.postalAddress || '[mailing address not set yet]',
        fromName: cfg.fromName,
        unsubscribeUrl: `${cfg.siteUrl}/unsubscribe/preview`,
      });
      return res.json({ subject: v.values.subject, html, text });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/test', async (req, res, next) => {
    try {
      const { cfg, missing } = ready();
      if (missing.length) return res.status(503).json({ error: 'email_not_configured', missing });
      const v = validateCompose(req.body, { needFeedlots: false });
      const to = req.body && typeof req.body.to === 'string' ? req.body.to.trim() : '';
      if (v.errors || !EMAIL_RE.test(to)) {
        return res.status(400).json({ error: 'validation', fields: { ...(v.errors || {}), ...(EMAIL_RE.test(to) ? {} : { to: 'Enter a valid email address.' }) } });
      }
      const lots = await composeLots(res, v.values);
      if (!lots) return undefined;
      const { html, text } = renderShowlist({
        subject: `[TEST] ${v.values.subject}`,
        intro: v.values.intro,
        lots,
        siteUrl: cfg.siteUrl,
        postalAddress: cfg.postalAddress,
        fromName: cfg.fromName,
        unsubscribeUrl: `${cfg.siteUrl}/unsubscribe/test-only`,
      });
      const r = await mailer.send({ to, subject: `[TEST] ${v.values.subject}`, html, text });
      if (!r.ok) return res.status(502).json({ error: 'send_failed', message: r.error });
      return res.json({ sent: true, to });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const { missing } = ready();
      if (missing.length) return res.status(503).json({ error: 'email_not_configured', missing });
      const v = validateCompose(req.body, { needFeedlots: true });
      if (v.errors) return res.status(400).json({ error: 'validation', fields: v.errors });
      const busy = sender.anyActive() ? true : (await showlists.anyUnfinished()) !== null;
      if (busy) return res.status(409).json({ error: 'busy', message: 'A showlist is still being sent (or is waiting to be resumed). Wait for it, or resume it first.' });
      const lots = await composeLots(res, v.values);
      if (!lots) return undefined;
      const feedlots = await showlists.feedlotsByIds(v.values.feedlotIds);
      const seen = new Set();
      const targets = [];
      for (const f of feedlots) {
        for (const e of f.emails || []) {
          const key = String(e).trim().toLowerCase();
          if (!key || seen.has(key)) continue;
          seen.add(key);
          targets.push({ feedlotId: f.id, feedlotName: f.name, email: String(e).trim() });
        }
      }
      if (targets.length === 0) {
        return res.status(400).json({ error: 'validation', fields: { feedlotIds: 'None of those feedlots can be emailed (retired, marked do not email, or no address).' } });
      }
      const made = await showlists.create({ subject: v.values.subject, intro: v.values.intro, lots, targets, userId: req.user.id });
      sender.start(made.id);
      return res.status(202).json({ showlist: { id: made.id, recipientCount: made.recipientCount } });
    } catch (err) {
      return next(err);
    }
  });

  router.get('/', async (req, res, next) => {
    try {
      const rows = await showlists.list();
      res.json({
        showlists: rows.map((r) => ({
          id: Number(r.id),
          subject: r.subject,
          recipientCount: r.recipient_count,
          lotCount: r.lot_count,
          createdAt: r.created_at,
          createdBy: r.created_by,
          counts: { ...counts([]), ...(r.counts || {}) },
        })),
        sending: sender.anyActive(),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: 'not_found' });
      const got = await showlists.get(Number(req.params.id));
      if (!got) return res.status(404).json({ error: 'not_found' });
      const sl = got.showlist;
      return res.json({
        showlist: {
          id: Number(sl.id),
          subject: sl.subject,
          intro: sl.intro,
          recipientCount: sl.recipient_count,
          createdAt: sl.created_at,
          createdBy: sl.created_by,
          lots: (sl.lots || []).map((l) => ({ id: l.id, headline: l.headline })),
        },
        counts: counts(got.counts),
        active: sender.isActive(sl.id),
        sends: got.sends.map((s) => ({
          id: Number(s.id),
          feedlotId: Number(s.feedlot_id),
          feedlotName: s.feedlot_name,
          recipient: s.recipient,
          status: s.status,
          detail: s.status_detail,
          submittedAt: s.submitted_at,
          deliveredAt: s.delivered_at,
          failedAt: s.failed_at,
          unsubscribedAt: s.unsubscribed_at,
        })),
      });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/:id/resume', async (req, res, next) => {
    try {
      if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: 'not_found' });
      const id = Number(req.params.id);
      const { missing } = ready();
      if (missing.length) return res.status(503).json({ error: 'email_not_configured', missing });
      if (sender.isActive(id)) return res.status(409).json({ error: 'busy', message: 'This showlist is still being sent.' });
      if (!(await showlists.getShowlist(id))) return res.status(404).json({ error: 'not_found' });
      await showlists.interruptStale(id);
      const waiting = await showlists.queuedCount(id);
      if (waiting === 0) return res.status(400).json({ error: 'nothing_to_send', message: 'Nothing is waiting to be sent.' });
      sender.start(id);
      return res.status(202).json({ resumed: true, waiting });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

function sameSecret(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Public pieces: the unsubscribe link, and the delivery reports SMTP2GO posts back.
// Mounted at /api.
function createMailPublicRouter({ showlists, getShowlistConfig, log = console }) {
  const router = express.Router();
  const form = express.urlencoded({ extended: false, limit: '100kb' });

  router.get('/unsubscribe/:token', async (req, res, next) => {
    try {
      if (!TOKEN_RE.test(req.params.token)) return res.status(404).json({ error: 'not_found' });
      const row = await showlists.findByToken(req.params.token);
      if (!row) return res.status(404).json({ error: 'not_found' });
      return res.json({ feedlotName: row.feedlot_name, alreadyOff: Boolean(row.off) });
    } catch (err) {
      return next(err);
    }
  });

  // Also the target of the "one click" unsubscribe button some mail programs show.
  router.post('/unsubscribe/:token', form, async (req, res, next) => {
    try {
      if (!TOKEN_RE.test(req.params.token)) return res.status(404).json({ error: 'not_found' });
      const r = await showlists.unsubscribe(req.params.token);
      if (!r) return res.status(404).json({ error: 'not_found' });
      return res.json({ done: true, feedlotName: r.feedlotName });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/smtp2go/callback', form, async (req, res, next) => {
    try {
      const cfg = getShowlistConfig();
      if (!cfg.webhookToken) return res.status(503).json({ error: 'not_configured' });
      const bearer = /^Bearer (.+)$/i.exec(req.headers.authorization || '');
      const given = bearer ? bearer[1] : typeof req.query.token === 'string' ? req.query.token : '';
      if (!given || !sameSecret(given, cfg.webhookToken)) return res.status(401).json({ error: 'unauthorized' });

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const event = String(body.event || '').toLowerCase();
      const kind = event === 'delivered' ? 'delivered' : event === 'bounce' || event === 'reject' ? 'failed' : event === 'spam' ? 'spam' : null;
      if (!kind) return res.json({ ok: true, ignored: true });
      const subject = String(body.subject || body.Subject || '');
      const m = /\[ref:(\d{1,12})\]/.exec(subject);
      const rcpt = body.rcpt || (Array.isArray(body.recipients) ? body.recipients[0] : '') || '';
      if (!m) return res.json({ ok: true, ignored: true });
      const detail = JSON.stringify(body);
      const r = await showlists.applyEvent({ ref: Number(m[1]), rcpt, kind, detail });
      if (r.updated === 0) log.warn(`smtp2go callback ignored: no waiting showlist email matches ref ${m[1]}`);
      return res.json({ ok: true, updated: r.updated });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = { createShowlistsRouter, createMailPublicRouter, validateCompose };
