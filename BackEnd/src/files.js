'use strict';
// Attachments (health records, pedigree papers, EPD sheets...) are saved as
// ordinary files in a folder on the BTN server. The database only keeps the
// random file name and the name the seller gave it.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TYPES = {
  pdf: { mime: 'application/pdf', sig: 'pdf' },
  doc: { mime: 'application/msword', sig: 'ole' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sig: 'zip' },
  xls: { mime: 'application/vnd.ms-excel', sig: 'ole' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sig: 'zip' },
  jpg: { mime: 'image/jpeg', sig: 'jpeg' },
  jpeg: { mime: 'image/jpeg', sig: 'jpeg' },
  png: { mime: 'image/png', sig: 'png' },
};
const DOC_TYPES = ['health_records', 'pedigree', 'epd_report', 'sale_sheet', 'other'];
const DOC_TYPE_LABELS = {
  health_records: 'Health records',
  pedigree: 'Pedigree / registration',
  epd_report: 'EPD report',
  sale_sheet: 'Sale sheet',
  other: 'Other',
};

function signatureOf(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 8) return null;
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return 'ole';
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'zip';
  return null;
}

// Name the seller sees: no folders, no odd characters, a sensible length.
function cleanName(raw) {
  let n = typeof raw === 'string' ? raw : '';
  n = n.split(/[\\/]/).pop() || '';
  // eslint-disable-next-line no-control-regex
  n = n.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').replace(/\s+/g, ' ').trim();
  if (n.length > 120) {
    const ext = path.extname(n).slice(0, 10);
    n = n.slice(0, 120 - ext.length) + ext;
  }
  return n;
}

// Checks a name and the file's own first bytes. Returns { ext, mime, name } or { error }.
function checkAttachment(buf, rawName) {
  const name = cleanName(rawName);
  if (!name) return { error: 'Give the file a name.' };
  const ext = path.extname(name).slice(1).toLowerCase();
  const type = TYPES[ext];
  if (!type) return { error: 'Attach a PDF, Word, Excel, JPG or PNG file.' };
  if (!Buffer.isBuffer(buf) || buf.length === 0) return { error: 'That file is empty.' };
  if (signatureOf(buf) !== type.sig) return { error: 'That file does not look like a real .' + ext + ' file.' };
  return { ext, mime: type.mime, name };
}

function createFileStore({ config }) {
  const dir = () => config.attachDir;
  const fullPath = (stored) => {
    if (!/^[0-9a-f-]{36}\.[a-z]{3,4}$/.test(stored)) throw new Error('bad stored file name');
    return path.join(dir(), stored);
  };
  return {
    available: () => Boolean(config.attachDir),

    // Saves the bytes under a new random name and returns that name.
    async save(buf, ext) {
      const stored = crypto.randomUUID() + '.' + ext;
      await fs.promises.mkdir(dir(), { recursive: true });
      await fs.promises.writeFile(fullPath(stored), buf, { flag: 'wx' });
      return stored;
    },

    async remove(stored) {
      try {
        await fs.promises.unlink(fullPath(stored));
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
    },

    path: fullPath,
  };
}

module.exports = { TYPES, DOC_TYPES, DOC_TYPE_LABELS, signatureOf, cleanName, checkAttachment, createFileStore };
