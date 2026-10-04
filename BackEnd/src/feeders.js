'use strict';

const COLUMNS = `f.id, f.owner_id, f.title, f.head_count, f.sex, f.avg_weight, f.weight_low, f.weight_high,
  f.breed, f.age_months, f.weaned, f.weaned_days, f.health_program, f.horn_status, f.bunk_broke, f.sired_by,
  f.sale_type, f.available_date::text AS available_date, f.city, f.state, f.zip, f.price_basis,
  f.asking_price::float8 AS asking_price, f.call_for_price, f.description, f.contact_name, f.contact_phone,
  f.contact_email, f.status, f.review_note, f.reviewed_at, f.approved_at, f.created_at, f.updated_at,
  u.display_name AS owner_name`;

const FROM = 'FROM feeder_lots f JOIN users u ON u.id = f.owner_id';

// Columns an owner may set (the same list is used for insert and update).
const FIELDS = [
  ['title', 'title'],
  ['headCount', 'head_count'],
  ['sex', 'sex'],
  ['avgWeight', 'avg_weight'],
  ['weightLow', 'weight_low'],
  ['weightHigh', 'weight_high'],
  ['breed', 'breed'],
  ['ageMonths', 'age_months'],
  ['weaned', 'weaned'],
  ['weanedDays', 'weaned_days'],
  ['healthProgram', 'health_program'],
  ['hornStatus', 'horn_status'],
  ['bunkBroke', 'bunk_broke'],
  ['siredBy', 'sired_by'],
  ['saleType', 'sale_type'],
  ['availableDate', 'available_date'],
  ['city', 'city'],
  ['state', 'state'],
  ['zip', 'zip'],
  ['priceBasis', 'price_basis'],
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

function createFeedersRepo(db) {
  return {
    async create(ownerId, v) {
      const cols = FIELDS.map((f) => f[1]);
      const params = [ownerId, ...FIELDS.map((f) => v[f[0]])];
      const marks = params.map((_, i) => '$' + (i + 1));
      const r = await db.query(
        `INSERT INTO feeder_lots (owner_id, ${cols.join(', ')}) VALUES (${marks.join(', ')}) RETURNING id`,
        params,
      );
      return this.get(r.rows[0].id);
    },

    // An edit always sends the lot back to staff for approval.
    async update(id, v) {
      const sets = FIELDS.map((f, i) => `${f[1]} = $${i + 2}`);
      await db.query(
        `UPDATE feeder_lots SET ${sets.join(', ')}, status = 'pending', review_note = NULL,
           reviewed_by = NULL, reviewed_at = NULL, approved_at = NULL, updated_at = now()
         WHERE id = $1`,
        [id, ...FIELDS.map((f) => v[f[0]])],
      );
      return this.get(id);
    },

    async get(id) {
      const r = await db.query(`SELECT ${COLUMNS} ${FROM} WHERE f.id = $1`, [id]);
      return r.rows[0] || null;
    },

    async list({ q, sex, state, minWeight, maxWeight, page, pageSize }) {
      const where = ["f.status = 'approved'"];
      const params = [];
      if (q) {
        params.push(likePattern(q));
        const n = '$' + params.length;
        where.push(
          `(f.title ILIKE ${n} OR f.breed ILIKE ${n} OR f.sired_by ILIKE ${n} OR f.city ILIKE ${n} OR f.description ILIKE ${n})`,
        );
      }
      if (sex) {
        params.push(sex);
        where.push('f.sex = $' + params.length);
      }
      if (state) {
        params.push(state);
        where.push('f.state = $' + params.length);
      }
      if (minWeight) {
        params.push(minWeight);
        where.push('f.avg_weight >= $' + params.length);
      }
      if (maxWeight) {
        params.push(maxWeight);
        where.push('f.avg_weight <= $' + params.length);
      }
      const clause = 'WHERE ' + where.join(' AND ');
      const total = Number((await db.query(`SELECT count(*) AS n FROM feeder_lots f ${clause}`, params)).rows[0].n);
      const rows = (
        await db.query(
          `SELECT ${COLUMNS} ${FROM} ${clause}
           ORDER BY f.approved_at DESC, f.id DESC
           LIMIT ${Number(pageSize)} OFFSET ${Number((page - 1) * pageSize)}`,
          params,
        )
      ).rows;
      return { total, rows };
    },

    async mine(ownerId) {
      const r = await db.query(`SELECT ${COLUMNS} ${FROM} WHERE f.owner_id = $1 ORDER BY f.created_at DESC, f.id DESC`, [ownerId]);
      return r.rows;
    },

    async queue(status) {
      const r = await db.query(`SELECT ${COLUMNS} ${FROM} WHERE f.status = $1 ORDER BY f.created_at, f.id LIMIT 200`, [status]);
      return r.rows;
    },

    // Only a pending lot can be approved; staff can reject a pending lot or pull back an approved one.
    async review(id, { decision, note, reviewerId }) {
      const status = decision === 'approve' ? 'approved' : 'rejected';
      const from = decision === 'approve' ? ['pending'] : ['pending', 'approved'];
      const r = await db.query(
        `UPDATE feeder_lots SET status = $2, review_note = $3, reviewed_by = $4, reviewed_at = now(),
           approved_at = CASE WHEN $2 = 'approved' THEN now() ELSE NULL END, updated_at = now()
         WHERE id = $1 AND status = ANY($5::text[]) RETURNING id`,
        [id, status, note, reviewerId, from],
      );
      return r.rowCount === 1;
    },

    async close(id, status) {
      const r = await db.query(
        `UPDATE feeder_lots SET status = $2, updated_at = now() WHERE id = $1 AND status IN ('approved', 'pending', 'rejected') RETURNING id`,
        [id, status],
      );
      return r.rowCount === 1;
    },

    async pendingCount() {
      return Number((await db.query("SELECT count(*) AS n FROM feeder_lots WHERE status = 'pending'")).rows[0].n);
    },
  };
}

module.exports = { createFeedersRepo, FIELDS };
