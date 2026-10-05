'use strict';
const { likePattern, params: makeParams, distanceSql } = require('./common');

const COLUMNS = `f.id, f.owner_id, f.group_id, f.group_id_optout, f.headline, f.steer_count, f.heifer_count,
  f.head_count, f.avg_weight_steers, f.avg_weight_heifers, f.avg_weight, f.birth_date::text AS birth_date,
  f.wean_date::text AS wean_date, f.vet_name, f.birth_country, f.description, f.nutrition, f.marketing_method,
  f.auction_no, f.auction_name, f.marketing_date::text AS marketing_date, f.tag_visual_start, f.tag_visual_end,
  f.tag_eid_start, f.tag_eid_end, f.city, f.state, f.zip, f.lat::float8 AS lat, f.lon::float8 AS lon,
  f.price_basis, f.asking_price::float8 AS asking_price, f.call_for_price, f.contact_name, f.contact_phone,
  f.contact_email, f.status, f.review_note, f.reviewed_at, f.approved_at, f.created_at, f.updated_at,
  u.display_name AS owner_name`;

const FROM = 'FROM feeder_listings f JOIN users u ON u.id = f.owner_id';

// Columns an owner may set (the same list is used for insert and update).
const FIELDS = [
  ['groupId', 'group_id'],
  ['groupIdOptout', 'group_id_optout'],
  ['headline', 'headline'],
  ['steerCount', 'steer_count'],
  ['heiferCount', 'heifer_count'],
  ['avgWeightSteers', 'avg_weight_steers'],
  ['avgWeightHeifers', 'avg_weight_heifers'],
  ['avgWeight', 'avg_weight'],
  ['birthDate', 'birth_date'],
  ['weanDate', 'wean_date'],
  ['vetName', 'vet_name'],
  ['birthCountry', 'birth_country'],
  ['description', 'description'],
  ['nutrition', 'nutrition'],
  ['marketingMethod', 'marketing_method'],
  ['auctionNo', 'auction_no'],
  ['auctionName', 'auction_name'],
  ['marketingDate', 'marketing_date'],
  ['tagVisualStart', 'tag_visual_start'],
  ['tagVisualEnd', 'tag_visual_end'],
  ['tagEidStart', 'tag_eid_start'],
  ['tagEidEnd', 'tag_eid_end'],
  ['city', 'city'],
  ['state', 'state'],
  ['zip', 'zip'],
  ['lat', 'lat'],
  ['lon', 'lon'],
  ['priceBasis', 'price_basis'],
  ['askingPrice', 'asking_price'],
  ['callForPrice', 'call_for_price'],
  ['contactName', 'contact_name'],
  ['contactPhone', 'contact_phone'],
  ['contactEmail', 'contact_email'],
];

const SORTS = {
  marketingDate: 'f.marketing_date',
  headCount: 'f.head_count',
  weight: 'f.avg_weight',
  newest: 'f.approved_at',
};

const AGE_MONTHS = `(date_part('year', age(current_date, f.birth_date)) * 12 + date_part('month', age(current_date, f.birth_date)))`;

async function writeChildren(c, id, v) {
  if (v.breeds.length > 0) {
    await c.query(
      `INSERT INTO feeder_listing_breeds (listing_id, breed_name, sort_order)
       SELECT $1::bigint, t.name, t.ord - 1 FROM unnest($2::text[]) WITH ORDINALITY AS t(name, ord)`,
      [id, v.breeds],
    );
  }
  const names = [...v.preconditioning, ...v.special];
  if (names.length > 0) {
    const types = [...v.preconditioning.map(() => 'PC'), ...v.special.map(() => 'SP')];
    await c.query(
      `INSERT INTO feeder_listing_programs (listing_id, program_name, program_type, sort_order)
       SELECT $1::bigint, t.name, t.type, t.ord - 1 FROM unnest($2::text[], $3::text[]) WITH ORDINALITY AS t(name, type, ord)`,
      [id, names, types],
    );
  }
  if (v.vaccinations.length > 0) {
    await c.query(
      `INSERT INTO feeder_listing_vaccinations (listing_id, vac_date, product, sort_order)
       SELECT $1::bigint, t.d, t.product, t.ord - 1 FROM unnest($2::date[], $3::text[]) WITH ORDINALITY AS t(d, product, ord)`,
      [id, v.vaccinations.map((x) => x.date), v.vaccinations.map((x) => x.product)],
    );
  }
}

// Adds breeds, programs and vaccinations to each row.
async function attach(db, rows) {
  if (rows.length === 0) return rows;
  const ids = rows.map((r) => r.id);
  const b = await db.query('SELECT listing_id, breed_name FROM feeder_listing_breeds WHERE listing_id = ANY($1::bigint[]) ORDER BY sort_order, id', [ids]);
  const p = await db.query('SELECT listing_id, program_name, program_type FROM feeder_listing_programs WHERE listing_id = ANY($1::bigint[]) ORDER BY sort_order, id', [ids]);
  const vc = await db.query('SELECT listing_id, vac_date::text AS vac_date, product FROM feeder_listing_vaccinations WHERE listing_id = ANY($1::bigint[]) ORDER BY sort_order, id', [ids]);
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
  const programs = group(p, (r) => ({ name: r.program_name, type: r.program_type }));
  const vacc = group(vc, (r) => ({ date: r.vac_date, product: r.product }));
  for (const row of rows) {
    const k = String(row.id);
    row.breeds = breeds.get(k) || [];
    row.programs = programs.get(k) || [];
    row.vaccinations = vacc.get(k) || [];
  }
  return rows;
}

function createFeederListingsRepo(db) {
  return {
    async create(ownerId, v) {
      const id = await db.transaction(async (c) => {
        const cols = FIELDS.map((f) => f[1]);
        const args = [ownerId, ...FIELDS.map((f) => v[f[0]])];
        const marks = args.map((_, i) => '$' + (i + 1));
        const r = await c.query(`INSERT INTO feeder_listings (owner_id, ${cols.join(', ')}) VALUES (${marks.join(', ')}) RETURNING id`, args);
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
          `UPDATE feeder_listings SET ${sets.join(', ')}, status = 'pending', review_note = NULL,
             reviewed_by = NULL, reviewed_at = NULL, approved_at = NULL, updated_at = now()
           WHERE id = $1`,
          [id, ...FIELDS.map((f) => v[f[0]])],
        );
        await c.query('DELETE FROM feeder_listing_breeds WHERE listing_id = $1', [id]);
        await c.query('DELETE FROM feeder_listing_programs WHERE listing_id = $1', [id]);
        await c.query('DELETE FROM feeder_listing_vaccinations WHERE listing_id = $1', [id]);
        await writeChildren(c, id, v);
      });
      return this.get(id);
    },

    async get(id) {
      const r = await db.query(`SELECT ${COLUMNS} ${FROM} WHERE f.id = $1`, [id]);
      if (r.rows.length === 0) return null;
      await attach(db, r.rows);
      return r.rows[0];
    },

    async list(o) {
      const p = makeParams();
      const where = ["f.status = 'approved'"];
      if (o.q) {
        const n = p.add(likePattern(o.q));
        where.push(
          `((f.group_id ILIKE ${n} AND NOT f.group_id_optout) OR f.headline ILIKE ${n} OR f.city ILIKE ${n}
            OR f.auction_name ILIKE ${n} OR f.description ILIKE ${n} OR f.nutrition ILIKE ${n} OR f.vet_name ILIKE ${n}
            OR EXISTS (SELECT 1 FROM feeder_listing_breeds b WHERE b.listing_id = f.id AND b.breed_name ILIKE ${n})
            OR EXISTS (SELECT 1 FROM feeder_listing_programs g WHERE g.listing_id = f.id AND g.program_name ILIKE ${n})
            OR EXISTS (SELECT 1 FROM feeder_listing_vaccinations x WHERE x.listing_id = f.id AND x.product ILIKE ${n}))`,
        );
      }
      if (o.state) where.push(`f.state = ${p.add(o.state)}`);
      if (o.breeds && o.breeds.length) {
        where.push(
          `EXISTS (SELECT 1 FROM feeder_listing_breeds b WHERE b.listing_id = f.id AND lower(b.breed_name) = ANY(${p.add(o.breeds.map((x) => x.toLowerCase()))}::text[]))`,
        );
      }
      if (o.programs && o.programs.length) {
        where.push(
          `EXISTS (SELECT 1 FROM feeder_listing_programs g WHERE g.listing_id = f.id AND lower(g.program_name) = ANY(${p.add(o.programs.map((x) => x.toLowerCase()))}::text[]))`,
        );
      }
      if (o.method) where.push(`f.marketing_method = ${p.add(o.method)}`);
      if (o.dateFrom) where.push(`f.marketing_date >= ${p.add(o.dateFrom)}::date`);
      if (o.dateTo) where.push(`f.marketing_date <= ${p.add(o.dateTo)}::date`);
      if (o.tagged) where.push('(f.tag_visual_start IS NOT NULL OR f.tag_eid_start IS NOT NULL)');
      if (o.minWeight) where.push(`f.avg_weight >= ${p.add(o.minWeight)}`);
      if (o.maxWeight) where.push(`f.avg_weight <= ${p.add(o.maxWeight)}`);
      if (o.minAge) where.push(`(f.birth_date IS NOT NULL AND ${AGE_MONTHS} >= ${p.add(o.minAge)})`);
      if (o.maxAge) where.push(`(f.birth_date IS NOT NULL AND ${AGE_MONTHS} <= ${p.add(o.maxAge)})`);
      let distance = '';
      if (o.center) {
        const lat = p.add(o.center.lat);
        const lon = p.add(o.center.lon);
        const d = distanceSql('f', lat, lon);
        where.push(`(f.lat IS NOT NULL AND ${d} <= ${p.add(o.center.miles)})`);
        distance = `, ${d} AS distance_miles`;
      }
      const clause = 'WHERE ' + where.join(' AND ');
      const total = Number((await db.query(`SELECT count(*) AS n FROM feeder_listings f ${clause}`, p.list)).rows[0].n);

      const dir = o.dir === 'asc' ? 'ASC' : 'DESC';
      let order = SORTS[o.sort] || SORTS.newest;
      if (o.sort === 'distance' && o.center) order = 'distance_miles';
      const rows = (
        await db.query(
          `SELECT ${COLUMNS}${distance} ${FROM} ${clause}
           ORDER BY ${order} ${dir} NULLS LAST, f.id DESC
           LIMIT ${Number(o.pageSize)} OFFSET ${Number((o.page - 1) * o.pageSize)}`,
          p.list,
        )
      ).rows;
      await attach(db, rows);
      return { total, rows };
    },

    async mine(ownerId) {
      const r = await db.query(`SELECT ${COLUMNS} ${FROM} WHERE f.owner_id = $1 ORDER BY f.created_at DESC, f.id DESC`, [ownerId]);
      return attach(db, r.rows);
    },

    async queue(status) {
      const r = await db.query(`SELECT ${COLUMNS} ${FROM} WHERE f.status = $1 ORDER BY f.created_at, f.id LIMIT 200`, [status]);
      return attach(db, r.rows);
    },

    // Only a pending listing can be approved; staff can reject a pending listing or pull back an approved one.
    async review(id, { decision, note, reviewerId }) {
      const status = decision === 'approve' ? 'approved' : 'rejected';
      const from = decision === 'approve' ? ['pending'] : ['pending', 'approved'];
      const r = await db.query(
        `UPDATE feeder_listings SET status = $2, review_note = $3, reviewed_by = $4, reviewed_at = now(),
           approved_at = CASE WHEN $2 = 'approved' THEN now() ELSE NULL END, updated_at = now()
         WHERE id = $1 AND status = ANY($5::text[]) RETURNING id`,
        [id, status, note, reviewerId, from],
      );
      return r.rowCount === 1;
    },

    async close(id, status) {
      const r = await db.query(
        `UPDATE feeder_listings SET status = $2, updated_at = now() WHERE id = $1 AND status IN ('approved', 'pending', 'rejected') RETURNING id`,
        [id, status],
      );
      return r.rowCount === 1;
    },

    async pendingCount() {
      return Number((await db.query("SELECT count(*) AS n FROM feeder_listings WHERE status = 'pending'")).rows[0].n);
    },

    async countByOwner(ownerId) {
      return Number((await db.query('SELECT count(*) AS n FROM feeder_listings WHERE owner_id = $1', [ownerId])).rows[0].n);
    },
  };
}

module.exports = { createFeederListingsRepo, FIELDS };
