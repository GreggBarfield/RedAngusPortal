'use strict';
// Turns an uploaded JPG or PNG into three JPEG sizes (full, medium, thumbnail),
// the same three sizes BTN keeps. The turn-to-upright setting on the phone is
// applied, and hidden data such as GPS location is NOT carried over.

const SIZES = { full: 2400, medium: 1000, thumb: 300 };
const MAX_PIXELS = 60 * 1000 * 1000;

// Looks at the first bytes, not the file name or the type the browser claimed.
function detectImage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  return null;
}

async function makeSizes(buf) {
  const sharp = require('sharp');
  const base = () =>
    sharp(buf, { limitInputPixels: MAX_PIXELS, failOn: 'error' })
      .rotate()
      .flatten({ background: '#ffffff' })
      .toColourspace('srgb');
  const make = async (edge, quality) => {
    const r = await base()
      .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { data: r.data, width: r.info.width, height: r.info.height };
  };
  const full = await make(SIZES.full, 85);
  const medium = await make(SIZES.medium, 82);
  const thumb = await make(SIZES.thumb, 78);
  return { full, medium, thumb };
}

module.exports = { detectImage, makeSizes, SIZES, MAX_PIXELS };
