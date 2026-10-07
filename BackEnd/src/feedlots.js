'use strict';

// Portal field name -> column.
const COLUMNS = {
  name: 'name',
  contactName: 'contact_name',
  address: 'address',
  city: 'city',
  state: 'state',
  zip: 'zip',
  phone: 'phone',
  emails: 'emails',
  fax: 'fax',
  website: 'website',
  notes: 'notes',
  enabled: 'enabled',
  doNotEmail: 'do_not_email',
  doNotEmailNote: 'do_not_email_note',
};

const SELECT = `id, name, contact_name, address, city, state, zip, phone, emails, fax, website, notes,
  enabled, do_not_email, do_not_email_at, do_not_email_note, created_at, updated_at`;

function likePattern(q) {
  return '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
}

// What a value looks like in the change log.
function show(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return v.length ? v.join(', ') : null;
  return String(v);
}

function sameValue(a, b) {
  return show(a) === show(b);
}

const isDuplicate = (err) => err && err.code === '23505';

// All SQL for feedlots, in RAA's own database. `db` has query() and transaction().
function createFeedlotsRepo(db) {
  return {
    // staff: also see retired feedlots and the do-not-email filter.
    // withContact: the search also looks at contact names (signed-in visitors).
    async list({ q, state, hasEmail, enabled, doNotEmail, staff, withContact, page, pageSize }) {
      const where = [];
      const params = [];
      if (!staff) where.push('enabled = true');
      else if (enabled === '1') where.push('enabled = true');
      else if (enabled === '0') where.push('enabled = false');
      if (q) {
        params.push(likePattern(q));
        const n = `$${params.length}`;
        where.push(`(name ILIKE ${n} OR city ILIKE ${n}${withContact ? ` OR contact_name ILIKE ${n}` : ''})`);
      }
      if (state) {
        params.push(state);
        where.push(`state = $${params.length}`);
      }
      if (hasEmail === '1') where.push('cardinality(emails) > 0');
      else if (hasEmail === '0') where.push('cardinality(emails) = 0');
      if (staff && doNotEmail === '1') where.push('do_not_email = true');
      else if (staff && doNotEmail === '0') where.push('do_not_email = false');
      const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const total = Number((await db.query(`SELECT count(*) AS n FROM feedlots ${clause}`, params)).rows[0].n);
      const rows = (
        await db.query(
          `SELECT ${SELECT} FROM feedlots ${clause}
           ORDER BY lower(name), id
           LIMIT ${Number(pageSize)} OFFSET ${Number((page - 1) * pageSize)}`,
          params,
        )
      ).rows;
      return { total, rows };
    },

    async states(staff) {
      const r = await db.query(
        `SELECT state::text AS state, count(*)::int AS n FROM feedlots ${staff ? '' : 'WHERE enabled = true'} GROUP BY 1 ORDER BY 1`,
      );
      return r.rows;
    },

    async stats() {
      const r = await db.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE enabled)::int AS enabled,
                count(*) FILTER (WHERE cardinality(emails) > 0)::int AS with_email,
                count(*) FILTER (WHERE cardinality(emails) > 0 AND enabled AND NOT do_not_email)::int AS can_email,
                count(*) FILTER (WHERE do_not_email)::int AS do_not_email,
                count(*) FILTER (WHERE fax IS NOT NULL)::int AS with_fax
         FROM feedlots`,
      );
      return r.rows[0];
    },

    async get(id) {
      const r = await db.query(`SELECT ${SELECT} FROM feedlots WHERE id = $1`, [id]);
      return r.rows[0] || null;
    },

    // values: tidied portal fields. Returns { status: 'ok', id } | { status: 'duplicate' }.
    async create(values, userId) {
      const cols = [];
      const params = [];
      for (const [k, v] of Object.entries(values)) {
        if (!(k in COLUMNS)) continue;
        cols.push(COLUMNS[k]);
        params.push(v);
      }
      if (values.doNotEmail === true) {
        cols.push('do_not_email_at');
        params.push(new Date());
      }
      cols.push('created_by', 'updated_by');
      params.push(userId, userId);
      try {
        return await db.transaction(async (c) => {
          const r = await c.query(
            `INSERT INTO feedlots (${cols.join(', ')}) VALUES (${params.map((_, i) => '$' + (i + 1)).join(', ')}) RETURNING id`,
            params,
          );
          const id = r.rows[0].id;
          await c.query(`INSERT INTO feedlot_log (feedlot_id, field, old_value, new_value, changed_by) VALUES ($1, 'created', NULL, $2, $3)`, [
            id,
            values.name,
            userId,
          ]);
          return { status: 'ok', id: Number(id) };
        });
      } catch (err) {
        if (isDuplicate(err)) return { status: 'duplicate' };
        throw err;
      }
    },

    // changes: tidied portal fields (only the ones to change).
    // Returns { status: 'ok', changed: [{ field, oldValue, newValue }] } | 'not_found' | 'duplicate'.
    async update(id, changes, userId) {
      try {
        return await db.transaction(async (c) => {
          const cur = (await c.query(`SELECT ${SELECT} FROM feedlots WHERE id = $1 FOR UPDATE`, [id])).rows[0];
          if (!cur) return { status: 'not_found' };
          const changed = [];
          const sets = [];
          const params = [id];
          for (const [k, v] of Object.entries(changes)) {
            if (!(k in COLUMNS)) continue;
            const col = COLUMNS[k];
            if (sameValue(cur[col], v)) continue;
            changed.push({ field: k, oldValue: show(cur[col]), newValue: show(v) });
            params.push(v);
            sets.push(`${col} = $${params.length}`);
          }
          if (changed.length === 0) return { status: 'ok', changed: [] };
          if ('doNotEmail' in changes && changes.doNotEmail !== cur.do_not_email) {
            if (changes.doNotEmail) {
              sets.push('do_not_email_at = now()');
            } else {
              sets.push('do_not_email_at = NULL');
              if (!changed.some((x) => x.field === 'doNotEmailNote')) sets.push('do_not_email_note = NULL');
            }
          }
          params.push(userId);
          sets.push(`updated_by = $${params.length}`, 'updated_at = now()');
          await c.query(`UPDATE feedlots SET ${sets.join(', ')} WHERE id = $1`, params);
          for (const x of changed) {
            await c.query(`INSERT INTO feedlot_log (feedlot_id, field, old_value, new_value, changed_by) VALUES ($1, $2, $3, $4, $5)`, [
              id,
              x.field,
              x.oldValue,
              x.newValue,
              userId,
            ]);
          }
          return { status: 'ok', changed };
        });
      } catch (err) {
        if (isDuplicate(err)) return { status: 'duplicate' };
        throw err;
      }
    },

    async remove(id, userId) {
      return db.transaction(async (c) => {
        const cur = (await c.query('SELECT name, city, state FROM feedlots WHERE id = $1 FOR UPDATE', [id])).rows[0];
        if (!cur) return { status: 'not_found' };
        await c.query('DELETE FROM feedlots WHERE id = $1', [id]);
        await c.query(`INSERT INTO feedlot_log (feedlot_id, field, old_value, new_value, changed_by) VALUES ($1, 'deleted', $2, NULL, $3)`, [
          id,
          [cur.name, cur.city, cur.state].filter(Boolean).join(', '),
          userId,
        ]);
        return { status: 'ok' };
      });
    },

    async log(id) {
      const r = await db.query(
        `SELECT l.id, l.field, l.old_value, l.new_value, l.changed_at, u.display_name AS changed_by
         FROM feedlot_log l JOIN users u ON u.id = l.changed_by
         WHERE l.feedlot_id = $1 ORDER BY l.changed_at DESC, l.id DESC LIMIT 50`,
        [id],
      );
      return r.rows;
    },

    // The one-time import. rows: tidied portal fields. A yard that is already there (same name, city
    // and state) is skipped. dryRun runs everything and then rolls it back, so counts are real.
    async bulkInsert(rows, userId, { dryRun = false } = {}) {
      const DRY = new Error('dry run');
      let result = { inserted: 0, skipped: 0 };
      try {
        await db.transaction(async (c) => {
          for (const values of rows) {
            const cols = [];
            const params = [];
            for (const [k, v] of Object.entries(values)) {
              if (!(k in COLUMNS)) continue;
              cols.push(COLUMNS[k]);
              params.push(v);
            }
            cols.push('created_by', 'updated_by');
            params.push(userId, userId);
            const r = await c.query(
              `INSERT INTO feedlots (${cols.join(', ')}) VALUES (${params.map((_, i) => '$' + (i + 1)).join(', ')})
               ON CONFLICT DO NOTHING RETURNING id`,
              params,
            );
            if (r.rows.length === 0) {
              result.skipped += 1;
              continue;
            }
            result.inserted += 1;
            await c.query(`INSERT INTO feedlot_log (feedlot_id, field, old_value, new_value, changed_by) VALUES ($1, 'created', NULL, $2, $3)`, [
              r.rows[0].id,
              `${values.name} (imported)`,
              userId,
            ]);
          }
          if (dryRun) throw DRY;
        });
      } catch (err) {
        if (err !== DRY) throw err;
      }
      return result;
    },
  };
}

module.exports = { createFeedlotsRepo, COLUMNS };
