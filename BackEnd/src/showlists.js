'use strict';
const crypto = require('crypto');

// Database side of the showlist email: which cattle can go in one, which feedlots can get one,
// the send log, delivery reports from SMTP2GO and the unsubscribe link.
function lotFromRow(r) {
  return {
    id: Number(r.id),
    headline: r.headline,
    steerCount: r.steer_count,
    heiferCount: r.heifer_count,
    headCount: r.head_count,
    avgWeightSteers: r.avg_weight_steers,
    avgWeightHeifers: r.avg_weight_heifers,
    avgWeight: r.avg_weight,
    marketingMethod: r.marketing_method,
    auctionName: r.auction_name,
    marketingDate: r.marketing_date, // text, YYYY-MM-DD
    city: r.city,
    state: r.state,
    priceBasis: r.price_basis,
    askingPrice: r.asking_price == null ? null : Number(r.asking_price),
    callForPrice: r.call_for_price,
    contactName: r.contact_name,
    contactPhone: r.contact_phone,
    contactEmail: r.contact_email,
    breeds: r.breeds || [],
  };
}

const LOT_SELECT = `
  SELECT f.id, f.headline, f.steer_count, f.heifer_count, f.head_count, f.avg_weight_steers, f.avg_weight_heifers,
         f.avg_weight, f.marketing_method, f.auction_name, f.marketing_date::text AS marketing_date, f.city, f.state,
         f.price_basis, f.asking_price, f.call_for_price, f.contact_name, f.contact_phone, f.contact_email,
         (SELECT array_agg(b.breed_name ORDER BY b.sort_order, b.id) FROM feeder_listing_breeds b WHERE b.listing_id = f.id) AS breeds
  FROM feeder_listings f
  WHERE f.status = 'approved' AND f.marketing_date >= current_date`;

function newToken() {
  return crypto.randomBytes(16).toString('hex');
}

function createShowlistsRepo(db) {
  return {
    // Approved feeder lots that have not sold yet (sale date today or later).
    async lots() {
      const r = await db.query(`${LOT_SELECT} ORDER BY f.marketing_date, f.id`);
      return r.rows.map(lotFromRow);
    },

    async lotsByIds(ids) {
      const r = await db.query(`${LOT_SELECT} AND f.id = ANY($1::bigint[]) ORDER BY f.marketing_date, f.id`, [ids]);
      return r.rows.map(lotFromRow);
    },

    // Feedlots that can be emailed right now: active, with an address, not marked do-not-email.
    async recipients() {
      const r = await db.query(
        `SELECT f.id, f.name, f.city, f.state, f.emails,
                (SELECT max(s.submitted_at) FROM showlist_sends s WHERE s.feedlot_id = f.id AND s.submitted_at IS NOT NULL) AS last_sent
         FROM feedlots f
         WHERE f.enabled AND NOT f.do_not_email AND cardinality(f.emails) > 0
         ORDER BY lower(f.name), f.id`,
      );
      const b = await db.query(
        `SELECT count(*)::int AS n FROM feedlots WHERE enabled AND do_not_email AND cardinality(emails) > 0`,
      );
      return { rows: r.rows, blocked: b.rows[0].n };
    },

    async feedlotsByIds(ids) {
      const r = await db.query(
        `SELECT id, name, emails FROM feedlots
         WHERE id = ANY($1::bigint[]) AND enabled AND NOT do_not_email AND cardinality(emails) > 0
         ORDER BY lower(name), id`,
        [ids],
      );
      return r.rows;
    },

    // Saves the showlist and one QUEUED row per email address. targets: [{ feedlotId, feedlotName, email }]
    async create({ subject, intro, lots, targets, userId }) {
      return db.transaction(async (c) => {
        const sl = (
          await c.query(
            `INSERT INTO showlists (subject, intro, lots, recipient_count, created_by)
             VALUES ($1, $2, $3::jsonb, $4, $5) RETURNING id`,
            [subject, intro || null, JSON.stringify(lots), targets.length, userId],
          )
        ).rows[0];
        await c.query(
          `INSERT INTO showlist_sends (showlist_id, feedlot_id, feedlot_name, recipient, token)
           SELECT $1, t.fid, t.fname, t.email, t.token
           FROM unnest($2::bigint[], $3::text[], $4::text[], $5::text[]) AS t(fid, fname, email, token)`,
          [sl.id, targets.map((t) => t.feedlotId), targets.map((t) => t.feedlotName), targets.map((t) => t.email), targets.map(() => newToken())],
        );
        return { id: Number(sl.id), recipientCount: targets.length };
      });
    },

    async getShowlist(id) {
      const r = await db.query(`SELECT id, subject, intro, lots, recipient_count, created_at FROM showlists WHERE id = $1`, [id]);
      return r.rows[0] || null;
    },

    // Takes up to `limit` waiting emails and marks them SENDING so nobody else takes them.
    async claim(showlistId, limit) {
      const r = await db.query(
        `UPDATE showlist_sends SET status = 'SENDING'
         WHERE id IN (SELECT id FROM showlist_sends WHERE showlist_id = $1 AND status = 'QUEUED' ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED)
         RETURNING id, feedlot_id, feedlot_name, recipient, token`,
        [showlistId, limit],
      );
      return r.rows.sort((a, b) => Number(a.id) - Number(b.id));
    },

    async markSubmitted(id, emailId) {
      await db.query(
        `UPDATE showlist_sends SET status = 'SUBMITTED', submitted_at = now(), smtp2go_email_id = $2, status_detail = NULL WHERE id = $1 AND status = 'SENDING'`,
        [id, emailId],
      );
    },

    async markSubmitFailed(id, detail) {
      await db.query(
        `UPDATE showlist_sends SET status = 'SUBMIT_FAILED', failed_at = now(), status_detail = $2 WHERE id = $1 AND status = 'SENDING'`,
        [id, String(detail || '').slice(0, 1000)],
      );
    },

    async requeue(id) {
      await db.query(`UPDATE showlist_sends SET status = 'QUEUED' WHERE id = $1 AND status = 'SENDING'`, [id]);
    },

    // After a restart: anything still SENDING may or may not have gone out. Say so, do not guess.
    async interruptStale(showlistId) {
      const r = await db.query(
        `UPDATE showlist_sends SET status = 'SUBMIT_FAILED', failed_at = now(),
                status_detail = 'Interrupted by a restart - it may or may not have been sent. Check SMTP2GO before sending again.'
         WHERE showlist_id = $1 AND status = 'SENDING'`,
        [showlistId],
      );
      return r.rowCount;
    },

    async queuedCount(showlistId) {
      const r = await db.query(`SELECT count(*)::int AS n FROM showlist_sends WHERE showlist_id = $1 AND status IN ('QUEUED', 'SENDING')`, [showlistId]);
      return r.rows[0].n;
    },

    async anyUnfinished() {
      const r = await db.query(`SELECT showlist_id FROM showlist_sends WHERE status IN ('QUEUED', 'SENDING') ORDER BY showlist_id LIMIT 1`);
      return r.rows[0] ? Number(r.rows[0].showlist_id) : null;
    },

    async list() {
      const r = await db.query(
        `SELECT sl.id, sl.subject, sl.recipient_count, sl.created_at, u.display_name AS created_by,
                (SELECT jsonb_object_agg(x.status, x.n) FROM (SELECT status, count(*)::int AS n FROM showlist_sends WHERE showlist_id = sl.id GROUP BY status) x) AS counts,
                jsonb_array_length(sl.lots) AS lot_count
         FROM showlists sl JOIN users u ON u.id = sl.created_by
         ORDER BY sl.id DESC LIMIT 50`,
      );
      return r.rows;
    },

    async get(id) {
      const sl = (
        await db.query(
          `SELECT sl.id, sl.subject, sl.intro, sl.lots, sl.recipient_count, sl.created_at, u.display_name AS created_by
           FROM showlists sl JOIN users u ON u.id = sl.created_by WHERE sl.id = $1`,
          [id],
        )
      ).rows[0];
      if (!sl) return null;
      const counts = (
        await db.query(`SELECT status, count(*)::int AS n FROM showlist_sends WHERE showlist_id = $1 GROUP BY status`, [id])
      ).rows;
      const sends = (
        await db.query(
          `SELECT id, feedlot_id, feedlot_name, recipient, status, left(status_detail, 300) AS status_detail,
                  submitted_at, delivered_at, failed_at, unsubscribed_at
           FROM showlist_sends WHERE showlist_id = $1 ORDER BY id LIMIT 2000`,
          [id],
        )
      ).rows;
      return { showlist: sl, counts, sends };
    },

    // A delivery report from SMTP2GO. Only a row that matches the ref number, the recipient AND is still
    // waiting for a result is touched (the SMTP2GO account is shared with other businesses).
    // kind: 'delivered' | 'failed' | 'spam'
    async applyEvent({ ref, rcpt, kind, detail }) {
      if (!Number.isInteger(ref) || ref <= 0 || !rcpt) return { updated: 0 };
      const note = String(detail || '').slice(0, 2000);
      const sql =
        kind === 'delivered'
          ? `UPDATE showlist_sends SET status = 'DELIVERED', delivered_at = now(), status_detail = $3
             WHERE id = $1 AND lower(btrim(recipient)) = lower(btrim($2)) AND status = 'SUBMITTED' RETURNING id, feedlot_id`
          : `UPDATE showlist_sends SET status = 'FAILED', failed_at = now(), status_detail = $3
             WHERE id = $1 AND lower(btrim(recipient)) = lower(btrim($2)) AND status IN ('SUBMITTED', 'DELIVERED') RETURNING id, feedlot_id`;
      const r = await db.query(sql, [ref, String(rcpt), note]);
      if (r.rowCount === 0) return { updated: 0 };
      if (kind === 'spam') {
        await db.query(
          `UPDATE feedlots SET do_not_email = true, do_not_email_at = now(), do_not_email_note = 'Marked a showlist email as spam', updated_at = now()
           WHERE id = $1 AND NOT do_not_email`,
          [r.rows[0].feedlot_id],
        );
      }
      return { updated: r.rowCount };
    },

    async findByToken(token) {
      const r = await db.query(
        `SELECT s.id, s.feedlot_id, s.feedlot_name, s.recipient, f.id IS NOT NULL AS feedlot_exists, COALESCE(f.do_not_email, true) AS off
         FROM showlist_sends s LEFT JOIN feedlots f ON f.id = s.feedlot_id WHERE s.token = $1`,
        [token],
      );
      return r.rows[0] || null;
    },

    // Turns this feedlot's emails off. Safe to repeat.
    async unsubscribe(token) {
      return db.transaction(async (c) => {
        const row = (
          await c.query(`SELECT id, feedlot_id, feedlot_name, recipient FROM showlist_sends WHERE token = $1 FOR UPDATE`, [token])
        ).rows[0];
        if (!row) return null;
        await c.query(`UPDATE showlist_sends SET unsubscribed_at = COALESCE(unsubscribed_at, now()) WHERE id = $1`, [row.id]);
        await c.query(
          `UPDATE feedlots SET do_not_email = true, do_not_email_at = now(),
                  do_not_email_note = $2, updated_at = now()
           WHERE id = $1 AND NOT do_not_email`,
          [row.feedlot_id, `Unsubscribed from showlist email (${row.recipient})`],
        );
        return { feedlotName: row.feedlot_name };
      });
    },
  };
}

module.exports = { createShowlistsRepo, lotFromRow, newToken };
