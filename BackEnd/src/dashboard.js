'use strict';

// All SQL for the staff dashboard. It only reads. `db` is the Red Angus database; `btn` is BlockTrust's
// catalog database (read only login) and is used for the sale barn counts only.

const WEEKS = 12;

function n(v) {
  return Number(v) || 0;
}

// How many of the active barns can be reached: by email, by fax only, or neither.
const BARN_SQL = `
  SELECT count(*)::int AS total,
         count(*) FILTER (WHERE is_active)::int AS active,
         count(*) FILTER (WHERE is_active AND nullif(btrim(auc_email), '') IS NOT NULL)::int AS active_email,
         count(*) FILTER (WHERE is_active AND nullif(btrim(auc_email), '') IS NULL AND nullif(btrim(auc_fax), '') IS NOT NULL)::int AS active_fax_only,
         count(*) FILTER (WHERE is_active AND nullif(btrim(auc_email), '') IS NULL AND nullif(btrim(auc_fax), '') IS NULL)::int AS active_neither,
         count(*) FILTER (WHERE nullif(btrim(auc_email), '') IS NOT NULL)::int AS with_email
  FROM public.auction_barns`;

function createDashboardRepo({ db, btn, log = console }) {
  return {
    async overview() {
      const [status, sex, states, weekly, attention, people, feedlots, showlists, sends] = await Promise.all([
        db.query(
          `SELECT 'feeder' AS kind, status, count(*)::int AS n, coalesce(sum(head_count), 0)::int AS head FROM feeder_listings GROUP BY status
           UNION ALL
           SELECT 'breeding', status, count(*)::int, coalesce(sum(head_count), 0)::int FROM breeding_listings GROUP BY status`,
        ),
        db.query(
          `SELECT coalesce(sum(steer_count), 0)::int AS steers, coalesce(sum(heifer_count), 0)::int AS heifers
           FROM feeder_listings WHERE status = 'approved'`,
        ),
        db.query(
          `SELECT state, count(*) FILTER (WHERE kind = 'feeder')::int AS feeder, count(*) FILTER (WHERE kind = 'breeding')::int AS breeding
           FROM (SELECT state, 'feeder' AS kind FROM feeder_listings WHERE status = 'approved'
                 UNION ALL
                 SELECT state, 'breeding' FROM breeding_listings WHERE status = 'approved') t
           GROUP BY state ORDER BY count(*) DESC, state LIMIT 10`,
        ),
        db.query(
          `SELECT to_char(w, 'YYYY-MM-DD') AS week,
                  (SELECT count(*)::int FROM feeder_listings f WHERE f.created_at >= w AND f.created_at < w + interval '7 days') AS feeder,
                  (SELECT count(*)::int FROM breeding_listings b WHERE b.created_at >= w AND b.created_at < w + interval '7 days') AS breeding
           FROM generate_series(date_trunc('week', now()) - interval '${WEEKS - 1} weeks', date_trunc('week', now()), interval '7 days') AS w
           ORDER BY w`,
        ),
        db.query(
          `SELECT
             (SELECT count(*) FROM feeder_listings WHERE status = 'pending' AND updated_at < now() - interval '2 days')::int
           + (SELECT count(*) FROM breeding_listings WHERE status = 'pending' AND updated_at < now() - interval '2 days')::int AS pending_old,
             (SELECT count(*) FROM feeder_listings f WHERE f.status = 'approved'
                AND NOT EXISTS (SELECT 1 FROM raa_listing_photos p WHERE p.feeder_listing_id = f.id))::int
           + (SELECT count(*) FROM breeding_listings b WHERE b.status = 'approved'
                AND NOT EXISTS (SELECT 1 FROM raa_listing_photos p WHERE p.breeding_listing_id = b.id))::int AS no_photos,
             (SELECT count(*) FROM feeder_listings WHERE status = 'approved' AND marketing_date < current_date)::int
           + (SELECT count(*) FROM breeding_listings WHERE status = 'approved' AND sale_date < current_date)::int AS past_date,
             (SELECT count(*) FROM feeder_listings WHERE status = 'approved' AND include_ai AND nullif(btrim(ai_description), '') IS NOT NULL)::int AS notes_on`,
        ),
        db.query(
          `SELECT (SELECT count(*) FROM users WHERE is_active AND role <> 'staff')::int AS members,
                  (SELECT count(*) FROM users WHERE is_active AND role <> 'staff' AND created_at >= now() - interval '7 days')::int AS new_week,
                  (SELECT count(DISTINCT owner_id) FROM (SELECT owner_id FROM feeder_listings WHERE status = 'approved'
                                                         UNION SELECT owner_id FROM breeding_listings WHERE status = 'approved') t)::int AS sellers`,
        ),
        db.query(
          `SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE enabled)::int AS enabled,
                  count(*) FILTER (WHERE cardinality(emails) > 0)::int AS with_email,
                  count(*) FILTER (WHERE cardinality(emails) > 0 AND enabled AND NOT do_not_email)::int AS can_email,
                  count(*) FILTER (WHERE do_not_email)::int AS do_not_email,
                  count(*) FILTER (WHERE enabled AND cardinality(emails) > 0)::int AS active_email,
                  count(*) FILTER (WHERE enabled AND cardinality(emails) = 0 AND nullif(btrim(fax), '') IS NOT NULL)::int AS active_fax_only,
                  count(*) FILTER (WHERE enabled AND cardinality(emails) = 0 AND nullif(btrim(fax), '') IS NULL)::int AS active_neither
           FROM feedlots`,
        ),
        db.query(`SELECT count(*)::int AS sent, max(created_at) AS last_at FROM showlists`),
        db.query(
          `SELECT count(*) FILTER (WHERE status IN ('SUBMITTED', 'DELIVERED', 'FAILED'))::int AS emails_sent,
                  count(*) FILTER (WHERE status = 'DELIVERED')::int AS delivered,
                  count(*) FILTER (WHERE status = 'SUBMITTED')::int AS submitted,
                  count(*) FILTER (WHERE status IN ('FAILED', 'SUBMIT_FAILED'))::int AS failed,
                  count(*) FILTER (WHERE unsubscribed_at IS NOT NULL)::int AS unsubscribed,
                  count(DISTINCT feedlot_id) FILTER (WHERE submitted_at IS NOT NULL)::int AS feedlots_reached
           FROM showlist_sends`,
        ),
      ]);

      // Listings by kind and status.
      const kinds = { feeder: {}, breeding: {} };
      for (const r of status.rows) kinds[r.kind][r.status] = { n: n(r.n), head: n(r.head) };
      const one = (kind, st) => (kinds[kind][st] ? kinds[kind][st].n : 0);
      const outcomes = { approved: 0, pending: 0, rejected: 0, sold: 0, withdrawn: 0 };
      for (const kind of ['feeder', 'breeding']) for (const st of Object.keys(outcomes)) outcomes[st] += one(kind, st);

      const a = attention.rows[0];
      const p = people.rows[0];
      const f = feedlots.rows[0];
      const sl = showlists.rows[0];
      const sd = sends.rows[0];

      return {
        generatedAt: new Date().toISOString(),
        listings: {
          feederLive: one('feeder', 'approved'),
          breedingLive: one('breeding', 'approved'),
          feederHead: kinds.feeder.approved ? kinds.feeder.approved.head : 0,
          breedingHead: kinds.breeding.approved ? kinds.breeding.approved.head : 0,
          pending: one('feeder', 'pending') + one('breeding', 'pending'),
          outcomes,
        },
        sex: { steers: n(sex.rows[0].steers), heifers: n(sex.rows[0].heifers) },
        states: states.rows.map((r) => ({ state: String(r.state).trim(), feeder: n(r.feeder), breeding: n(r.breeding) })),
        weekly: weekly.rows.map((r) => ({ week: r.week, feeder: n(r.feeder), breeding: n(r.breeding) })),
        attention: {
          pendingOverTwoDays: n(a.pending_old),
          noPhotos: n(a.no_photos),
          pastSaleDate: n(a.past_date),
          notesOn: n(a.notes_on),
        },
        people: { members: n(p.members), newThisWeek: n(p.new_week), sellers: n(p.sellers) },
        feedlots: {
          total: n(f.total),
          enabled: n(f.enabled),
          withEmail: n(f.with_email),
          canEmail: n(f.can_email),
          doNotEmail: n(f.do_not_email),
          reach: { email: n(f.active_email), faxOnly: n(f.active_fax_only), neither: n(f.active_neither) },
        },
        showlists: {
          sent: n(sl.sent),
          lastAt: sl.last_at ? new Date(sl.last_at).toISOString() : null,
          emailsSent: n(sd.emails_sent),
          delivered: n(sd.delivered),
          submitted: n(sd.submitted),
          failed: n(sd.failed),
          unsubscribed: n(sd.unsubscribed),
          feedlotsReached: n(sd.feedlots_reached),
        },
      };
    },

    // Sale barn numbers come from BlockTrust. If that database cannot be reached the rest of the
    // dashboard still works, so this returns null instead of failing.
    async barns() {
      if (!btn || !btn.canRead()) return null;
      try {
        const r = (await btn.read.query(BARN_SQL)).rows[0];
        return {
          total: n(r.total),
          active: n(r.active),
          withEmail: n(r.with_email),
          reach: { email: n(r.active_email), faxOnly: n(r.active_fax_only), neither: n(r.active_neither) },
        };
      } catch (err) {
        log.error('dashboard: sale barn numbers unavailable:', err.message);
        return null;
      }
    },
  };
}

module.exports = { createDashboardRepo };
