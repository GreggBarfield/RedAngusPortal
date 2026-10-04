'use strict';

// Fields RAA staff may change. Each one is also written to BTN.
const CONTACT_FIELDS = {
  email: 'auc_email',
  phone: 'auc_phone',
  fax: 'auc_fax',
  contactName: 'contact_name',
};

const LIST_COLUMNS = `auction_no, auc_name, auc_addr, auc_city, auc_state, auc_zip,
  auc_email, auc_phone, auc_fax, contact_name, preferred_method, is_active, category`;

function likePattern(q) {
  return '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
}

function same(a, b) {
  return (a == null ? null : String(a)) === (b == null ? null : String(b));
}

// All SQL for barns. `btn` is BTN's catalog database (read, and a separate
// write login), `db` is RAA's own database.
function createBarnsRepo({ db, btn }) {
  return {
    available: () => btn.canRead(),
    canWrite: () => btn.canWrite(),

    async list({ q, state, category, activeOnly, page, pageSize }) {
      const where = [];
      const params = [];
      if (q) {
        params.push(likePattern(q));
        where.push(`(auc_name ILIKE $${params.length} OR auc_city ILIKE $${params.length})`);
      }
      if (state) {
        params.push(state);
        where.push(`upper(auc_state) = $${params.length}`);
      }
      if (category) {
        params.push(category);
        where.push(`category::text = $${params.length}`);
      }
      if (activeOnly) where.push('is_active = true');
      const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const total = Number((await btn.read.query(`SELECT count(*) AS n FROM public.auction_barns ${clause}`, params)).rows[0].n);
      const rows = (
        await btn.read.query(
          `SELECT ${LIST_COLUMNS} FROM public.auction_barns ${clause}
           ORDER BY auc_state NULLS LAST, auc_name, auction_no
           LIMIT ${Number(pageSize)} OFFSET ${Number((page - 1) * pageSize)}`,
          params,
        )
      ).rows;
      return { total, rows };
    },

    async states() {
      const r = await btn.read.query(
        `SELECT upper(auc_state) AS state, count(*)::int AS n FROM public.auction_barns
         WHERE auc_state IS NOT NULL AND auc_state <> '' GROUP BY 1 ORDER BY 1`,
      );
      return r.rows;
    },

    async get(auctionNo) {
      const r = await btn.read.query(`SELECT ${LIST_COLUMNS} FROM public.auction_barns WHERE auction_no = $1`, [auctionNo]);
      return r.rows[0] || null;
    },

    async settingsFor(ids) {
      const map = new Map();
      if (ids.length === 0) return map;
      const r = await db.query(
        'SELECT auction_no, send_method, enabled, notes FROM barn_settings WHERE auction_no = ANY($1::int[])',
        [ids],
      );
      for (const row of r.rows) map.set(row.auction_no, row);
      return map;
    },

    async saveSettings(auctionNo, { sendMethod, enabled, notes }, userId) {
      const r = await db.query(
        `INSERT INTO barn_settings (auction_no, send_method, enabled, notes, updated_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (auction_no) DO UPDATE
           SET send_method = EXCLUDED.send_method, enabled = EXCLUDED.enabled,
               notes = EXCLUDED.notes, updated_at = now(), updated_by = EXCLUDED.updated_by
         RETURNING auction_no, send_method, enabled, notes`,
        [auctionNo, sendMethod, enabled, notes, userId],
      );
      return r.rows[0];
    },

    async log(auctionNo) {
      const r = await db.query(
        `SELECT l.id, l.field, l.old_value, l.new_value, l.overwrote, l.changed_at, u.display_name AS changed_by
         FROM barn_contact_log l JOIN users u ON u.id = l.changed_by
         WHERE l.auction_no = $1 ORDER BY l.changed_at DESC, l.id DESC LIMIT 50`,
        [auctionNo],
      );
      return r.rows;
    },

    // changes: { email?, phone?, fax?, contactName? } (null clears a value)
    // expected: what the editor showed when it was opened.
    // Returns { status: 'ok', changed } | { status: 'conflict', current, conflicts }
    //       | { status: 'not_found' }.
    async updateContact({ auctionNo, changes, expected, overwrite, userId }) {
      const client = await btn.write.connect();
      let changed = [];
      let overwrote = false;
      try {
        await client.query('BEGIN');
        const cur = (
          await client.query(
            'SELECT auction_no, auc_email, auc_phone, auc_fax, contact_name FROM public.auction_barns WHERE auction_no = $1 FOR UPDATE',
            [auctionNo],
          )
        ).rows[0];
        if (!cur) {
          await client.query('ROLLBACK');
          return { status: 'not_found' };
        }
        const current = {};
        for (const [k, col] of Object.entries(CONTACT_FIELDS)) current[k] = cur[col];

        const keys = Object.keys(changes).filter((k) => k in CONTACT_FIELDS);
        const conflicts = keys.filter(
          (k) => expected && k in expected && !same(expected[k], current[k]) && !same(changes[k], current[k]),
        );
        if (conflicts.length > 0 && !overwrite) {
          await client.query('ROLLBACK');
          return { status: 'conflict', current, conflicts };
        }
        overwrote = conflicts.length > 0;

        const real = keys.filter((k) => !same(changes[k], current[k]));
        if (real.length === 0) {
          await client.query('ROLLBACK');
          return { status: 'ok', changed: [] };
        }
        const sets = real.map((k, i) => `${CONTACT_FIELDS[k]} = $${i + 2}`);
        await client.query(`UPDATE public.auction_barns SET ${sets.join(', ')} WHERE auction_no = $1`, [
          auctionNo,
          ...real.map((k) => changes[k]),
        ]);
        await client.query('COMMIT');
        changed = real.map((k) => ({ field: k, oldValue: current[k], newValue: changes[k], overwrote: conflicts.includes(k) }));
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch (e) {
          /* connection may be gone */
        }
        throw err;
      } finally {
        client.release();
      }

      // BTN is updated. Record it here. If this fails the change is still in
      // BTN, so say so in the server log with every value needed to fix it.
      let logged = true;
      try {
        for (const c of changed) {
          await db.query(
            `INSERT INTO barn_contact_log (auction_no, field, old_value, new_value, overwrote, changed_by)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [auctionNo, c.field, c.oldValue, c.newValue, c.overwrote, userId],
          );
        }
      } catch (err) {
        logged = false;
        console.error('barn change saved to BTN but not logged:', JSON.stringify({ auctionNo, userId, changed }), err.message);
      }
      return { status: 'ok', changed, logged, overwrote };
    },
  };
}

module.exports = { createBarnsRepo, CONTACT_FIELDS };
