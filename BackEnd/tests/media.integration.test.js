'use strict';
// Runs only when TEST_DATABASE_URL points at an EMPTY scratch database.
// It drops and rebuilds tables there. Never point it at the real raaaa database.
const { Pool } = require('pg');
const { runMigrations } = require('../src/migrate');
const { createFeederListingsRepo } = require('../src/feederListings');
const { createBreedingListingsRepo } = require('../src/breedingListings');
const { createMediaRepo, LimitError, MAX_PHOTOS, MAX_ATTACHMENTS } = require('../src/media');
const { validateFeederListing } = require('../src/routes/feederListings');
const { validateBreedingListing } = require('../src/routes/breedingListings');

const url = process.env.TEST_DATABASE_URL;
const maybe = url ? describe : describe.skip;
const NOW = new Date('2026-10-05T12:00:00Z');

const DROP =
  'DROP TABLE IF EXISTS feedlot_log, feedlots, saved_filters, raa_listing_attachments, raa_listing_photos, breeding_listing_epds, breeding_listing_breeds, breeding_listings, feeder_listing_vaccinations, feeder_listing_programs, feeder_listing_breeds, feeder_listings, feeder_lots, listings, barn_contact_log, barn_settings, users, schema_migrations CASCADE';

const FEEDER = {
  groupId: 'PAT100',
  steerCount: 40,
  heiferCount: 20,
  avgWeightSteers: 600,
  avgWeightHeifers: 540,
  breeds: ['Red Angus'],
  marketingMethod: 'off_ranch',
  marketingDate: '2026-11-15',
  state: 'TX',
  zip: '77801',
  contactName: 'Pat Rancher',
  contactPhone: '(979) 555-0100',
  contactEmail: 'pat@example.com',
};
const BREEDING = {
  headCount: 1,
  sexClass: 'bull',
  breeds: ['Red Angus'],
  saleType: 'private_treaty',
  saleDate: '2026-12-01',
  state: 'TX',
  zip: '77801',
  callForPrice: true,
  contactName: 'Pat Rancher',
  contactPhone: '979-555-0100',
  contactEmail: 'pat@example.com',
  epds: [],
};

maybe('photos and attachments (real Postgres)', () => {
  let pool;
  let feeders;
  let breeding;
  let media;
  let userId;
  let staffId;
  let n = 0;

  const db = {
    query: (t, p) => pool.query(t, p),
    transaction: async (fn) => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const r = await fn(c);
        await c.query('COMMIT');
        return r;
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    },
  };

  const newFeeder = async () => {
    const { values, errors } = validateFeederListing(FEEDER, NOW);
    if (errors) throw new Error(JSON.stringify(errors));
    values.lat = null;
    values.lon = null;
    return feeders.create(userId, values);
  };
  const newBull = async () => {
    const { values, errors } = validateBreedingListing(BREEDING, NOW);
    if (errors) throw new Error(JSON.stringify(errors));
    values.lat = null;
    values.lon = null;
    return breeding.create(userId, values);
  };
  const photo = (kind, id) => {
    n += 1;
    const base = `listings/raa/${kind}/${id}/p${n}`;
    return { keys: { full: base + '.jpg', medium: base + '_medium.jpg', thumb: base + '_thumb.jpg' }, size: 1000 + n, width: 2400, height: 1600, userId };
  };
  const att = (name = 'a.pdf', docType = 'other') => {
    n += 1;
    return { stored: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}.pdf`, name, ext: 'pdf', mime: 'application/pdf', size: 500, docType, userId };
  };
  const approve = async (repo, id) => repo.review(id, { decision: 'approve', note: null, reviewerId: staffId });
  const status = async (repo, id) => (await repo.get(id)).status;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url, max: 12 });
    await pool.query(DROP);
    await runMigrations({ connectionString: url, log: () => {} });
    userId = (await pool.query("INSERT INTO users (email, password_hash, display_name, membership_number) VALUES ('o@x.com','x','Owner','1') RETURNING id")).rows[0].id;
    staffId = (await pool.query("INSERT INTO users (email, password_hash, display_name, membership_number, role) VALUES ('s@x.com','x','Staff','2','staff') RETURNING id")).rows[0].id;
    feeders = createFeederListingsRepo(db);
    breeding = createBreedingListingsRepo(db);
    media = createMediaRepo(db);
  });
  afterAll(async () => {
    await pool.query(DROP);
    await pool.end();
  });

  test('migration 007 is recorded', async () => {
    const r = await pool.query("SELECT name FROM schema_migrations WHERE name = '007_photos_attachments.sql'");
    expect(r.rowCount).toBe(1);
  });

  test('a new listing has no photos or attachments', async () => {
    const f = await newFeeder();
    expect(f.photos).toEqual([]);
    expect(f.attachments).toEqual([]);
  });

  test('photos: the first is the cover, order is kept, and they show on the listing', async () => {
    const f = await newFeeder();
    const a = await media.addPhoto('feeder', f.id, photo('feeder', f.id));
    const b = await media.addPhoto('feeder', f.id, photo('feeder', f.id));
    expect([a.is_cover, b.is_cover]).toEqual([true, false]);
    const got = await feeders.get(f.id);
    expect(got.photos.map((p) => p.id)).toEqual([String(a.id), String(b.id)]);
    expect(got.photos[0]).toMatchObject({ isCover: true, width: 2400, height: 1600 });
    expect(got.photos[0].thumbUrl).toMatch(/\/listings\/raa\/feeder\/\d+\/p\d+_thumb\.jpg$/);
    expect(await media.countPhotos('feeder', f.id)).toBe(2);
  });

  test('photos on a feeder listing do not show on a breeding listing with the same number', async () => {
    const f = await newFeeder();
    const bl = await newBull();
    await media.addPhoto('feeder', f.id, photo('feeder', f.id));
    await media.addPhoto('breeding', bl.id, photo('breeding', bl.id));
    expect((await feeders.get(f.id)).photos).toHaveLength(1);
    expect((await breeding.get(bl.id)).photos).toHaveLength(1);
    expect((await feeders.list({ page: 1, pageSize: 50 })).rows).toBeDefined();
  });

  test('changing the cover moves it; there is always exactly one', async () => {
    const f = await newFeeder();
    const a = await media.addPhoto('feeder', f.id, photo('feeder', f.id));
    const b = await media.addPhoto('feeder', f.id, photo('feeder', f.id));
    expect(await media.setCover('feeder', f.id, b.id)).toBe(true);
    let got = await feeders.get(f.id);
    expect(got.photos.map((p) => [p.id, p.isCover])).toEqual([[String(b.id), true], [String(a.id), false]]);
    // a photo of another listing cannot become the cover
    const g = await newFeeder();
    expect(await media.setCover('feeder', g.id, a.id)).toBe(false);
    expect(await media.setCover('feeder', f.id, 999999)).toBe(false);
    const covers = await pool.query('SELECT count(*)::int AS n FROM raa_listing_photos WHERE feeder_listing_id = $1 AND is_cover', [f.id]);
    expect(covers.rows[0].n).toBe(1);
    got = await feeders.get(f.id);
    expect(got.photos[0].isCover).toBe(true);
  });

  test('removing the cover promotes the next photo and returns the three keys', async () => {
    const f = await newFeeder();
    const a = await media.addPhoto('feeder', f.id, photo('feeder', f.id));
    const b = await media.addPhoto('feeder', f.id, photo('feeder', f.id));
    const keys = await media.removePhoto('feeder', f.id, a.id);
    expect(keys).toEqual([a.s3_key, a.s3_key_medium, a.s3_key_thumb]);
    const got = await feeders.get(f.id);
    expect(got.photos.map((p) => [p.id, p.isCover])).toEqual([[String(b.id), true]]);
    expect(await media.removePhoto('feeder', f.id, a.id)).toBeNull();
    const g = await newFeeder();
    expect(await media.removePhoto('feeder', g.id, b.id)).toBeNull();
    expect(await media.removePhoto('feeder', f.id, b.id)).not.toBeNull();
    expect((await feeders.get(f.id)).photos).toEqual([]);
  });

  test('a photo added after others were removed still gets a later place and one cover', async () => {
    const f = await newFeeder();
    const a = await media.addPhoto('feeder', f.id, photo('feeder', f.id));
    await media.addPhoto('feeder', f.id, photo('feeder', f.id));
    await media.removePhoto('feeder', f.id, a.id);
    const c = await media.addPhoto('feeder', f.id, photo('feeder', f.id));
    expect(c.is_cover).toBe(false);
    const rows = (await pool.query('SELECT display_order, is_cover FROM raa_listing_photos WHERE feeder_listing_id = $1 ORDER BY display_order', [f.id])).rows;
    expect(rows.filter((r) => r.is_cover)).toHaveLength(1);
    expect(new Set(rows.map((r) => r.display_order)).size).toBe(rows.length);
  });

  test('the photo limit holds, even with many uploads at the same moment', async () => {
    const f = await newFeeder();
    const results = await Promise.allSettled(Array.from({ length: 14 }, () => media.addPhoto('feeder', f.id, photo('feeder', f.id))));
    const ok = results.filter((r) => r.status === 'fulfilled');
    const refused = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(MAX_PHOTOS);
    expect(refused).toHaveLength(4);
    for (const r of refused) expect(r.reason).toBeInstanceOf(LimitError);
    const covers = await pool.query('SELECT count(*)::int AS n FROM raa_listing_photos WHERE feeder_listing_id = $1 AND is_cover', [f.id]);
    expect(covers.rows[0].n).toBe(1);
  });

  test('the attachment limit holds', async () => {
    const f = await newFeeder();
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => media.addAttachment('feeder', f.id, att('f' + i + '.pdf'))));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(MAX_ATTACHMENTS);
    expect(results.filter((r) => r.status === 'rejected')[0].reason).toBeInstanceOf(LimitError);
    expect(await media.countAttachments('feeder', f.id)).toBe(MAX_ATTACHMENTS);
  });

  test('attachments: listed with name, type and size; fetched by id; removed', async () => {
    const f = await newFeeder();
    const a = await media.addAttachment('feeder', f.id, att('Health Records.pdf', 'health_records'));
    const got = await feeders.get(f.id);
    expect(got.attachments).toEqual([{ id: String(a.id), name: 'Health Records.pdf', ext: 'pdf', docType: 'health_records', size: 500 }]);
    const row = await media.getAttachment('feeder', f.id, a.id);
    expect(row).toMatchObject({ orig_name: 'Health Records.pdf', mime_type: 'application/pdf', file_ext: 'pdf' });
    expect(row.stored_name).toMatch(/\.pdf$/);
    const g = await newFeeder();
    expect(await media.getAttachment('feeder', g.id, a.id)).toBeNull();
    expect(await media.getAttachment('breeding', f.id, a.id)).toBeNull();
    expect(await media.removeAttachment('feeder', g.id, a.id)).toBeNull();
    expect(await media.removeAttachment('feeder', f.id, a.id)).toBe(row.stored_name);
    expect((await feeders.get(f.id)).attachments).toEqual([]);
  });

  test('breeding listings carry photos and attachments the same way', async () => {
    const bl = await newBull();
    await media.addPhoto('breeding', bl.id, photo('breeding', bl.id));
    await media.addAttachment('breeding', bl.id, att('EPD.pdf', 'epd_report'));
    const got = await breeding.get(bl.id);
    expect(got.photos).toHaveLength(1);
    expect(got.attachments[0]).toMatchObject({ name: 'EPD.pdf', docType: 'epd_report' });
    const mine = await breeding.mine(userId);
    expect(mine.find((r) => String(r.id) === String(bl.id)).photos).toHaveLength(1);
  });

  test('search results and the staff queue carry photos too', async () => {
    const f = await newFeeder();
    await media.addPhoto('feeder', f.id, photo('feeder', f.id));
    await approve(feeders, f.id);
    const found = await feeders.list({ page: 1, pageSize: 50 });
    expect(found.rows.find((r) => String(r.id) === String(f.id)).photos).toHaveLength(1);
    const g = await newFeeder();
    await media.addPhoto('feeder', g.id, photo('feeder', g.id));
    expect((await feeders.queue('pending')).find((r) => String(r.id) === String(g.id)).photos).toHaveLength(1);
  });

  test('adding or removing a file sends an approved listing back to staff', async () => {
    const f = await newFeeder();
    const p = await media.addPhoto('feeder', f.id, photo('feeder', f.id));
    expect(await status(feeders, f.id)).toBe('pending');

    await approve(feeders, f.id);
    expect(await status(feeders, f.id)).toBe('approved');
    // choosing another cover is not a change to the listing
    const p2 = await media.addPhoto('feeder', f.id, photo('feeder', f.id));
    expect(await status(feeders, f.id)).toBe('pending');
    await approve(feeders, f.id);
    await media.setCover('feeder', f.id, p2.id);
    expect(await status(feeders, f.id)).toBe('approved');

    await media.removePhoto('feeder', f.id, p.id);
    expect(await status(feeders, f.id)).toBe('pending');
    await approve(feeders, f.id);
    await media.addAttachment('feeder', f.id, att());
    expect(await status(feeders, f.id)).toBe('pending');
    await approve(feeders, f.id);
    const a = (await feeders.get(f.id)).attachments[0];
    await media.removeAttachment('feeder', f.id, a.id);
    expect(await status(feeders, f.id)).toBe('pending');

    // rejected goes back to pending as well, and the note is cleared
    await feeders.review(f.id, { decision: 'reject', note: 'Please add a better photo', reviewerId: staffId });
    expect((await feeders.get(f.id)).status).toBe('rejected');
    await media.addPhoto('feeder', f.id, photo('feeder', f.id));
    const after = await feeders.get(f.id);
    expect(after.status).toBe('pending');
    expect(after.review_note).toBeNull();
  });

  test('a listing that does not exist takes nothing', async () => {
    expect(await media.addPhoto('feeder', 987654, photo('feeder', 987654))).toBeNull();
    expect(await media.addAttachment('feeder', 987654, att())).toBeNull();
  });

  test('the database itself refuses keys outside listings/raa/', async () => {
    const f = await newFeeder();
    await expect(
      pool.query(
        `INSERT INTO raa_listing_photos (feeder_listing_id, s3_key, s3_key_medium, s3_key_thumb, file_size_bytes, uploaded_by)
         VALUES ($1, 'listings/feeder/x.jpg', 'listings/raa/m.jpg', 'listings/raa/t.jpg', 10, $2)`,
        [f.id, userId],
      ),
    ).rejects.toThrow(/check constraint/);
  });

  test('a row must belong to exactly one kind of listing', async () => {
    const f = await newFeeder();
    const bl = await newBull();
    const sql = `INSERT INTO raa_listing_photos (feeder_listing_id, breeding_listing_id, s3_key, s3_key_medium, s3_key_thumb, file_size_bytes, uploaded_by)
                 VALUES ($1, $2, 'listings/raa/a.jpg', 'listings/raa/b.jpg', 'listings/raa/c.jpg', 10, $3)`;
    await expect(pool.query(sql, [f.id, bl.id, userId])).rejects.toThrow(/check constraint/);
    await expect(pool.query(sql, [null, null, userId])).rejects.toThrow(/check constraint/);
  });
});
