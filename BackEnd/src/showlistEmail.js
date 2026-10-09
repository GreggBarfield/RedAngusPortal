'use strict';
// The showlist email: a table with one row per lot of cattle, the seller's contact on each row,
// and an unsubscribe line. Everything a seller or staff member typed is escaped.
const METHOD_LABELS = { auction: 'Auction', off_ranch: 'Off ranch', video_auction: 'Video auction' };
const BASIS_LABELS = { per_cwt: 'per cwt', per_head: 'per head' };

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// '2026-10-20' -> '10/20/2026'
function fmtDate(d) {
  const s = d instanceof Date ? d.toISOString() : String(d || '');
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : '';
}

function headText(l) {
  const parts = [];
  if (l.steerCount) parts.push(`${l.steerCount} steer${l.steerCount === 1 ? '' : 's'}`);
  if (l.heiferCount) parts.push(`${l.heiferCount} heifer${l.heiferCount === 1 ? '' : 's'}`);
  const total = (l.steerCount || 0) + (l.heiferCount || 0);
  return parts.length > 1 ? `${total} head (${parts.join(', ')})` : parts.length === 1 ? parts[0] : total ? `${total} head` : '';
}

function weightText(l) {
  const parts = [];
  if (l.avgWeightSteers) parts.push(`steers ${l.avgWeightSteers} lbs`);
  if (l.avgWeightHeifers) parts.push(`heifers ${l.avgWeightHeifers} lbs`);
  if (parts.length === 0 && l.avgWeight) parts.push(`${l.avgWeight} lbs`);
  return parts.length ? `Avg ${parts.join(', ')}` : '';
}

function sellsText(l) {
  const how = METHOD_LABELS[l.marketingMethod] || '';
  const where = l.marketingMethod === 'auction' || l.marketingMethod === 'video_auction' ? l.auctionName || '' : '';
  return [how, where, fmtDate(l.marketingDate)].filter(Boolean).join(' - ');
}

function priceText(l) {
  if (l.callForPrice) return 'Call for price';
  if (l.askingPrice == null || l.askingPrice === '') return 'Price not listed';
  const money = '$' + Number(l.askingPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${money} ${BASIS_LABELS[l.priceBasis] || ''}`.trim();
}

function placeText(l) {
  return [l.city, l.state].filter(Boolean).join(', ');
}

// opts: { subject, intro, lots, siteUrl, postalAddress, fromName, unsubscribeUrl }
function renderShowlist(opts) {
  const { subject, intro, lots, siteUrl, postalAddress, fromName, unsubscribeUrl } = opts;
  const introHtml = String(intro || '')
    .split(/\r?\n\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 12px 0;">${esc(p).replace(/\r?\n/g, '<br>')}</p>`)
    .join('');

  const th = 'text-align:left;padding:8px 10px;border-bottom:2px solid #b91c1c;font-size:13px;color:#444;background:#f6f6f6;';
  const td = 'vertical-align:top;padding:10px;border-bottom:1px solid #ddd;font-size:14px;';
  const rows = (lots || [])
    .map((l) => {
      const link = `${siteUrl}/feeder/${encodeURIComponent(l.id)}`;
      const breeds = (l.breeds || []).join(', ');
      const contact = [
        l.contactName ? esc(l.contactName) : '',
        l.contactPhone ? esc(l.contactPhone) : '',
        l.contactEmail ? `<a href="mailto:${esc(l.contactEmail)}" style="color:#b91c1c;">${esc(l.contactEmail)}</a>` : '',
      ]
        .filter(Boolean)
        .join('<br>');
      return (
        '<tr>' +
        `<td style="${td}"><a href="${esc(link)}" style="color:#b91c1c;font-weight:bold;text-decoration:none;">${esc(l.headline)}</a>` +
        (breeds ? `<br><span style="color:#666;font-size:13px;">${esc(breeds)}</span>` : '') +
        `</td><td style="${td}">${esc(headText(l))}<br><span style="color:#666;font-size:13px;">${esc(weightText(l))}</span></td>` +
        `<td style="${td}">${esc(sellsText(l))}<br><span style="color:#666;font-size:13px;">${esc(placeText(l))}</span></td>` +
        `<td style="${td}">${esc(priceText(l))}</td>` +
        `<td style="${td}">${contact}</td></tr>`
      );
    })
    .join('');

  const html =
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<title>${esc(subject)}</title></head>` +
    '<body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#222;">' +
    '<div style="max-width:760px;margin:0 auto;padding:20px;">' +
    `<h1 style="font-size:20px;margin:0 0 14px 0;color:#b91c1c;">${esc(subject)}</h1>` +
    introHtml +
    '<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin-top:8px;">' +
    `<thead><tr><th style="${th}">Cattle</th><th style="${th}">Head and weight</th><th style="${th}">Sells</th><th style="${th}">Price</th><th style="${th}">Seller contact</th></tr></thead>` +
    `<tbody>${rows}</tbody></table>` +
    '<p style="margin:16px 0 0 0;font-size:13px;color:#555;">Click a lot name to see the full listing. Contact the seller directly about any lot.</p>' +
    '<hr style="border:none;border-top:1px solid #ddd;margin:20px 0 12px 0;">' +
    `<p style="margin:0 0 6px 0;font-size:12px;color:#777;">Sent by the ${esc(fromName)} on behalf of Red Angus members who have cattle for sale.</p>` +
    (postalAddress ? `<p style="margin:0 0 6px 0;font-size:12px;color:#777;">${esc(postalAddress)}</p>` : '') +
    `<p style="margin:0;font-size:12px;color:#777;">Do not want these emails? <a href="${esc(unsubscribeUrl)}" style="color:#777;">Unsubscribe</a> and this feedlot will not be emailed again.</p>` +
    '</div></body></html>';

  const textLots = (lots || [])
    .map((l) => {
      const lines = [
        `* ${l.headline}`,
        `  ${[headText(l), weightText(l)].filter(Boolean).join(' - ')}`,
        `  Sells: ${[sellsText(l), placeText(l)].filter(Boolean).join(' - ')}`,
        `  Price: ${priceText(l)}`,
        `  Contact: ${[l.contactName, l.contactPhone, l.contactEmail].filter(Boolean).join(' - ')}`,
        `  ${siteUrl}/feeder/${l.id}`,
      ];
      return lines.join('\n');
    })
    .join('\n\n');
  const text =
    `${subject}\n\n` +
    (String(intro || '').trim() ? `${String(intro).trim()}\n\n` : '') +
    `${textLots}\n\n` +
    `Sent by the ${fromName} on behalf of Red Angus members who have cattle for sale.\n` +
    (postalAddress ? `${postalAddress}\n` : '') +
    `To stop these emails, open: ${unsubscribeUrl}\n`;

  return { html, text };
}

module.exports = { renderShowlist, esc, headText, weightText, sellsText, priceText };
