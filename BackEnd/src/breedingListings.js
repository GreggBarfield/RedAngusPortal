'use strict';
const { likePattern, params: makeParams, distanceSql } = require('./common');

const COLUMNS = `l.id, l.owner_id, l.head_count, l.sex_class, l.birth_date::text AS birth_date, l.reg_number,
  l.breed_class, l.primary_breed, l.sire, l.dam, l.headline, l.description, l.sale_title, l.sale_type,
  l.auction_no, l.auction_name, l.sale_date::text AS sale_date, l.city, l.state, l.zip,
  l.lat::float8 AS lat, l.lon::float8 AS lon, l.asking_price::float8 AS asking_price, l.call_for_price,
  l.contact_name, l.contact_phone, l.contact_email, l.status, l.review_note, l.reviewed_at, l.approved_at,
  l.created_at, l.updated_at, u.display_name AS owner_name`;

const FROM = 'FROM breeding_listings l JOIN users u ON u.id = l.owner_id';

// Columns an owner may set (the same list is used for insert and update).
const FIELDS = [
  ['headCount', 'head_count'],
  ['sexClass', 'sex_class'],
  ['birthDate', 'birth_date'],
  ['regNumber', 'reg_number'],
  ['breedClass', 'breed_class'],
  ['primaryBreed', 'primary_breed'],
  ['sire', 'sire'],
  ['dam', 'dam'],
  ['headline', 'headline'],
  ['description', 'description'],
  ['saleTitle', 'sale_title'],
  ['saleType', 'sale_type'],
  ['auctionNo', 'auction_no'],
  ['auctionName', 'auction_name'],
  ['saleDate', 'sale_date'],
  ['city', 'city'],
  ['state', 'state'],
  ['zip', 'zip'],
  ['lat', 'lat'],
  ['lon', 'lon'],
  ['askingPrice', 'asking_price'],
  ['callForPrice', 'call_for_price'],
  ['contactName', 'contact_name'],
  ['contactPhone', 'contact_phone'],
  ['contactEmail', 'contact_email'],
];

const SORTS = {
  saleDate: 'l.sale_date',
  headCount: 'l.head_count',
  newest: 'l.approved_at',
};

async function writeChildren(c, id, v) {
  if (v.breeds.length > 0) {
    await c.query(
      `INSERT INTO breeding_listing_breeds (listing_id, breed_name, sort_order)
       SELECT $1::bigint, t.name, t.ord - 1 FROM unnest($2::text[]) WITH ORDINALITY AS t(name, ord)`,
      [id, v.breeds],
    );
  }
  if (v.epds.length > 0) {
    await c.query(
      `INSERT INTO breeding_listing_epds (listing_id, trait_code, value, unknown, sort_order)
       SELECT $1::bigint, t.code, t.val, t.val IS NULL, t.ord - 1
       FROM unnest($2::text[], $3::numeric[]) WITH ORDINALITY AS t(code, val, ord)`,
      [id, v.epds.map((e) => e.trait), v.epds.map((e) => e.value)],
    );
  }
}

// Adds breeds and EPD rows to each row.
async function attach(db, rows) {
  if (rows.length === 0) return rows;
  const ids = rows.map((r) => r.id);
  const b = await db.query('SELECT listing_id, breed_name FROM breeding_listing_breeds WHERE listing_id = ANY($1::bigint[]) ORDER BY sort_order, id', [ids]);
  const e = await db.query('SELECT listing_id, trait_code, value::float8 AS value, unknown FROM breeding_listing_epds WHERE listing_id = ANY($1::bigint[]) ORDER BY sort_order, id', [ids]);
  const group = (res, fn) => {
    const m = new Map();
    for (const r of res.rows) {
      const k = String(r.listing_id);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(fn(r));
    }
    return m;
  };
  const breeds = group(b, (r) => r.breed_name);
  const epds = group(e, (r) => ({ trait: r.trait_code, value: r.value, unknown: r.unknown }));
  for (const row of rows) {
    const k = String(row.id);
    row.breeds = breeds.get(k) || [];
    row.epds = epds.get(k) || [];
  }
  return rows;
}

function createBreedingListingsRepo(db) {
  return {
    async create(ownerId, v) {
      const id = await db.transaction(async (c) => {
        const cols = FIELDS.map((f) => f[1]);
        const args = [ownerId, ...FIELDS.map((f) => v[f[0]])];
        const marks = args.map((_, i) => '$' + (i + 1));
        const r = await c.query(`INSERT INTO breeding_listings (owner_id, ${cols.join(', ')}) VALUES (${marks.join(', ')}) RETURNING id`, args);
        await writeChildren(c, r.rows[0].id, v);
        return r.rows[0].id;
      });
      return this.get(id);
    },

    // An edit always sends the listing back to staff for approval.
    async update(id, v) {
      await db.transaction(async (c) => {
        const sets = FIELDS.map((f, i) => `${f[1]} = $${i + 2}`);
        await c.query(
          `UPDATE breeding_listings SET ${sets.join(', ')}, status = 'pending', review_note = NULL,
             reviewed_by = NULL, reviewed_at = NULL, approved_at = NULL, updated_at = now()
           WHERE id = $1`,
          [id, ...FIELDS.map((f) => v[f[0]])],
        );
        await c.query('DELETE FROM breeding_listing_breeds WHERE listing_id = $1', [id]);
        await c.query('DELETE FROM breeding_listing_epds WHERE listing_id = $1', [id]);
        await writeChildren(c, id, v);
      });
      return this.get(id);
    },

    async get(id) {
      const r = await db.query(`SELECT ${COLUMNS} ${FROM} WHERE l.id = $1`, [id]);
      if (r.rows.length === 0) return null;
      await attach(db, r.rows);
      return r.rows[0];
    },

    async list(o) {
      const p = makeParams();
      const where = ["l.status = 'approved'"];
      if (o.q) {
        const n = p.add(likePattern(o.q));
        where.push(
          `(l.headline ILIKE ${n} OR l.reg_number ILIKE ${n} OR l.sire ILIKE ${n} OR l.dam ILIKE ${n}
            OR l.sale_title ILIKE ${n} OR l.city ILIKE ${n} OR l.auction_name ILIKE ${n} OR l.description ILIKE ${n}
            OR EXISTS (SELECT 1 FROM breeding_listing_breeds b WHERE b.listing_id = l.id AND b.breed_name ILIKE ${n}))`,
        );
      }
      if (o.state) where.push(`l.state = ${p.add(o.state)}`);
      if (o.breeds && o.breeds.length) {
        where.push(
          `EXISTS (SELECT 1 FROM breeding_listing_breeds b WHERE b.listing_id = l.id AND lower(b.breed_name) = ANY(${p.add(o.breeds.map((x) => x.toLowerCase()))}::text[]))`,
        );
      }
      if (o.classes && o.classes.length) where.push(`l.sex_class = ANY(${p.add(o.classes)}::text[])`);
      if (o.dateFrom) where.push(`l.sale_date >= ${p.add(o.dateFrom)}::date`);
      if (o.dateTo) where.push(`l.sale_date <= ${p.add(o.dateTo)}::date`);
      // One EXISTS per EPD filter: the trait must be known and inside the range.
      for (const f of o.epds || []) {
        const parts = [`e.listing_id = l.id`, `upper(e.trait_code) = ${p.add(f.code.toUpperCase())}`, 'NOT e.unknown'];
        if (f.min != null) parts.push(`e.value >= ${p.add(f.min)}`);
        if (f.max != null) parts.push(`e.value <= ${p.add(f.max)}`);
        where.push(`EXISTS (SELECT 1 FROM breeding_listing_epds e WHERE ${parts.join(' AND ')})`);
      }
      let distance = '';
      if (o.center) {
        const lat = p.add(o.center.lat);
        const lon = p.add(o.center.lon);
        const d = distanceSql('l', lat, lon);
        where.push(`(l.lat IS NOT NULL AND ${d} <= ${p.add(o.center.miles)})`);
        distance = `, ${d} AS distance_miles`;
      }
      const clause = 'WHERE ' + where.join(' AND ');
      const total = Number((await db.query(`SELECT count(*) AS n FROM breeding_listings l ${clause}`, p.list)).rows[0].n);

      const dir = o.dir === 'asc' ? 'ASC' : 'DESC';
      let order = SORTS[o.sort] || SORTS.newest;
      if (o.sort === 'distance' && o.center) order = 'distance_miles';
      const rows = (
        await db.query(
          `SELECT ${COLUMNS}${distance} ${FROM} ${clause}
           ORDER BY ${order} ${dir} NULLS LAST, l.id DESC
           LIMIT ${Number(o.pageSize)} OFFSET ${Number((o.page - 1) * o.pageSize)}`,
          p.list,
        )
      ).rows;
      await attach(db, rows);
      return { total, rows };
    },

    async mine(ownerId) {
      const r = await db.query(`SELECT ${COLUMNS} ${FROM} WHERE l.owner_id = $1 ORDER BY l.created_at DESC, l.id DESC`, [ownerId]);
      return attach(db, r.rows);
    },

    async queue(status) {
      const r = await db.query(`SELECT ${COLUMNS} ${FROM} WHERE l.status = $1 ORDER BY l.created_at, l.id LIMIT 200`, [status]);
      return attach(db, r.rows);
    },

    async review(id, { decision, note, reviewerId }) {
      const status = decision === 'approve' ? 'approved' : 'rejected';
      const from = decision === 'approve' ? ['pending'] : ['pending', 'approved'];
      const r = await db.query(
        `UPDATE breeding_listings SET status = $2, review_note = $3, reviewed_by = $4, reviewed_at = now(),
           approved_at = CASE WHEN $2 = 'approved' THEN now() ELSE NULL END, updated_at = now()
         WHERE id = $1 AND status = ANY($5::text[]) RETURNING id`,
        [id, status, note, reviewerId, from],
      );
      return r.rowCount === 1;
    },

    async close(id, status) {
      const r = await db.query(
        `UPDATE breeding_listings SET status = $2, updated_at = now() WHERE id = $1 AND status IN ('approved', 'pending', 'rejected') RETURNING id`,
        [id, status],
      );
      return r.rowCount === 1;
    },

    async pendingCount() {
      return Number((await db.query("SELECT count(*) AS n FROM breeding_listings WHERE status = 'pending'")).rows[0].n);
    },

    async countByOwner(ownerId) {
      return Number((await db.query('SELECT count(*) AS n FROM breeding_listings WHERE owner_id = $1', [ownerId])).rows[0].n);
    },
  };
}

module.exports = { createBreedingListingsRepo, FIELDS };
