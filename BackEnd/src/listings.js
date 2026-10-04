'use strict';

const COLUMNS = `l.id, l.owner_id, l.kind, l.name, l.reg_number, l.tag, l.birth_date::text AS birth_date,
  l.sire_name, l.sire_reg, l.dam_name, l.dam_reg, l.birth_weight, l.weaning_weight, l.yearling_weight,
  l.scrotal::float8 AS scrotal, l.bred_to, l.due_date::text AS due_date, l.head_count, l.city, l.state, l.zip,
  l.asking_price::float8 AS asking_price, l.call_for_price, l.description, l.contact_name, l.contact_phone,
  l.contact_email, l.status, l.review_note, l.reviewed_at, l.approved_at, l.created_at, l.updated_at,
  u.display_name AS owner_name`;

const FROM = 'FROM listings l JOIN users u ON u.id = l.owner_id';

// Columns an owner may set (the same list is used for insert and update).
const FIELDS = [
  ['kind', 'kind'],
  ['name', 'name'],
  ['regNumber', 'reg_number'],
  ['tag', 'tag'],
  ['birthDate', 'birth_date'],
  ['sireName', 'sire_name'],
  ['sireReg', 'sire_reg'],
  ['damName', 'dam_name'],
  ['damReg', 'dam_reg'],
  ['birthWeight', 'birth_weight'],
  ['weaningWeight', 'weaning_weight'],
  ['yearlingWeight', 'yearling_weight'],
  ['scrotal', 'scrotal'],
  ['bredTo', 'bred_to'],
  ['dueDate', 'due_date'],
  ['headCount', 'head_count'],
  ['city', 'city'],
  ['state', 'state'],
  ['zip', 'zip'],
  ['askingPrice', 'asking_price'],
  ['callForPrice', 'call_for_price'],
  ['description', 'description'],
  ['contactName', 'contact_name'],
  ['contactPhone', 'contact_phone'],
  ['contactEmail', 'contact_email'],
];

function likePattern(q) {
  return '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
}

function createListingsRepo(db) {
  return {
    async create(ownerId, v) {
      const cols = FIELDS.map((f) => f[1]);
      const params = [ownerId, ...FIELDS.map((f) => v[f[0]])];
      const marks = params.map((_, i) => '$' + (i + 1));
      const r = await db.query(
        `INSERT INTO listings (owner_id, ${cols.join(', ')}) VALUES (${marks.join(', ')}) RETURNING id`,
        params,
      );
      return this.get(r.rows[0].id);
    },

    // An edit always sends the listing back to staff for approval.
    async update(id, v) {
      const sets = FIELDS.map((f, i) => `${f[1]} = $${i + 2}`);
      await db.query(
        `UPDATE listings SET ${sets.join(', ')}, status = 'pending', review_note = NULL,
           reviewed_by = NULL, reviewed_at = NULL, approved_at = NULL, updated_at = now()
         WHERE id = $1`,
        [id, ...FIELDS.map((f) => v[f[0]])],
      );
      return this.get(id);
    },

    async get(id) {
      const r = await db.query(`SELECT ${COLUMNS} ${FROM} WHERE l.id = $1`, [id]);
      return r.rows[0] || null;
    },

    async list({ q, kind, state, page, pageSize }) {
      const where = ["l.status = 'approved'"];
      const params = [];
      if (q) {
        params.push(likePattern(q));
        const n = '$' + params.length;
        where.push(
          `(l.name ILIKE ${n} OR l.reg_number ILIKE ${n} OR l.sire_name ILIKE ${n} OR l.dam_name ILIKE ${n} OR l.city ILIKE ${n} OR l.description ILIKE ${n})`,
        );
      }
      if (kind) {
        params.push(kind);
        where.push('l.kind = $' + params.length);
      }
      if (state) {
        params.push(state);
        where.push('l.state = $' + params.length);
      }
      const clause = 'WHERE ' + where.join(' AND ');
      const total = Number((await db.query(`SELECT count(*) AS n FROM listings l ${clause}`, params)).rows[0].n);
      const rows = (
        await db.query(
          `SELECT ${COLUMNS} ${FROM} ${clause}
           ORDER BY l.approved_at DESC, l.id DESC
           LIMIT ${Number(pageSize)} OFFSET ${Number((page - 1) * pageSize)}`,
          params,
        )
      ).rows;
      return { total, rows };
    },

    async mine(ownerId) {
      const r = await db.query(`SELECT ${COLUMNS} ${FROM} WHERE l.owner_id = $1 ORDER BY l.created_at DESC, l.id DESC`, [ownerId]);
      return r.rows;
    },

    async queue(status) {
      const r = await db.query(`SELECT ${COLUMNS} ${FROM} WHERE l.status = $1 ORDER BY l.created_at, l.id LIMIT 200`, [status]);
      return r.rows;
    },

    // Staff decision. Only a pending listing can be approved or rejected;
    // staff can also pull an approved listing back ('rejected' with a note).
    async review(id, { decision, note, reviewerId }) {
      const status = decision === 'approve' ? 'approved' : 'rejected';
      const from = decision === 'approve' ? ['pending'] : ['pending', 'approved'];
      const r = await db.query(
        `UPDATE listings SET status = $2, review_note = $3, reviewed_by = $4, reviewed_at = now(),
           approved_at = CASE WHEN $2 = 'approved' THEN now() ELSE NULL END, updated_at = now()
         WHERE id = $1 AND status = ANY($5::text[]) RETURNING id`,
        [id, status, note, reviewerId, from],
      );
      return r.rowCount === 1;
    },

    // Owner marks an approved listing sold or withdrawn.
    async close(id, status) {
      const r = await db.query(
        `UPDATE listings SET status = $2, updated_at = now() WHERE id = $1 AND status IN ('approved', 'pending', 'rejected') RETURNING id`,
        [id, status],
      );
      return r.rowCount === 1;
    },

    async pendingCount() {
      return Number((await db.query("SELECT count(*) AS n FROM listings WHERE status = 'pending'")).rows[0].n);
    },
  };
}

module.exports = { createListingsRepo, FIELDS };
