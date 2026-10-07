'use strict';
const { parseCsv, splitPhone, readFeedlots, summarize, runImport } = require('../src/feedlotImport');

const HEADER = 'Feedlot Name,Contact,Address,City,State,Zip,Phone,Email,Website';

describe('parseCsv', () => {
  test('reads quoted fields with commas, quotes and new lines', () => {
    const rows = parseCsv('a,"b, c","say ""hi""","line1\nline2"\r\nd,,e,\r\n');
    expect(rows).toEqual([
      ['a', 'b, c', 'say "hi"', 'line1\nline2'],
      ['d', '', 'e', ''],
    ]);
  });
  test('ignores a byte order mark and blank lines', () => {
    expect(parseCsv('﻿a,b\n\n\nc,d')).toEqual([['a', 'b'], ['c', 'd']]);
  });
  test('last line without a new line is kept', () => {
    expect(parseCsv('a,b\nc,d')).toHaveLength(2);
  });
});

describe('splitPhone', () => {
  test('keeps several numbers together', () => {
    expect(splitPhone('(833) 450-1889; (520) 585-6936')).toEqual({ phone: '(833) 450-1889; (520) 585-6936', fax: null });
  });
  test('moves a fax number written into the phone cell', () => {
    expect(splitPhone('(806) 583-2131; (806) 290-0559; fax: (806) 668-4744')).toEqual({
      phone: '(806) 583-2131; (806) 290-0559',
      fax: '(806) 668-4744',
    });
  });
  test('empty is empty', () => {
    expect(splitPhone('')).toEqual({ phone: null, fax: null });
    expect(splitPhone(undefined)).toEqual({ phone: null, fax: null });
  });
});

describe('readFeedlots', () => {
  const csv = [
    HEADER,
    '"Pinal Feeding Co.-Maricopa","Earl Petznick","38351 W Cowtown Rd","Maricopa","AZ","85138","(602) 252-3467","info@pinalfeeding.com","www.pinalfeeding.com"',
    '"Dinklage","Roy","PO Box 1","Scotts Bluff","NE","69361","","royw@dinklagefeedyards.com; tyler@dinklagefeedyards.com",""',
    '"Golden Belt Feeders","Stan","PO Box 307","Saint John","KS","67576","(620) 549-3241","","www.goldenbeltfeeders.com; https://www.beefmarketinggroup.com"',
    '"Flint Rock","Levi","146 Cedar Glade Rd","Mount Vernon","AR","72111-9535","","",""',
    '"No State Yard","","","","","","","",""',
    '"Bad Email Yard","","","X","TX","","","not-an-email",""',
  ].join('\n');

  test('good rows come through tidied; bad rows are listed with their line number', () => {
    const r = readFeedlots(csv);
    expect(r.total).toBe(6);
    expect(r.feedlots).toHaveLength(4);
    expect(r.problems.map((p) => p.line)).toEqual([6, 7]);
    expect(r.problems[0].messages.join(' ')).toMatch(/state/);
    expect(r.problems[1].messages.join(' ')).toMatch(/not-an-email/);
    const dink = r.feedlots.find((f) => f.name === 'Dinklage');
    expect(dink.emails).toEqual(['royw@dinklagefeedyards.com', 'tyler@dinklagefeedyards.com']);
    expect(dink.phone).toBeNull();
    expect(r.feedlots.find((f) => f.name === 'Golden Belt Feeders').website).toBe('www.goldenbeltfeeders.com');
    expect(r.feedlots.find((f) => f.name === 'Flint Rock').zip).toBe('72111-9535');
  });

  test('summary counts', () => {
    expect(summarize(readFeedlots(csv).feedlots)).toEqual({ feedlots: 4, withEmail: 2, emailAddresses: 3, withFax: 0, states: 4 });
  });

  test('a file with a column missing is refused', () => {
    expect(() => readFeedlots('Feedlot Name,City\nx,y')).toThrow(/columns are missing/);
  });
  test('an empty file is refused', () => {
    expect(() => readFeedlots('')).toThrow(/empty/);
  });
});

describe('runImport', () => {
  test('passes the good rows to the repo and reports the counts', async () => {
    const calls = [];
    const repo = {
      async bulkInsert(rows, userId, opts) {
        calls.push({ n: rows.length, userId, opts });
        return { inserted: rows.length - 1, skipped: 1 };
      },
    };
    const text = [HEADER, '"A","","","C","TX","","","a@x.com",""', '"B","","","D","TX","","","",""'].join('\n');
    const r = await runImport({ text, repo, userId: 2, dryRun: true });
    expect(calls).toEqual([{ n: 2, userId: 2, opts: { dryRun: true } }]);
    expect(r).toMatchObject({ total: 2, inserted: 1, skipped: 1, dryRun: true });
    expect(r.summary.withEmail).toBe(1);
  });
});
