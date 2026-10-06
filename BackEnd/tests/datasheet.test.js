'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { spawnSync } = require('child_process');
const request = require('supertest');
const { createApp } = require('../src/app');
const { signToken } = require('../src/auth');
const { createDatasheet, buildDatasheetHtml, renderPdf, createGate, breedText, tagRange, fmtDate, FOOTER_TEXT } = require('../src/datasheet');

const SECRET = 'test-secret-that-is-at-least-32-characters-long';
const NOW = new Date('2026-10-06T12:00:00Z');
const tok = (id, role) => 'Bearer ' + signToken({ id, role }, SECRET);

const LISTING = {
  id: '42',
  groupId: 'Barfield 7',
  steerCount: 60,
  heiferCount: 40,
  headCount: 100,
  avgWeightSteers: 585,
  avgWeightHeifers: null,
  birthDate: '2026-02-10',
  weanDate: null,
  birthCountry: 'United States',
  vetName: 'Dr. <b>Smith</b> & Sons',
  breeds: ['Red Angus', 'Angus'],
  breedMode: 'percent',
  breedDetails: [
    { name: 'Red Angus', amount: 75 },
    { name: 'Angus', amount: 25 },
  ],
  preconditioning: ['Program One'],
  special: [],
  vaccinations: [{ date: '2026-08-01', product: 'Bovi-Shield Gold 5' }, { date: null, product: 'Dectomax' }],
  nutrition: 'Creep fed',
  description: 'Nice cattle <script>alert(1)</script>',
  marketingMethod: 'auction',
  auctionName: 'Bryan Livestock',
  marketingDate: '2026-11-12',
  tagVisualStart: '101',
  tagVisualEnd: '160',
  tagEidStart: null,
  tagEidEnd: null,
  city: 'College Station',
  state: 'TX',
  askingPrice: 2.85,
  priceBasis: 'per_cwt',
  callForPrice: false,
  contactName: 'Gregg Barfield',
  contactPhone: '(979) 555-0123',
  contactEmail: 'gregg@example.com',
};
const QR = 'data:image/png;base64,AAAA';

describe('data sheet page', () => {
  test('seller text is escaped, never treated as page code', () => {
    const html = buildDatasheetHtml(LISTING, { logo: '', qr: QR });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>Smith</b>');
    expect(html).toContain('Dr. &lt;b&gt;Smith&lt;/b&gt; &amp; Sons');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  test('shows the main facts like the BlockTrust sheet', () => {
    const html = buildDatasheetHtml(LISTING, { logo: '', qr: QR });
    expect(html).toContain('Cattle Data Fact Sheet');
    expect(html).toContain('Number of Steers: 60');
    expect(html).toContain('Avg Wt: 585 lbs.');
    expect(html).toContain('Avg Wt: -');
    expect(html).toContain('Breed: Red Angus 75%, Angus 25%');
    expect(html).toContain('First Birthdate: 02/10/2026');
    expect(html).toContain('Weaned Date: -');
    expect(html).toContain('Sale Date:</b> 11/12/2026');
    expect(html).toContain('Bryan Livestock');
    expect(html).toContain('Group ID: Barfield 7');
    expect(html).toContain('Price: $2.85 per cwt');
    expect(html).toContain('Visual Tags: 101-160');
    expect(html).not.toContain('EID Tags');
    expect(html).toContain('08/01/2026');
    expect(html).toContain('Bovi-Shield Gold 5');
    expect(html).toContain('Location: College Station, TX');
    expect(html).toContain(QR);
    expect(html).toContain('Listing #42');
    expect(html).toContain(FOOTER_TEXT.slice(0, 40));
  });

  test('leaves out the tag section when there are no tags, and uses dashes for blanks', () => {
    const html = buildDatasheetHtml({ ...LISTING, tagVisualStart: null, tagVisualEnd: null, groupId: null, vaccinations: [], nutrition: '', description: '', preconditioning: [] }, { logo: '', qr: QR });
    expect(html).not.toContain('Tag Information');
    expect(html).toContain('Group ID: -');
    expect(html).toContain('Other Information from Seller:');
    expect(html).not.toContain('Preconditioning');
  });

  test('puts the logo on top when there is one, the name when there is not', () => {
    expect(buildDatasheetHtml(LISTING, { logo: 'data:image/png;base64,LOGO', qr: QR })).toContain('<img src="data:image/png;base64,LOGO" class="logo">');
    const plain = buildDatasheetHtml(LISTING, { logo: '', qr: QR });
    expect(plain).toContain('Red Angus Association of America');
    expect(plain).not.toContain('BlockTrust Network Partner');
  });

  test('program pictures come from the map, with a blank spot when there is none', () => {
    const html = buildDatasheetHtml(
      { ...LISTING, preconditioning: ['Program One', 'Program Two'] },
      { logo: '', qr: QR, icons: new Map([['program one', 'https://bt.example/a.png']]) },
    );
    expect(html).toContain('<img src="https://bt.example/a.png" class="pic"><span>Program One</span>');
    expect(html).toContain('<span class="nopic"></span><span>Program Two</span>');
  });

  test('helpers', () => {
    expect(tagRange('1', '9')).toBe('1-9');
    expect(tagRange('5', '5')).toBe('5');
    expect(tagRange('', '7')).toBe('7');
    expect(tagRange(null, null)).toBe('');
    expect(fmtDate('2026-01-05')).toBe('01/05/2026');
    expect(fmtDate(null)).toBe('');
    expect(breedText({ breeds: ['A', 'B'], breedMode: null })).toBe('A, B');
    expect(breedText({ breeds: ['A'], breedMode: 'head', breedDetails: [{ name: 'A', amount: 12 }] })).toBe('A (12 head)');
  });
});

// A stand-in for wkhtmltopdf: reads the page, then writes a file where the last argument says.
function fakeSpawn({ pdf = '%PDF-1.4 fake', code = 0, hang = false, seen = {} } = {}) {
  return (bin, args) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = jest.fn();
    let html = '';
    child.stdin = new EventEmitter();
    child.stdin.end = (chunk) => {
      html += chunk;
      seen.bin = bin;
      seen.args = args;
      seen.html = html;
      if (hang) return;
      setImmediate(() => {
        if (pdf != null) fs.writeFileSync(args[args.length - 1], pdf);
        else child.stderr.emit('data', Buffer.from('boom'));
        child.emit('close', code);
      });
    };
    return child;
  };
}

describe('turning the page into a PDF', () => {
  test('sends the page in and hands back the PDF, leaving no temporary file', async () => {
    const seen = {};
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsx-'));
    const pdf = await renderPdf('<p>hi</p>', { bin: 'wk', spawnFn: fakeSpawn({ seen }), tmpDir });
    expect(pdf.toString()).toBe('%PDF-1.4 fake');
    expect(seen.bin).toBe('wk');
    expect(seen.html).toBe('<p>hi</p>');
    expect(seen.args).toContain('--disable-javascript');
    expect(seen.args).toContain('--disable-local-file-access');
    expect(seen.args).toContain('Letter');
    await new Promise((r) => setTimeout(r, 30));
    expect(fs.readdirSync(tmpDir)).toEqual([]);
  });

  test('a picture that would not load (exit 1) still gives the PDF', async () => {
    const pdf = await renderPdf('<p>hi</p>', { bin: 'wk', spawnFn: fakeSpawn({ code: 1 }) });
    expect(pdf.length).toBeGreaterThan(5);
  });

  test('no PDF made is an error', async () => {
    await expect(renderPdf('<p>hi</p>', { bin: 'wk', spawnFn: fakeSpawn({ pdf: null, code: 2 }) })).rejects.toThrow(/failed \(2\).*boom/);
  });

  test('a stuck program is stopped', async () => {
    const child = { kill: jest.fn() };
    const spawnFn = (...a) => Object.assign(fakeSpawn({ hang: true })(...a), child);
    await expect(renderPdf('<p>hi</p>', { bin: 'wk', spawnFn, timeoutMs: 20 })).rejects.toThrow(/timed out/);
  });

  test('only a few run at once', async () => {
    const gate = createGate(2);
    let running = 0;
    let peak = 0;
    const task = async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 15));
      running -= 1;
      return 1;
    };
    await Promise.all([1, 2, 3, 4, 5].map(() => gate(task)));
    expect(peak).toBe(2);
  });
});

describe('the data sheet builder', () => {
  const config = { wkhtmltopdfPath: 'wk', siteUrl: 'https://raa.example/', marketInsightsUrl: 'https://bt.example', datasheetLogoPath: path.join(os.tmpdir(), 'no-such-logo.png') };

  test('the QR code points at the listing page on this site', async () => {
    const qr = { toDataURL: jest.fn(async () => QR) };
    const seen = {};
    const ds = createDatasheet({ config, ref: { available: () => false }, spawnFn: fakeSpawn({ seen }), qr });
    await ds.build(LISTING);
    expect(qr.toDataURL.mock.calls[0][0]).toBe('https://raa.example/feeder/42');
    expect(seen.html).toContain(QR);
  });

  test('program pictures are looked up in BlockTrust lists, from BlockTrust address', async () => {
    const seen = {};
    const ref = { available: () => true, programs: async () => [{ name: 'Program One', type: 'PC', image: 'p1.png' }] };
    const ds = createDatasheet({ config, ref, spawnFn: fakeSpawn({ seen }), qr: { toDataURL: async () => QR } });
    await ds.build(LISTING);
    expect(seen.html).toContain('https://bt.example/blocktrust_v2/images/logos/p1.png');
  });

  test('a failed picture lookup does not stop the sheet', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const ref = { available: () => true, programs: async () => { throw new Error('down'); } };
    const ds = createDatasheet({ config, ref, spawnFn: fakeSpawn(), qr: { toDataURL: async () => QR } });
    await expect(ds.build(LISTING)).resolves.toBeDefined();
    console.error.mockRestore();
  });

  test('the logo file is read when it is there', async () => {
    const logoPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dsl-')), 'raaa-logo.png');
    fs.writeFileSync(logoPath, Buffer.from('PNGDATA'));
    const seen = {};
    const ds = createDatasheet({ config: { ...config, datasheetLogoPath: logoPath }, ref: { available: () => false }, spawnFn: fakeSpawn({ seen }), qr: { toDataURL: async () => QR } });
    await ds.build(LISTING);
    expect(seen.html).toContain('data:image/png;base64,' + Buffer.from('PNGDATA').toString('base64'));
  });

  test('the Red Angus logo that ships with the portal is found and read', async () => {
    const seen = {};
    const real = require('../src/config');
    expect(fs.existsSync(real.datasheetLogoPath)).toBe(true);
    const ds = createDatasheet({ config: { ...config, datasheetLogoPath: real.datasheetLogoPath }, ref: { available: () => false }, spawnFn: fakeSpawn({ seen }), qr: { toDataURL: async () => QR } });
    await ds.build(LISTING);
    expect(seen.html).toContain('<img src="data:image/svg+xml;base64,');
    expect(seen.html).not.toContain('class="fallback"');
  });

  test('available() says no when the program is missing at a full path', () => {
    const missing = path.resolve(os.tmpdir(), 'definitely', 'not', 'here', 'wkhtmltopdf.exe');
    expect(createDatasheet({ config: { ...config, wkhtmltopdfPath: missing } }).available()).toBe(false);
    expect(createDatasheet({ config: { ...config, wkhtmltopdfPath: '' } }).available()).toBe(false);
    expect(createDatasheet({ config }).available()).toBe(true);
  });
});

// ---- the download route -----------------------------------------------------------------

function row(over = {}) {
  return {
    id: 7,
    owner_id: 1,
    owner_name: 'Pat Barfield',
    status: 'approved',
    group_id: 'BARFIELD100',
    group_id_optout: false,
    headline: '60 steers',
    steer_count: 60,
    heifer_count: 0,
    head_count: 60,
    breeds: ['Red Angus'],
    breed_amounts: [null],
    programs: [],
    vaccinations: [],
    marketing_method: 'off_ranch',
    marketing_date: '2026-11-15',
    state: 'TX',
    city: 'Bryan',
    zip: '77845',
    contact_name: 'Pat',
    contact_phone: '(979) 555-0100',
    contact_email: 'pat@example.com',
    ...over,
  };
}

function makeApp({ rows = [row()], datasheet } = {}) {
  const feederListings = {
    get: async (id) => rows.find((r) => String(r.id) === String(id)) || null,
    countByOwner: async () => 0,
  };
  const sheet = datasheet || {
    available: () => true,
    filename: (l) => `RedAngus_FeederDataSheet_${l.id}.pdf`,
    build: jest.fn(async () => Buffer.from('%PDF-1.4 test')),
  };
  const app = createApp({
    db: { isConfigured: () => true, ping: async () => true },
    config: { jwtSecret: SECRET },
    users: {
      findById: async (id) => ({ 1: { id: 1, role: 'member', is_active: true }, 2: { id: 2, role: 'staff', is_active: true }, 3: { id: 3, role: 'member', is_active: true } }[id] || null),
    },
    barns: { available: () => false },
    listings: {},
    feeders: {},
    ref: { available: () => false },
    feederListings,
    breedingListings: { countByOwner: async () => 0 },
    savedFilters: {},
    media: {},
    datasheet: sheet,
    now: () => NOW.getTime(),
  });
  return { app, sheet };
}

describe('GET /api/feeder-listings/:id/datasheet', () => {
  test('a signed-in member gets the PDF as a download', async () => {
    const { app, sheet } = makeApp();
    const res = await request(app).get('/api/feeder-listings/7/datasheet').set('Authorization', tok(3, 'member'));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toBe('attachment; filename="RedAngus_FeederDataSheet_7.pdf"');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.body.toString()).toBe('%PDF-1.4 test');
    expect(sheet.build).toHaveBeenCalledTimes(1);
  });

  test('a visitor who is not signed in is turned away, nothing is built', async () => {
    const { app, sheet } = makeApp();
    const res = await request(app).get('/api/feeder-listings/7/datasheet');
    expect(res.status).toBe(401);
    expect(sheet.build).not.toHaveBeenCalled();
  });

  test('the sheet is built the way a member sees the listing: no zip code, hidden group ID stays hidden', async () => {
    const { app, sheet } = makeApp({ rows: [row({ group_id_optout: true })] });
    await request(app).get('/api/feeder-listings/7/datasheet').set('Authorization', tok(1, 'member'));
    const built = sheet.build.mock.calls[0][0];
    expect(built.zip).toBeUndefined();
    expect(built.groupId).toBeNull();
    expect(built.contactEmail).toBe('pat@example.com');
  });

  test('a listing that is not approved is open only to its owner and staff', async () => {
    const pending = row({ status: 'pending' });
    const { app } = makeApp({ rows: [pending] });
    expect((await request(app).get('/api/feeder-listings/7/datasheet').set('Authorization', tok(3, 'member'))).status).toBe(404);
    expect((await request(app).get('/api/feeder-listings/7/datasheet').set('Authorization', tok(1, 'member'))).status).toBe(200);
    expect((await request(app).get('/api/feeder-listings/7/datasheet').set('Authorization', tok(2, 'staff'))).status).toBe(200);
  });

  test('unknown or odd ids are not found', async () => {
    const { app } = makeApp();
    expect((await request(app).get('/api/feeder-listings/99/datasheet').set('Authorization', tok(1, 'member'))).status).toBe(404);
    expect((await request(app).get('/api/feeder-listings/abc/datasheet').set('Authorization', tok(1, 'member'))).status).toBe(404);
  });

  test('503 when wkhtmltopdf is not installed, 502 when the PDF could not be made', async () => {
    const off = makeApp({ datasheet: { available: () => false } });
    expect((await request(off.app).get('/api/feeder-listings/7/datasheet').set('Authorization', tok(1, 'member'))).status).toBe(503);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const broken = makeApp({ datasheet: { available: () => true, filename: () => 'x.pdf', build: async () => { throw new Error('nope'); } } });
    const res = await request(broken.app).get('/api/feeder-listings/7/datasheet').set('Authorization', tok(1, 'member'));
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('datasheet_failed');
    console.error.mockRestore();
  });

  test('61st request in an hour from one person is refused', async () => {
    const { app } = makeApp();
    let last;
    for (let i = 0; i < 61; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      last = await request(app).get('/api/feeder-listings/7/datasheet').set('Authorization', tok(1, 'member'));
    }
    expect(last.status).toBe(429);
  });
});

// ---- with the real wkhtmltopdf, when it is installed on this machine ----------------------
const hasWk = (() => {
  try {
    return spawnSync('wkhtmltopdf', ['--version'], { windowsHide: true }).status === 0;
  } catch (e) {
    return false;
  }
})();

(hasWk ? describe : describe.skip)('real wkhtmltopdf', () => {
  test('makes a one page PDF from a full listing', async () => {
    const ds = createDatasheet({
      config: { wkhtmltopdfPath: 'wkhtmltopdf', siteUrl: 'https://raa.example', marketInsightsUrl: 'https://bt.example', datasheetLogoPath: '/none.png' },
      ref: { available: () => false },
    });
    const pdf = await ds.build(LISTING);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect((pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length).toBe(1);
  }, 60000);
});
