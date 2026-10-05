'use strict';
// Photos and attachments for one kind of listing. Mounted at
// /api/feeder-listings/:id and /api/breeding-listings/:id, so the paths below are
// /photos, /photos/:photoId, /attachments, /attachments/:attId ...
const express = require('express');
const crypto = require('crypto');
const { createLimiter } = require('../rateLimit');
const { ID_RE, DAY, createAccess } = require('../common');
const { detectImage, makeSizes } = require('../images');
const { checkAttachment, DOC_TYPES } = require('../files');
const { photoOut, attachmentOut, LimitError, MAX_PHOTOS, MAX_ATTACHMENTS } = require('../media');

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const UPLOADS_PER_DAY = 200;

function createMediaRouter({ kind, listings, media, storage, files, users, config, images, now }) {
  const router = express.Router({ mergeParams: true });
  const { requireAuth, viewer, levelFor } = createAccess({ users, config });
  const limit = createLimiter({ max: UPLOADS_PER_DAY, windowMs: DAY, now });
  const sizes = images || { detect: detectImage, make: makeSizes };
  const raw = express.raw({ type: () => true, limit: MAX_FILE_BYTES });

  // The seller who owns the listing, and only while it is still open.
  async function ownerOnly(req, res, next) {
    try {
      if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: 'not_found' });
      const row = await listings.get(req.params.id);
      if (!row || String(row.owner_id) !== String(req.user.id)) return res.status(404).json({ error: 'not_found' });
      if (row.status === 'sold' || row.status === 'withdrawn') return res.status(409).json({ error: 'closed' });
      req.listingRow = row;
      return next();
    } catch (err) {
      return next(err);
    }
  }

  function tooMany(req, res, next) {
    if (limit.isBlocked(String(req.user.id))) return res.status(429).json({ error: 'too_many_requests' });
    return next();
  }

  const fileProblem = (res, message, status = 400) => res.status(status).json({ error: 'validation', fields: { file: message } });

  // ---- photos -------------------------------------------------------------

  router.post('/photos', requireAuth, ownerOnly, tooMany, raw, async (req, res, next) => {
    const keys = [];
    try {
      if (!storage.available()) return res.status(503).json({ error: 'storage_not_configured' });
      const id = req.params.id;
      const buf = req.body;
      if (!Buffer.isBuffer(buf) || buf.length === 0) return fileProblem(res, 'Choose a photo.');
      if (!sizes.detect(buf)) return fileProblem(res, 'Photos must be JPG or PNG files.');
      if ((await media.countPhotos(kind, id)) >= MAX_PHOTOS) return fileProblem(res, `You can add up to ${MAX_PHOTOS} photos.`, 409);

      let made;
      try {
        made = await sizes.make(buf);
      } catch (e) {
        return fileProblem(res, 'We could not read that photo. Try another one.');
      }
      const base = `${storage.PREFIX}${kind}/${id}/${crypto.randomUUID()}`;
      keys.push(base + '.jpg', base + '_medium.jpg', base + '_thumb.jpg');
      await storage.put(keys[0], made.full.data, 'image/jpeg');
      await storage.put(keys[1], made.medium.data, 'image/jpeg');
      await storage.put(keys[2], made.thumb.data, 'image/jpeg');

      let row;
      try {
        row = await media.addPhoto(kind, id, {
          keys: { full: keys[0], medium: keys[1], thumb: keys[2] },
          size: made.full.data.length,
          width: made.full.width,
          height: made.full.height,
          userId: req.user.id,
        });
      } catch (err) {
        await storage.remove(keys).catch(() => {});
        if (err instanceof LimitError) return fileProblem(res, `You can add up to ${MAX_PHOTOS} photos.`, 409);
        throw err;
      }
      if (!row) {
        await storage.remove(keys).catch(() => {});
        return res.status(404).json({ error: 'not_found' });
      }
      limit.record(String(req.user.id));
      return res.status(201).json({ photo: photoOut(row, config.s3BaseUrl) });
    } catch (err) {
      if (keys.length) await storage.remove(keys).catch(() => {});
      return next(err);
    }
  });

  router.delete('/photos/:photoId', requireAuth, ownerOnly, async (req, res, next) => {
    try {
      if (!ID_RE.test(req.params.photoId)) return res.status(404).json({ error: 'not_found' });
      const gone = await media.removePhoto(kind, req.params.id, req.params.photoId);
      if (!gone) return res.status(404).json({ error: 'not_found' });
      // The listing no longer shows the photo; a failed delete only leaves an unused file behind.
      await storage.remove(gone).catch((e) => console.error('photo file delete failed:', e.message));
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/photos/:photoId/cover', requireAuth, ownerOnly, async (req, res, next) => {
    try {
      if (!ID_RE.test(req.params.photoId)) return res.status(404).json({ error: 'not_found' });
      if (!(await media.setCover(kind, req.params.id, req.params.photoId))) return res.status(404).json({ error: 'not_found' });
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  // ---- attachments --------------------------------------------------------

  router.post('/attachments', requireAuth, ownerOnly, tooMany, raw, async (req, res, next) => {
    let stored = null;
    try {
      if (!files.available()) return res.status(503).json({ error: 'storage_not_configured' });
      const id = req.params.id;
      const buf = req.body;
      const nameRaw = typeof req.query.name === 'string' ? req.query.name : '';
      const docRaw = typeof req.query.docType === 'string' ? req.query.docType : 'other';
      if (!DOC_TYPES.includes(docRaw)) return fileProblem(res, 'Choose what kind of document this is.');
      const check = checkAttachment(buf, nameRaw);
      if (check.error) return fileProblem(res, check.error);
      if ((await media.countAttachments(kind, id)) >= MAX_ATTACHMENTS) {
        return fileProblem(res, `You can attach up to ${MAX_ATTACHMENTS} files.`, 409);
      }
      stored = await files.save(buf, check.ext);
      let row;
      try {
        row = await media.addAttachment(kind, id, {
          stored,
          name: check.name,
          ext: check.ext,
          mime: check.mime,
          size: buf.length,
          docType: docRaw,
          userId: req.user.id,
        });
      } catch (err) {
        await files.remove(stored).catch(() => {});
        stored = null;
        if (err instanceof LimitError) return fileProblem(res, `You can attach up to ${MAX_ATTACHMENTS} files.`, 409);
        throw err;
      }
      if (!row) {
        await files.remove(stored).catch(() => {});
        return res.status(404).json({ error: 'not_found' });
      }
      limit.record(String(req.user.id));
      return res.status(201).json({ attachment: attachmentOut(row) });
    } catch (err) {
      if (stored) await files.remove(stored).catch(() => {});
      return next(err);
    }
  });

  router.delete('/attachments/:attId', requireAuth, ownerOnly, async (req, res, next) => {
    try {
      if (!ID_RE.test(req.params.attId)) return res.status(404).json({ error: 'not_found' });
      const stored = await media.removeAttachment(kind, req.params.id, req.params.attId);
      if (!stored) return res.status(404).json({ error: 'not_found' });
      await files.remove(stored).catch((e) => console.error('attachment file delete failed:', e.message));
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  // Signed-in users only. The same rule as the listing itself: a listing that is
  // not approved can only be opened by its owner and staff.
  router.get('/attachments/:attId/file', viewer, async (req, res, next) => {
    try {
      if (!req.viewerUser) return res.status(401).json({ error: 'unauthorized' });
      if (!ID_RE.test(req.params.id) || !ID_RE.test(req.params.attId)) return res.status(404).json({ error: 'not_found' });
      const row = await listings.get(req.params.id);
      if (!row) return res.status(404).json({ error: 'not_found' });
      const level = levelFor(req.viewerUser, row);
      if (row.status !== 'approved' && level !== 'owner' && level !== 'staff') return res.status(404).json({ error: 'not_found' });
      const att = await media.getAttachment(kind, req.params.id, req.params.attId);
      if (!att) return res.status(404).json({ error: 'not_found' });
      const safe = att.orig_name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
      res.set({
        'Content-Type': att.mime_type,
        'Content-Disposition': `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(att.orig_name)}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      });
      return res.sendFile(files.path(att.stored_name), (err) => {
        if (err && !res.headersSent) res.status(404).json({ error: 'not_found' });
      });
    } catch (err) {
      return next(err);
    }
  });

  // A file over the size limit.
  // eslint-disable-next-line no-unused-vars
  router.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') return fileProblem(res, 'That file is bigger than 10 MB.', 413);
    return next(err);
  });

  return router;
}

module.exports = { createMediaRouter, MAX_FILE_BYTES };
