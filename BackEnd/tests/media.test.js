'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const sharp = require('sharp');
const { createApp } = require('../src/app');
const { signToken } = require('../src/auth');
const { createStorage, assertRaaKey } = require('../src/s3');
const { checkAttachment, cleanName, signatureOf } = require('../src/files');
const { detectImage } = require('../src/images');
const { shape: feederShape } = require('../src/routes/feederListings');
const { shape: breedingShape } = require('../src/routes/breedingListings');
const { LimitError, MAX_PHOTOS, MAX_ATTACHMENTS } = require('../src/media');

const SECRET = 'test-secret-that-is-at-least-32-characters-long';
const NOW = new Date('2026-10-05T12:00:00Z');
const tok = (id, role) => 'Bearer ' + signToken({ id, role }, SECRET);
const owner = () => tok(1, 'member');
const staff = () => tok(2, 'staff');
const other = () => tok(3, 'member');

function fakeUsers() {
  const rows = [
    { id: 1, display_name: 'Pat Barfield', role: 'member', is_active: true },
    { id: 2, display_name: 'Staff', role: 'staff', is_active: true },
    { id: 3, display_name: 'Other', role: 'member', is_active: true },
  ];
  return { findById: async (id) => rows.find((r) => String(r.id) === String(id)) || null };
}

// One listing (id 1) owned by user 1. Tests change its status.
function fakeListings(status = 'approved') {
  const row = { id: 1, owner_id: 1, status, owner_name: 'Pat Barfield' };
  return { row, get: async (id) => (String(id) === '1' ? row : null) };
}

// Same rules as the real repo: limits, one cover, and a change sends an approved listing back to pending.
function fakeMedia(listing) {
  const photos = [];
  const atts = [];
  let next = 1;
  const touch = () => {
    if (listing.row.status === 'approved' || listing.row.status === 'rejected') listing.row.status = 'pending';
  };
  return {
    photos,
    atts,
    async countPhotos() {
      return photos.length;
    },
    async countAttachments() {
      return atts.length;
    },
    async addPhoto(kind, id, d) {
      if (photos.length >= MAX_PHOTOS) throw new LimitError('photos', MAX_PHOTOS);
      const r = {
        id: next++,
        s3_key: d.keys.full,
        s3_key_medium: d.keys.medium,
        s3_key_thumb: d.keys.thumb,
        is_cover: photos.length === 0,
        width: d.width,
        height: d.height,
        size: d.size,
      };
      photos.push(r);
      touch();
      return r;
    },
    async removePhoto(kind, id, photoId) {
      const i = photos.findIndex((p) => String(p.id) === String(photoId));
      if (i < 0) return null;
      const [x] = photos.splice(i, 1);
      if (x.is_cover && photos[0]) photos[0].is_cover = true;
      touch();
      return [x.s3_key, x.s3_key_medium, x.s3_key_thumb];
    },
    async setCover(kind, id, photoId) {
      const p = photos.find((x) => String(x.id) === String(photoId));
      if (!p) return false;
      photos.forEach((x) => (x.is_cover = false));
      p.is_cover = true;
      return true;
    },
    async addAttachment(kind, id, d) {
      if (atts.length >= MAX_ATTACHMENTS) throw new LimitError('attachments', MAX_ATTACHMENTS);
      const r = { id: next++, stored_name: d.stored, orig_name: d.name, file_ext: d.ext, mime_type: d.mime, file_size: d.size, doc_type: d.docType };
      atts.push(r);
      touch();
      return r;
    },
    async removeAttachment(kind, id, attId) {
      const i = atts.findIndex((a) => String(a.id) === String(attId));
      if (i < 0) return null;
      const [x] = atts.splice(i, 1);
      touch();
      return x.stored_name;
    },
    async getAttachment(kind, id, attId) {
      return atts.find((a) => String(a.id) === String(attId)) || null;
    },
  };
}

// Records every call that would go to AWS.
function fakeS3() {
  const calls = [];
  return { calls, send: async (cmd) => calls.push({ name: cmd.constructor.name, key: cmd.input.Key, type: cmd.input.ContentType, body: cmd.input.Body }) };
}

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'raa-attach-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function makeApp({ status = 'approved', s3 = fakeS3(), attachDir = dir } = {}) {
  const feederListings = fakeListings(status);
  const media = fakeMedia(feederListings);
  const storage = createStorage({ config: { s3Bucket: 'b' }, client: s3 });
  const app = createApp({
    db: { isConfigured: () => true, ping: async () => true },
    config: { jwtSecret: SECRET, attachDir, s3BaseUrl: 'https://bucket.example.com' },
    users: fakeUsers(),
    barns: { available: () => false },
    listings: {},
    feeders: {},
    ref: { available: () => false },
    feederListings,
    breedingListings: fakeListings(),
    savedFilters: {},
    media,
    storage,
    now: () => NOW.getTime(),
  });
  return { app, s3, media, listing: feederListings };
}

async function jpeg(width = 3000, height = 2000, rotateTag = false) {
  let img = sharp({ create: { width, height, channels: 3, background: '#b22' } });
  if (rotateTag) img = img.withMetadata({ orientation: 6 });
  return img.jpeg().toBuffer();
}
const png = () => sharp({ create: { width: 800, height: 600, channels: 4, background: { r: 10, g: 120, b: 200, alpha: 0.5 } } }).png().toBuffer();

const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(200, 'x')]);
const upload = (app, who, url, body, type = 'application/octet-stream') =>
  request(app).post(url).set('Authorization', who).set('Content-Type', type).send(body);

describe('S3 key guard', () => {
  test('only keys under listings/raa/ are accepted', () => {
    expect(assertRaaKey('listings/raa/feeder/1/a.jpg')).toBe('listings/raa/feeder/1/a.jpg');
    for (const bad of ['listings/feeder/_7K90ULU43_301663/x.jpg', 'listings/raa/', 'listings/raa/../feeder/x.jpg', 'other/listings/raa/x.jpg', '', null, 'listings/raa//x.jpg', 'listings\\raa\\x.jpg', undefined]) {
      expect(() => assertRaaKey(bad)).toThrow(/outside listings\/raa\//);
    }
  });

  test('put and remove refuse BTN keys and never reach AWS', async () => {
    const s3 = fakeS3();
    const storage = createStorage({ config: { s3Bucket: 'b' }, client: s3 });
    await expect(storage.put('listings/feeder/abc/x.jpg', Buffer.from('x'), 'image/jpeg')).rejects.toThrow();
    await expect(storage.remove(['listings/raa/ok.jpg', 'listings/feeder/abc/x.jpg'])).rejects.toThrow();
    expect(s3.calls).toHaveLength(0);
    await storage.put('listings/raa/feeder/1/x.jpg', Buffer.from('x'), 'image/jpeg');
    await storage.remove('listings/raa/feeder/1/x.jpg');
    expect(s3.calls.map((c) => c.name)).toEqual(['PutObjectCommand', 'DeleteObjectCommand']);
  });

  test('storage is unavailable without settings', () => {
    expect(createStorage({ config: {} }).available()).toBe(false);
    expect(createStorage({ config: { s3Bucket: 'b', awsRegion: 'r', awsAccessKeyId: 'a', awsSecretAccessKey: 's' } }).available()).toBe(true);
  });
});

describe('file checks', () => {
  test('image and document signatures', () => {
    expect(detectImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('jpeg');
    expect(detectImage(Buffer.from('GIF89a......'))).toBeNull();
    expect(signatureOf(PDF)).toBe('pdf');
    expect(signatureOf(Buffer.from('PK\x03\x04abcdefgh', 'latin1'))).toBe('zip');
  });

  test('attachment name and type rules', () => {
    expect(checkAttachment(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]), 'scan.PNG').ext).toBe('png');
    expect(checkAttachment(PDF, 'Health Records.PDF')).toEqual({ ext: 'pdf', mime: 'application/pdf', name: 'Health Records.PDF' });
    expect(checkAttachment(PDF, 'virus.exe').error).toMatch(/PDF, Word, Excel/);
    expect(checkAttachment(PDF, 'noext').error).toMatch(/PDF, Word, Excel/);
    expect(checkAttachment(Buffer.from('not a pdf at all'), 'x.pdf').error).toMatch(/real \.pdf/);
    expect(checkAttachment(Buffer.alloc(0), 'x.pdf').error).toMatch(/empty/);
    expect(checkAttachment(PDF, '').error).toMatch(/name/);
    expect(checkAttachment(Buffer.from('PK\x03\x04abcdefgh', 'latin1'), 'sheet.xlsx').ext).toBe('xlsx');
    expect(checkAttachment(Buffer.from('PK\x03\x04abcdefgh', 'latin1'), 'sheet.xls').error).toBeDefined();
  });

  test('names lose folders and odd characters', () => {
    expect(cleanName('C:\\Users\\pat\\Desktop\\EPD.pdf')).toBe('EPD.pdf');
    expect(cleanName('../../etc/passwd.pdf')).toBe('passwd.pdf');
    expect(cleanName('a<b>:"c|d?e*.pdf')).toBe('abcde.pdf');
    expect(cleanName('x'.repeat(300) + '.pdf').length).toBeLessThanOrEqual(120);
    expect(cleanName('x'.repeat(300) + '.pdf').endsWith('.pdf')).toBe(true);
  });
});

describe('photos', () => {
  test('the owner uploads a photo: three JPEG sizes under listings/raa/', async () => {
    const { app, s3, media } = makeApp();
    const res = await upload(app, owner(), '/api/feeder-listings/1/photos', await jpeg(), 'image/jpeg');
    expect(res.status).toBe(201);
    expect(res.body.photo.isCover).toBe(true);
    expect(res.body.photo.fullUrl).toMatch(/^https:\/\/bucket\.example\.com\/listings\/raa\/feeder\/1\/[0-9a-f-]{36}\.jpg$/);
    expect(res.body.photo.mediumUrl).toMatch(/_medium\.jpg$/);
    expect(res.body.photo.thumbUrl).toMatch(/_thumb\.jpg$/);
    expect(s3.calls).toHaveLength(3);
    for (const c of s3.calls) {
      expect(c.name).toBe('PutObjectCommand');
      expect(c.key.startsWith('listings/raa/feeder/1/')).toBe(true);
      expect(c.type).toBe('image/jpeg');
    }
    const [full, medium, thumb] = await Promise.all(s3.calls.map((c) => sharp(c.body).metadata()));
    expect(full.format).toBe('jpeg');
    expect(Math.max(full.width, full.height)).toBe(2400);
    expect(medium.width).toBe(1000);
    expect(thumb.width).toBe(300);
    expect(media.photos).toHaveLength(1);
  });

  test('a PNG is accepted and comes out as JPEG', async () => {
    const { app, s3 } = makeApp();
    const res = await upload(app, owner(), '/api/feeder-listings/1/photos', await png());
    expect(res.status).toBe(201);
    expect((await sharp(s3.calls[0].body).metadata()).format).toBe('jpeg');
  });

  test('a small photo is not blown up', async () => {
    const { app, s3 } = makeApp();
    await upload(app, owner(), '/api/feeder-listings/1/photos', await jpeg(500, 400));
    const meta = await sharp(s3.calls[0].body).metadata();
    expect([meta.width, meta.height]).toEqual([500, 400]);
  });

  test('hidden location data is not carried into the saved copies', async () => {
    const withGps = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#444' } })
      .withExif({ IFD0: { Copyright: 'Pat' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '30/1 36/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '96/1 18/1 0/1' } })
      .jpeg()
      .toBuffer();
    expect((await sharp(withGps).metadata()).exif).toBeDefined();
    const { app, s3 } = makeApp();
    expect((await upload(app, owner(), '/api/feeder-listings/1/photos', withGps)).status).toBe(201);
    for (const c of s3.calls) expect((await sharp(c.body).metadata()).exif).toBeUndefined();
  });

  test('a photo taken sideways is turned upright', async () => {
    const { app, s3 } = makeApp();
    await upload(app, owner(), '/api/feeder-listings/1/photos', await jpeg(800, 400, true));
    const meta = await sharp(s3.calls[0].body).metadata();
    expect([meta.width, meta.height]).toEqual([400, 800]);
  });

  test('only the owner can add photos', async () => {
    const { app, s3 } = makeApp();
    const body = await jpeg(400, 300);
    expect((await request(app).post('/api/feeder-listings/1/photos').send(body)).status).toBe(401);
    expect((await upload(app, other(), '/api/feeder-listings/1/photos', body)).status).toBe(404);
    expect((await upload(app, staff(), '/api/feeder-listings/1/photos', body)).status).toBe(404);
    expect((await upload(app, owner(), '/api/feeder-listings/99/photos', body)).status).toBe(404);
    expect((await upload(app, owner(), '/api/feeder-listings/abc/photos', body)).status).toBe(404);
    expect(s3.calls).toHaveLength(0);
  });

  test('a sold or withdrawn listing takes no new photos', async () => {
    const { app } = makeApp({ status: 'sold' });
    const res = await upload(app, owner(), '/api/feeder-listings/1/photos', await jpeg(400, 300));
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('closed');
  });

  test('files that are not JPG or PNG photos are refused', async () => {
    const { app, s3 } = makeApp();
    for (const bad of [Buffer.from('hello, I am not a photo at all'), Buffer.from('GIF89a' + 'x'.repeat(50)), PDF, Buffer.alloc(0)]) {
      const res = await upload(app, owner(), '/api/feeder-listings/1/photos', bad, 'image/jpeg');
      expect(res.status).toBe(400);
      expect(res.body.fields.file).toBeDefined();
    }
    // starts like a JPEG but is not a picture
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);
    const res = await upload(app, owner(), '/api/feeder-listings/1/photos', broken, 'image/jpeg');
    expect(res.status).toBe(400);
    expect(res.body.fields.file).toMatch(/could not read/);
    expect(s3.calls).toHaveLength(0);
  });

  test('a file over 10 MB is refused', async () => {
    const { app, s3 } = makeApp();
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(10 * 1024 * 1024 + 10, 1)]);
    const res = await upload(app, owner(), '/api/feeder-listings/1/photos', big, 'image/jpeg');
    expect(res.status).toBe(413);
    expect(res.body.fields.file).toMatch(/10 MB/);
    expect(s3.calls).toHaveLength(0);
  });

  test('the eleventh photo is refused', async () => {
    const { app, s3, media } = makeApp();
    const body = await jpeg(300, 200);
    for (let i = 0; i < MAX_PHOTOS; i++) {
      expect((await upload(app, owner(), '/api/feeder-listings/1/photos', body)).status).toBe(201);
    }
    const res = await upload(app, owner(), '/api/feeder-listings/1/photos', body);
    expect(res.status).toBe(409);
    expect(res.body.fields.file).toMatch(/up to 10/);
    expect(media.photos).toHaveLength(10);
    expect(s3.calls).toHaveLength(30);
  });

  test('if the database refuses the photo, the uploaded files are removed again', async () => {
    const { app, s3, media } = makeApp();
    media.addPhoto = async () => {
      throw new LimitError('photos', MAX_PHOTOS);
    };
    const res = await upload(app, owner(), '/api/feeder-listings/1/photos', await jpeg(300, 200));
    expect(res.status).toBe(409);
    const puts = s3.calls.filter((c) => c.name === 'PutObjectCommand').map((c) => c.key).sort();
    const dels = s3.calls.filter((c) => c.name === 'DeleteObjectCommand').map((c) => c.key).sort();
    expect(puts).toHaveLength(3);
    expect(dels).toEqual(puts);
  });

  test('first photo is the cover; the owner can change it; removing the cover promotes the next', async () => {
    const { app, media } = makeApp();
    const body = await jpeg(300, 200);
    await upload(app, owner(), '/api/feeder-listings/1/photos', body);
    await upload(app, owner(), '/api/feeder-listings/1/photos', body);
    expect(media.photos.map((p) => p.is_cover)).toEqual([true, false]);
    const [a, b] = media.photos.map((p) => p.id);
    expect((await request(app).post(`/api/feeder-listings/1/photos/${b}/cover`).set('Authorization', other())).status).toBe(404);
    expect((await request(app).post(`/api/feeder-listings/1/photos/${b}/cover`).set('Authorization', owner())).status).toBe(200);
    expect(media.photos.map((p) => p.is_cover)).toEqual([false, true]);
    expect((await request(app).post('/api/feeder-listings/1/photos/777/cover').set('Authorization', owner())).status).toBe(404);
    expect((await request(app).delete(`/api/feeder-listings/1/photos/${b}`).set('Authorization', owner())).status).toBe(200);
    expect(media.photos.map((p) => [p.id, p.is_cover])).toEqual([[a, true]]);
  });

  test('removing a photo deletes its three files; strangers cannot', async () => {
    const { app, s3, media } = makeApp();
    await upload(app, owner(), '/api/feeder-listings/1/photos', await jpeg(300, 200));
    const id = media.photos[0].id;
    s3.calls.length = 0;
    expect((await request(app).delete(`/api/feeder-listings/1/photos/${id}`).set('Authorization', other())).status).toBe(404);
    expect((await request(app).delete(`/api/feeder-listings/1/photos/${id}`)).status).toBe(401);
    expect(s3.calls).toHaveLength(0);
    expect((await request(app).delete(`/api/feeder-listings/1/photos/${id}`).set('Authorization', owner())).status).toBe(200);
    expect(s3.calls.map((c) => c.name)).toEqual(['DeleteObjectCommand', 'DeleteObjectCommand', 'DeleteObjectCommand']);
    for (const c of s3.calls) expect(c.key.startsWith('listings/raa/')).toBe(true);
    expect((await request(app).delete(`/api/feeder-listings/1/photos/${id}`).set('Authorization', owner())).status).toBe(404);
  });

  test('adding a photo to an approved listing sends it back to staff', async () => {
    const { app, listing } = makeApp({ status: 'approved' });
    await upload(app, owner(), '/api/feeder-listings/1/photos', await jpeg(300, 200));
    expect(listing.row.status).toBe('pending');
  });

  test('without storage settings the answer is 503', async () => {
    const feederListings = fakeListings();
    const app = createApp({
      db: { isConfigured: () => true, ping: async () => true },
      config: { jwtSecret: SECRET },
      users: fakeUsers(),
      barns: { available: () => false },
      listings: {},
      feeders: {},
      ref: { available: () => false },
      feederListings,
      breedingListings: fakeListings(),
      savedFilters: {},
      media: fakeMedia(feederListings),
    });
    const res = await upload(app, owner(), '/api/feeder-listings/1/photos', await jpeg(300, 200));
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('storage_not_configured');
    const res2 = await upload(app, owner(), '/api/feeder-listings/1/attachments?name=a.pdf', PDF);
    expect(res2.status).toBe(503);
  });

  test('the same routes work for breeding listings', async () => {
    const s3 = fakeS3();
    const breedingListings = fakeListings();
    const app = createApp({
      db: { isConfigured: () => true, ping: async () => true },
      config: { jwtSecret: SECRET },
      users: fakeUsers(),
      barns: { available: () => false },
      listings: {},
      feeders: {},
      ref: { available: () => false },
      feederListings: fakeListings(),
      breedingListings,
      savedFilters: {},
      media: fakeMedia(breedingListings),
      storage: createStorage({ config: { s3Bucket: 'b' }, client: s3 }),
    });
    const res = await upload(app, owner(), '/api/breeding-listings/1/photos', await jpeg(300, 200));
    expect(res.status).toBe(201);
    expect(s3.calls[0].key.startsWith('listings/raa/breeding/1/')).toBe(true);
  });
});

describe('attachments', () => {
  const url = (q = 'name=Health%20Records.pdf&docType=health_records') => '/api/feeder-listings/1/attachments?' + q;

  test('the owner attaches a PDF; it is saved under a random name', async () => {
    const { app, media } = makeApp();
    const res = await upload(app, owner(), url(), PDF, 'application/pdf');
    expect(res.status).toBe(201);
    expect(res.body.attachment).toMatchObject({ name: 'Health Records.pdf', ext: 'pdf', docType: 'health_records', size: PDF.length });
    const saved = fs.readdirSync(dir);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect(saved[0]).not.toMatch(/Health/);
    expect(fs.readFileSync(path.join(dir, saved[0])).equals(PDF)).toBe(true);
    expect(media.atts[0].stored_name).toBe(saved[0]);
  });

  test('Word, Excel and image files are accepted', async () => {
    const { app } = makeApp();
    const zip = Buffer.from('PK\x03\x04' + 'x'.repeat(100), 'latin1');
    const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(100)]);
    for (const [name, body] of [['a.docx', zip], ['a.xlsx', zip], ['a.doc', ole], ['a.xls', ole], ['a.jpg', await jpeg(100, 100)]]) {
      const res = await upload(app, owner(), url('name=' + name), body);
      expect(res.status).toBe(201);
    }
  });

  test('wrong kinds of files are refused and nothing is saved', async () => {
    const { app } = makeApp();
    const cases = [
      [url('name=virus.exe'), PDF],
      [url('name=report.pdf'), Buffer.from('<html>not a pdf</html>')],
      [url('name=report.pdf&docType=secret'), PDF],
      [url('name='), PDF],
      [url('name=a.pdf'), Buffer.alloc(0)],
      [url('name=a.xlsx'), PDF],
    ];
    for (const [u, body] of cases) {
      const res = await upload(app, owner(), u, body);
      expect(res.status).toBe(400);
      expect(res.body.fields.file).toBeDefined();
    }
    expect(fs.readdirSync(dir)).toHaveLength(0);
  });

  test('the sixth attachment is refused and its file is not kept', async () => {
    const { app } = makeApp();
    for (let i = 0; i < MAX_ATTACHMENTS; i++) {
      expect((await upload(app, owner(), url('name=f' + i + '.pdf'), PDF)).status).toBe(201);
    }
    const res = await upload(app, owner(), url('name=f6.pdf'), PDF);
    expect(res.status).toBe(409);
    expect(res.body.fields.file).toMatch(/up to 5/);
    expect(fs.readdirSync(dir)).toHaveLength(5);
  });

  test('a file over 10 MB is refused', async () => {
    const { app } = makeApp();
    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(10 * 1024 * 1024 + 10)]);
    const res = await upload(app, owner(), url('name=big.pdf'), big);
    expect(res.status).toBe(413);
    expect(fs.readdirSync(dir)).toHaveLength(0);
  });

  test('only the owner can add or remove attachments', async () => {
    const { app } = makeApp();
    expect((await upload(app, other(), url(), PDF)).status).toBe(404);
    expect((await upload(app, staff(), url(), PDF)).status).toBe(404);
    expect((await request(app).post(url()).send(PDF)).status).toBe(401);
    await upload(app, owner(), url(), PDF);
    const id = fs.readdirSync(dir).length && 1;
    expect((await request(app).delete(`/api/feeder-listings/1/attachments/${id}`).set('Authorization', other())).status).toBe(404);
    expect(fs.readdirSync(dir)).toHaveLength(1);
    expect((await request(app).delete(`/api/feeder-listings/1/attachments/${id}`).set('Authorization', owner())).status).toBe(200);
    expect(fs.readdirSync(dir)).toHaveLength(0);
  });

  test('download needs a sign-in', async () => {
    const { app, media } = makeApp();
    await upload(app, owner(), url('name=Pedigree%20Sheet.pdf&docType=pedigree'), PDF);
    const res = await request(app).get(`/api/feeder-listings/1/attachments/${media.atts[0].id}/file`);
    expect(res.status).toBe(401);
  });

  test('download rules follow the listing: approved to members, pending only to owner and staff', async () => {
    const { app, media, listing } = makeApp();
    await upload(app, owner(), url('name=Pedigree%20Sheet.pdf&docType=pedigree'), PDF);
    const id = media.atts[0].id;
    const file = `/api/feeder-listings/1/attachments/${id}/file`;
    expect(listing.row.status).toBe('pending');
    expect((await request(app).get(file).set('Authorization', other())).status).toBe(404);
    for (const who of [owner(), staff()]) {
      const res = await request(app).get(file).set('Authorization', who).buffer(true).parse((r, cb) => {
        const chunks = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/pdf/);
      expect(res.headers['content-disposition']).toMatch(/^attachment; filename="Pedigree Sheet\.pdf"/);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['cache-control']).toMatch(/no-store/);
      expect(res.body.equals(PDF)).toBe(true);
    }
    listing.row.status = 'approved';
    expect((await request(app).get(file).set('Authorization', other())).status).toBe(200);
    expect((await request(app).get(file)).status).toBe(401);
    expect((await request(app).get(`/api/feeder-listings/1/attachments/999/file`).set('Authorization', other())).status).toBe(404);
    expect((await request(app).get(`/api/feeder-listings/1/attachments/x/file`).set('Authorization', other())).status).toBe(404);
  });

  test('a file that went missing from the folder gives 404, not a crash', async () => {
    const { app, media, listing } = makeApp();
    await upload(app, owner(), url(), PDF);
    listing.row.status = 'approved';
    fs.rmSync(dir, { recursive: true, force: true });
    const res = await request(app).get(`/api/feeder-listings/1/attachments/${media.atts[0].id}/file`).set('Authorization', other());
    expect(res.status).toBe(404);
  });

  test('a hostile original name never decides where the file is saved', async () => {
    const { app } = makeApp();
    const res = await upload(app, owner(), url('name=' + encodeURIComponent('..\\..\\evil.pdf')), PDF);
    expect(res.status).toBe(201);
    expect(res.body.attachment.name).toBe('evil.pdf');
    expect(fs.readdirSync(dir)).toHaveLength(1);
    expect(fs.readdirSync(path.dirname(dir)).includes('evil.pdf')).toBe(false);
  });
});

describe('what the listing screens receive', () => {
  const photo = { id: '5', thumbUrl: 't', mediumUrl: 'm', fullUrl: 'f', isCover: true };
  const att = { id: '7', name: 'EPD.pdf', ext: 'pdf', docType: 'epd_report', size: 100 };
  const base = { id: 1, owner_id: 1, status: 'approved', photos: [photo], attachments: [att], breeds: [], epds: [], programs: [], vaccinations: [] };

  test.each([['feeder', feederShape], ['breeding', breedingShape]])('%s: visitors see photos and a count, signed-in users see the files', (name, shape) => {
    const pub = shape(base, 'public');
    expect(pub.photos).toEqual([photo]);
    expect(pub.attachmentCount).toBe(1);
    expect(pub.attachments).toBeUndefined();
    for (const level of ['member', 'owner', 'staff']) {
      const out = shape(base, level);
      expect(out.attachments).toEqual([att]);
      expect(out.photos).toEqual([photo]);
    }
  });

  test.each([['feeder', feederShape], ['breeding', breedingShape]])('%s: rows without media still shape', (name, shape) => {
    const out = shape({ ...base, photos: undefined, attachments: undefined }, 'member');
    expect(out.photos).toEqual([]);
    expect(out.attachments).toEqual([]);
    expect(out.attachmentCount).toBe(0);
  });
});
