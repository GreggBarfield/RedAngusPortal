'use strict';
const { renderShowlist, headText, weightText, sellsText, priceText } = require('../src/showlistEmail');

const LOT = {
  id: 7,
  headline: 'Red Angus <steers> & heifers',
  steerCount: 80,
  heiferCount: 40,
  avgWeightSteers: 575,
  avgWeightHeifers: 540,
  marketingMethod: 'auction',
  auctionName: 'Gonzales Livestock Market',
  marketingDate: '2026-10-20',
  city: 'Gonzales',
  state: 'TX',
  priceBasis: 'per_cwt',
  askingPrice: 245.5,
  callForPrice: false,
  contactName: 'Pat Seller',
  contactPhone: '(830) 555-0100',
  contactEmail: 'pat@ranch.example',
  breeds: ['Red Angus', 'Angus'],
};

const base = { subject: 'Cattle for sale', intro: 'Hello\n\nSecond paragraph', lots: [LOT], siteUrl: 'https://raa.example', postalAddress: '1 Main St, Denver CO', fromName: 'Red Angus Portal', unsubscribeUrl: 'https://raa.example/unsubscribe/abc' };

describe('showlist email', () => {
  test('one row per lot with the seller contact, a link to the listing and the unsubscribe link', () => {
    const { html, text } = renderShowlist(base);
    expect(html).toContain('https://raa.example/feeder/7');
    expect(html).toContain('Pat Seller');
    expect(html).toContain('(830) 555-0100');
    expect(html).toContain('mailto:pat@ranch.example');
    expect(html).toContain('120 head (80 steers, 40 heifers)');
    expect(html).toContain('$245.50 per cwt');
    expect(html).toContain('Auction - Gonzales Livestock Market - 10/20/2026');
    expect(html).toContain('href="https://raa.example/unsubscribe/abc"');
    expect(html).toContain('1 Main St, Denver CO');
    expect(html).toContain('<p style="margin:0 0 12px 0;">Hello</p>');
    expect(text).toContain('https://raa.example/unsubscribe/abc');
    expect(text).toContain('Pat Seller');
    expect((html.match(/<tr>/g) || []).length).toBe(2); // header row + one lot
  });

  test('anything typed by a seller or staff is escaped', () => {
    const { html } = renderShowlist({ ...base, subject: 'A <b>bold</b> move', intro: '<script>x()</script>' });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<steers>');
    expect(html).toContain('&lt;steers&gt; &amp; heifers');
    expect(html).toContain('A &lt;b&gt;bold&lt;/b&gt; move');
  });

  test('wording helpers', () => {
    expect(headText({ steerCount: 1, heiferCount: 0 })).toBe('1 steer');
    expect(headText({ steerCount: 0, heiferCount: 3 })).toBe('3 heifers');
    expect(weightText({ avgWeight: 600 })).toBe('Avg 600 lbs');
    expect(weightText({})).toBe('');
    expect(sellsText({ marketingMethod: 'off_ranch', marketingDate: '2026-11-02' })).toBe('Off ranch - 11/02/2026');
    expect(priceText({ callForPrice: true })).toBe('Call for price');
    expect(priceText({ askingPrice: null })).toBe('Price not listed');
    expect(priceText({ askingPrice: 1200, priceBasis: 'per_head' })).toBe('$1,200.00 per head');
  });

  test('no postal address line when none is given (the preview adds a placeholder)', () => {
    const { html } = renderShowlist({ ...base, postalAddress: '' });
    expect(html).not.toContain('Denver');
  });
});
