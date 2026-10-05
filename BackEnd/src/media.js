'use strict';
// Photos and attachments of the feeder and breeding listings (migration 007).
const config = require('./config');

const MAX_PHOTOS = 10;
const MAX_ATTACHMENTS = 5;

// One entry per kind of listing: its table and the column that points at it.
const KINDS = {
  feeder: { table: 'feeder_listings', fk: 'feeder_listing_id' },
  breeding: { table: 'breeding_listings', fk: 'breeding_listing_id' },
};

class LimitError extends Error {
  constructor(what, max) {
    super('limit');
    this.code = 'limit';
    this.what = what;
    this.max = max;
  }
}

// Photos are read straight from S3 by the browser, so the address is built here.
function urlFor(key, base = config.s3BaseUrl) {
  return base + '/' + String(key).split('/').map(encodeURIComponent).join('/');
}

function photoOut(r, base = config.s3BaseUrl) {
  return {
    id: String(r.id),
    thumbUrl: urlFor(r.s3_key_thumb, base),
    mediumUrl: urlFor(r.s3_key_medium, base),
    fullUrl: urlFor(r.s3_key, base),
    isCover: r.is_cover,
    width: r.width,
    height: r.height,
  };
}

function attachmentOut(r) {
  return { id: String(r.id), name: r.orig_name, ext: r.file_ext, docType: r.doc_type, size: r.file_size };
}

// Puts row.photos and row.attachments on each listing row (used by the listing repos).
async function attachMedia(db, kind, rows) {
  const { fk } = KINDS[kind];
  for (const row of rows) {
    row.photos = [];
    row.attachments = [];
  }
  if (rows.length === 0) return rows;
  const ids = rows.map((r) => r.id);
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  const ph = await db.query(
    `SELECT ${fk} AS listing_id, id, s3_key, s3_key_medium, s3_key_thumb, is_cover, width, height
     FROM raa_listing_photos WHERE ${fk} = ANY($1::bigint[]) ORDER BY is_cover DESC, display_order, id`,
    [ids],
  );
  for (const r of ph.rows) byId.get(String(r.listing_id)).photos.push(photoOut(r));
  const at = await db.query(
    `SELECT ${fk} AS listing_id, id, orig_name, file_ext, doc_type, file_size
     FROM raa_listing_attachments WHERE ${fk} = ANY($1::bigint[]) ORDER BY id`,
    [ids],
  );
  for (const r of at.rows) byId.get(String(r.listing_id)).attachments.push(attachmentOut(r));
  return rows;
}

// Adding or removing a file changes the listing, so an approved (or rejected)
// listing goes back to staff, the same as any other edit. Runs inside a transaction.
async function sendBackToPending(c, kind, id) {
  const { table } = KINDS[kind];
  await c.query(
    `UPDATE ${table} SET status = 'pending', review_note = NULL, reviewed_by = NULL, reviewed_at = NULL,
       approved_at = NULL, updated_at = now() WHERE id = $1 AND status IN ('approved', 'rejected')`,
    [id],
  );
}

async function lockListing(c, kind, id) {
  const { table } = KINDS[kind];
  const r = await c.query(`SELECT id FROM ${table} WHERE id = $1 FOR UPDATE`, [id]);
  return r.rowCount === 1;
}

function createMediaRepo(db) {
  return {
    async countPhotos(kind, id) {
      const { fk } = KINDS[kind];
      return Number((await db.query(`SELECT count(*) AS n FROM raa_listing_photos WHERE ${fk} = $1`, [id])).rows[0].n);
    },

    async countAttachments(kind, id) {
      const { fk } = KINDS[kind];
      return Number((await db.query(`SELECT count(*) AS n FROM raa_listing_attachments WHERE ${fk} = $1`, [id])).rows[0].n);
    },

    // d: { keys: {full, medium, thumb}, size, width, height, userId }
    async addPhoto(kind, id, d) {
      const { fk } = KINDS[kind];
      return db.transaction(async (c) => {
        if (!(await lockListing(c, kind, id))) return null;
        const s = (await c.query(`SELECT count(*)::int AS n, COALESCE(max(display_order), -1) + 1 AS next FROM raa_listing_photos WHERE ${fk} = $1`, [id])).rows[0];
        if (s.n >= MAX_PHOTOS) throw new LimitError('photos', MAX_PHOTOS);
        const r = await c.query(
          `INSERT INTO raa_listing_photos (${fk}, s3_key, s3_key_medium, s3_key_thumb, file_size_bytes, width, height, display_order, is_cover, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING id, s3_key, s3_key_medium, s3_key_thumb, is_cover, width, height`,
          [id, d.keys.full, d.keys.medium, d.keys.thumb, d.size, d.width, d.height, s.next, s.n === 0, d.userId],
        );
        await sendBackToPending(c, kind, id);
        return r.rows[0];
      });
    },

    // Returns the S3 keys of the removed photo (so the files can be deleted), or null.
    async removePhoto(kind, id, photoId) {
      const { fk } = KINDS[kind];
      return db.transaction(async (c) => {
        if (!(await lockListing(c, kind, id))) return null;
        const r = await c.query(
          `DELETE FROM raa_listing_photos WHERE id = $1 AND ${fk} = $2 RETURNING s3_key, s3_key_medium, s3_key_thumb, is_cover`,
          [photoId, id],
        );
        if (r.rowCount === 0) return null;
        if (r.rows[0].is_cover) {
          await c.query(
            `UPDATE raa_listing_photos SET is_cover = true
             WHERE id = (SELECT id FROM raa_listing_photos WHERE ${fk} = $1 ORDER BY display_order, id LIMIT 1)`,
            [id],
          );
        }
        await sendBackToPending(c, kind, id);
        const x = r.rows[0];
        return [x.s3_key, x.s3_key_medium, x.s3_key_thumb];
      });
    },

    async setCover(kind, id, photoId) {
      const { fk } = KINDS[kind];
      return db.transaction(async (c) => {
        if (!(await lockListing(c, kind, id))) return false;
        const has = await c.query(`SELECT 1 FROM raa_listing_photos WHERE id = $1 AND ${fk} = $2`, [photoId, id]);
        if (has.rowCount === 0) return false;
        await c.query(`UPDATE raa_listing_photos SET is_cover = false WHERE ${fk} = $1 AND is_cover`, [id]);
        await c.query('UPDATE raa_listing_photos SET is_cover = true WHERE id = $1', [photoId]);
        return true;
      });
    },

    // d: { stored, name, ext, mime, size, docType, userId }
    async addAttachment(kind, id, d) {
      const { fk } = KINDS[kind];
      return db.transaction(async (c) => {
        if (!(await lockListing(c, kind, id))) return null;
        const n = Number((await c.query(`SELECT count(*) AS n FROM raa_listing_attachments WHERE ${fk} = $1`, [id])).rows[0].n);
        if (n >= MAX_ATTACHMENTS) throw new LimitError('attachments', MAX_ATTACHMENTS);
        const r = await c.query(
          `INSERT INTO raa_listing_attachments (${fk}, stored_name, orig_name, file_ext, mime_type, file_size, doc_type, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, orig_name, file_ext, doc_type, file_size`,
          [id, d.stored, d.name, d.ext, d.mime, d.size, d.docType, d.userId],
        );
        await sendBackToPending(c, kind, id);
        return r.rows[0];
      });
    },

    // Returns the stored file name of the removed attachment, or null.
    async removeAttachment(kind, id, attId) {
      const { fk } = KINDS[kind];
      return db.transaction(async (c) => {
        if (!(await lockListing(c, kind, id))) return null;
        const r = await c.query(`DELETE FROM raa_listing_attachments WHERE id = $1 AND ${fk} = $2 RETURNING stored_name`, [attId, id]);
        if (r.rowCount === 0) return null;
        await sendBackToPending(c, kind, id);
        return r.rows[0].stored_name;
      });
    },

    async getAttachment(kind, id, attId) {
      const { fk } = KINDS[kind];
      const r = await db.query(
        `SELECT id, stored_name, orig_name, file_ext, mime_type, file_size FROM raa_listing_attachments WHERE id = $1 AND ${fk} = $2`,
        [attId, id],
      );
      return r.rows[0] || null;
    },
  };
}

module.exports = {
  createMediaRepo,
  attachMedia,
  photoOut,
  attachmentOut,
  LimitError,
  MAX_PHOTOS,
  MAX_ATTACHMENTS,
  KINDS,
  urlFor,
};
