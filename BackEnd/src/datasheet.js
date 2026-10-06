'use strict';
// The Cattle Data Fact Sheet for a feeder listing: a one page PDF that members
// can download and that will later be sent to sale barns. It follows BlockTrust's
// sheet: the layout is built as a web page and turned into a PDF by wkhtmltopdf
// (the same program BlockTrust uses, installed on the same server). The Red Angus
// logo goes on top. Everything a seller typed is escaped before it goes on the page.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const QRCode = require('qrcode');

// The words at the bottom of the sheet. Change them here.
const FOOTER_TEXT =
  'This information is being sent by the Red Angus Association of America on behalf of its members who are seeking more value for their cattle by providing production data. To see this listing online, scan the QR code or visit redangus.blocktrustnetwork.com.';
const TITLE = 'Cattle Data Fact Sheet';
const FALLBACK_NAME = 'Red Angus Association of America';

const METHOD_LABELS = { auction: 'Auction', off_ranch: 'Off Ranch', video_auction: 'Video Auction' };
const BASIS_LABELS = { per_cwt: 'per cwt', per_head: 'per head' };
const LOGO_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' };

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const dash = (v) => (v == null || String(v).trim() === '' ? '-' : esc(String(v).trim()));

// '2026-10-06' -> '10/06/2026'
function fmtDate(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ''));
  return m ? `${m[2]}/${m[3]}/${m[1]}` : '';
}

function weightText(n) {
  return n ? `${n} lbs.` : '-';
}

function priceText(l) {
  if (l.callForPrice) return 'Call for price';
  if (l.askingPrice == null) return 'Price not listed';
  const money = '$' + Number(l.askingPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return l.priceBasis ? `${money} ${BASIS_LABELS[l.priceBasis] || ''}`.trim() : money;
}

// Breeds the way buyers see them: with percents or head counts when the seller gave them.
function breedText(l) {
  const names = l.breeds || [];
  const d = l.breedDetails;
  if (!l.breedMode || !d || !d.some((x) => x.amount != null)) return names.join(', ');
  return d.map((x) => (x.amount == null ? x.name : l.breedMode === 'percent' ? `${x.name} ${x.amount}%` : `${x.name} (${x.amount} head)`)).join(', ');
}

// One range for visual tags or EID tags: "start-end", or the one value given.
function tagRange(start, end) {
  const a = (start || '').trim();
  const b = (end || '').trim();
  if (a && b && a !== b) return `${a}-${b}`;
  return a || b;
}

function placeText(l) {
  const city = (l.city || '').trim();
  return city ? `${city}, ${l.state}` : l.state || '';
}

function locationText(l) {
  const auction = (l.auctionName || '').trim();
  if ((l.marketingMethod === 'auction' || l.marketingMethod === 'video_auction') && auction) return auction;
  if (l.marketingMethod === 'off_ranch') return 'Off Ranch';
  return auction;
}

// Address of a program's little picture: a full address, or a file name in BlockTrust's logo folder.
function iconUrl(image, base) {
  const img = String(image || '').trim();
  if (!img) return '';
  if (/^https?:\/\//i.test(img)) return img;
  if (!base) return '';
  return `${base}/blocktrust_v2/images/logos/${encodeURIComponent(img)}`;
}

function programBlock(heading, names, icons) {
  if (!names || names.length === 0) return '';
  const rows = names
    .map((n) => {
      const src = icons.get(String(n).toLowerCase());
      const pic = src ? `<img src="${esc(src)}" class="pic">` : '<span class="nopic"></span>';
      return `<div class="prog">${pic}<span>${esc(n)}</span></div>`;
    })
    .join('');
  return `<div class="subhead">${esc(heading)}</div>${rows}`;
}

// Builds the page. `l` is a listing as the API shows it to a signed-in member.
// `assets` = { logo: data address or '', qr: data address, icons: Map(lowercase program name -> address) }.
function buildDatasheetHtml(l, assets) {
  const icons = assets.icons || new Map();
  const visual = tagRange(l.tagVisualStart, l.tagVisualEnd);
  const eid = tagRange(l.tagEidStart, l.tagEidEnd);
  const tagInfo =
    visual || eid
      ? `<div class="gap"><b>Tag Information</b></div>${visual ? `<div>Visual Tags: ${esc(visual)}</div>` : ''}${eid ? `<div>EID Tags: ${esc(eid)}</div>` : ''}`
      : '';

  const vacc = (l.vaccinations || [])
    .filter((v) => v && (v.date || v.product))
    .map((v) => `<tr><td class="vdate">${esc(fmtDate(v.date))}</td><td>${esc(v.product)}</td></tr>`)
    .join('');
  const vaccTable = vacc ? `<table class="vac">${vacc}</table>` : '<div class="small">-</div>';

  const programs = programBlock('Preconditioning', l.preconditioning, icons) + programBlock('Special', l.special, icons);

  const logo = assets.logo ? `<img src="${assets.logo}" class="logo">` : `<div class="fallback">${esc(FALLBACK_NAME)}</div>`;
  const place = placeText(l);
  const group = l.groupId ? l.groupId : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(TITLE)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #000; margin: 0; }
  .center { text-align: center; }
  .logo { width: 340px; }
  .fallback { font-size: 24px; font-weight: bold; }
  h1 { font-size: 18px; font-weight: normal; margin: 14px 0 12px 0; }
  hr { border: none; border-top: 2px solid #000; margin: 10px 0; }
  table.cols { width: 100%; table-layout: fixed; border-collapse: collapse; }
  table.cols td { width: 33%; vertical-align: top; padding: 0 8px 0 0; line-height: 1.35; word-wrap: break-word; }
  .sub { font-size: 12px; margin-left: 12px; color: #444; }
  .gap { margin-top: 8px; }
  .small { font-size: 12px; line-height: 1.35; }
  .subhead { font-weight: bold; font-size: 13px; margin-top: 5px; }
  .prog { font-size: 12px; margin-bottom: 3px; line-height: 1.2; }
  .pic { width: 18px; height: 18px; vertical-align: middle; margin-right: 4px; }
  .nopic { display: inline-block; width: 22px; }
  table.vac { width: 100%; border-collapse: collapse; font-size: 12px; line-height: 1.3; margin-top: 3px; }
  table.vac td { padding: 2px 4px 2px 0; vertical-align: top; }
  td.vdate { width: 32%; }
  .qr { width: 120px; height: 120px; display: block; margin-bottom: 6px; }
  .text { font-size: 12px; line-height: 1.4; white-space: pre-line; margin-top: 3px; }
  .foot { font-size: 11px; }
  .row { page-break-inside: avoid; }
</style>
</head>
<body>
<div class="center">${logo}</div>
<h1 class="center">${esc(TITLE)}</h1>
<hr>
<table class="cols row"><tr>
  <td>
    <b>Cattle Information</b>
    <div>Number of Steers: ${esc(l.steerCount || 0)}</div>
    <div class="sub">Avg Wt: ${esc(weightText(l.avgWeightSteers))}</div>
    <div>Number of Heifers: ${esc(l.heiferCount || 0)}</div>
    <div class="sub">Avg Wt: ${esc(weightText(l.avgWeightHeifers))}</div>
    <div>Total Head: ${esc(l.headCount || 0)}</div>
    <div>Breed: ${dash(breedText(l))}</div>
    <div>First Birthdate: ${dash(fmtDate(l.birthDate))}</div>
    <div>Weaned Date: ${dash(fmtDate(l.weanDate))}</div>
    <div>Birth Country: ${dash(l.birthCountry)}</div>
  </td>
  <td>
    <b>Seller Information</b>
    <div>${dash(l.contactName)}</div>
    <div>${dash(l.contactEmail)}</div>
    <div>${dash(l.contactPhone)}</div>
    <div>Location: ${dash(place)}</div>
    ${tagInfo}
  </td>
  <td>
    <img src="${assets.qr}" class="qr">
    <b>Market Information</b>
    <div>Method: ${dash(METHOD_LABELS[l.marketingMethod] || l.marketingMethod)}</div>
    <div><b>Sale Date:</b> ${dash(fmtDate(l.marketingDate))}</div>
    <div><b>Sale Location</b></div>
    <div>${dash(locationText(l))}</div>
    <div>Group ID: ${dash(group)}</div>
    <div>Price: ${esc(priceText(l))}</div>
    <div class="small">Listing #${esc(l.id)}</div>
  </td>
</tr></table>
<hr>
<table class="cols row"><tr>
  <td>
    <b>Health Information</b>
    <div>Veterinarian: ${dash(l.vetName)}</div>
    <div>Vaccinations:</div>
    ${vaccTable}
  </td>
  <td>
    <b>Nutrition Information</b>
    <div>Feed Notes:</div>
    <div class="text">${dash(l.nutrition)}</div>
  </td>
  <td>
    <b>Programs</b>
    <div>${programs || '<div class="small">-</div>'}</div>
  </td>
</tr></table>
<div class="gap row">
  <br>
  <b>Other Information from Seller:</b>
  <div class="text">${dash(l.description)}</div>
</div>
<hr>
<p class="foot">${esc(FOOTER_TEXT)}</p>
<p>Thank You</p>
</body>
</html>`;
}

// Turns a page into a PDF with wkhtmltopdf. The page goes in on standard input and the PDF is
// written to a temporary file that is read back and deleted straight away (writing to standard
// output does not work everywhere). wkhtmltopdf exits with 1 when a picture could not be loaded
// but still makes the PDF, so a result that starts with %PDF is accepted.
function renderPdf(html, { bin, timeoutMs = 30000, spawnFn = spawn, tmpDir = os.tmpdir() }) {
  return new Promise((resolve, reject) => {
    const outFile = path.join(tmpDir, `raa_datasheet_${crypto.randomUUID()}.pdf`);
    const args = [
      '--quiet',
      '--encoding', 'utf-8',
      '--page-size', 'Letter',
      '--margin-top', '12mm',
      '--margin-bottom', '12mm',
      '--margin-left', '14mm',
      '--margin-right', '14mm',
      '--disable-javascript',
      '--disable-local-file-access',
      '--load-error-handling', 'ignore',
      '--load-media-error-handling', 'ignore',
      '-',
      outFile,
    ];
    const cleanup = () => fs.rm(outFile, { force: true }, () => {});
    let child;
    try {
      child = spawnFn(bin, args, { windowsHide: true });
    } catch (err) {
      reject(err);
      return;
    }
    const errOut = [];
    let done = false;
    const finish = (fn, v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cleanup();
      fn(v);
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch (e) {
        /* already gone */
      }
      finish(reject, new Error('wkhtmltopdf timed out'));
    }, timeoutMs);
    if (child.stdout) child.stdout.on('data', () => {});
    if (child.stderr) child.stderr.on('data', (c) => errOut.push(c));
    child.on('error', (err) => finish(reject, err));
    child.on('close', (code) => {
      fs.readFile(outFile, (readErr, buf) => {
        if (!readErr && buf.length > 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return finish(resolve, buf);
        return finish(reject, new Error(`wkhtmltopdf failed (${code}): ${Buffer.concat(errOut).toString('utf8').slice(0, 300)}`));
      });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(html, 'utf8');
  });
}

// Keeps at most a few PDFs being made at once; the rest wait their turn.
function createGate(max) {
  let running = 0;
  const waiting = [];
  const next = () => {
    if (running >= max || waiting.length === 0) return;
    running += 1;
    waiting.shift()();
  };
  return function run(task) {
    return new Promise((resolve, reject) => {
      waiting.push(() => {
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            running -= 1;
            next();
          });
      });
      next();
    });
  };
}

function loadLogo(logoPath) {
  try {
    const type = LOGO_TYPES[path.extname(logoPath).toLowerCase()];
    if (!type || !fs.existsSync(logoPath)) return '';
    return `data:${type};base64,${fs.readFileSync(logoPath).toString('base64')}`;
  } catch (e) {
    return '';
  }
}

function createDatasheet({ config, ref, spawnFn, qr = QRCode, maxAtOnce = 2 }) {
  const bin = config.wkhtmltopdfPath;
  const siteUrl = String(config.siteUrl || '').replace(/\/+$/, '');
  const btnUrl = String(config.marketInsightsUrl || '').replace(/\/+$/, '');
  const gate = createGate(maxAtOnce);
  let logo = null;

  // True when wkhtmltopdf can be found (a full path is checked; a plain name is trusted).
  function available() {
    if (!bin) return false;
    return path.isAbsolute(bin) ? fs.existsSync(bin) : true;
  }

  async function iconMap(l) {
    const map = new Map();
    const names = [...(l.preconditioning || []), ...(l.special || [])];
    if (names.length === 0 || !ref || !ref.available()) return map;
    try {
      const all = await ref.programs();
      const byName = new Map(all.map((p) => [String(p.name).toLowerCase(), p.image]));
      for (const n of names) {
        const src = iconUrl(byName.get(String(n).toLowerCase()), btnUrl);
        if (src) map.set(String(n).toLowerCase(), src);
      }
    } catch (err) {
      console.error('datasheet program pictures skipped:', err.message);
    }
    return map;
  }

  return {
    available,
    filename: (l) => `RedAngus_FeederDataSheet_${l.id}.pdf`,

    async build(l) {
      if (logo === null) logo = loadLogo(config.datasheetLogoPath);
      const target = `${siteUrl}/feeder/${l.id}`;
      const [qrImage, icons] = await Promise.all([
        qr.toDataURL(target, { width: 300, margin: 1, errorCorrectionLevel: 'M' }),
        iconMap(l),
      ]);
      const html = buildDatasheetHtml(l, { logo, qr: qrImage, icons });
      return gate(() => renderPdf(html, { bin, spawnFn }));
    },
  };
}

module.exports = { createDatasheet, buildDatasheetHtml, renderPdf, createGate, breedText, tagRange, fmtDate, esc, FOOTER_TEXT };
