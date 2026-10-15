'use strict';

const { createRefRepo } = require('../src/ref');

// Fake BTN login: answers by what the query is about.
function repoWith(handlers) {
  const queries = [];
  const query = async (text, params) => {
    queries.push({ text, params });
    for (const [match, rows] of handlers) {
      if (text.includes(match)) return { rows: typeof rows === 'function' ? rows(params) : rows };
    }
    return { rows: [] };
  };
  return { repo: createRefRepo({ btn: { canRef: () => true, ref: { query } } }), queries };
}

describe('auction markets carry the city and state of their zip', () => {
  test('the list asks for city and state, and the state comes back upper case without padding', async () => {
    const { repo, queries } = repoWith([
      ['FROM public.feeder_ref_auctions a', [
        { id: 1, auctionNo: 1, name: 'Bryan Livestock', zip: '77801', city: 'Bryan', state: 'tx ' },
        { id: 2, auctionNo: 3, name: 'No Zip Market', zip: null, city: null, state: null },
      ]],
    ]);
    const list = await repo.auctions('');
    expect(list).toEqual([
      { id: 1, auctionNo: 1, name: 'Bryan Livestock', zip: '77801', city: 'Bryan', state: 'TX' },
      { id: 2, auctionNo: 3, name: 'No Zip Market', zip: null, city: null, state: null },
    ]);
    expect(queries[0].text).toMatch(/zip_codes/);
    expect(queries[0].text).toMatch(/state_code/);
  });

  test('a market that is added comes back with its city and state', async () => {
    const { repo } = repoWith([
      ['INSERT INTO public.feeder_ref_auctions', [{ id: 9, auctionNo: null, name: 'Mid State Market', zip: '77845' }]],
      ['FROM public.zip_codes', [{ city: 'College Station', state: 'TX' }]],
    ]);
    const r = await repo.addAuction({ name: 'Mid State Market', zip: '77845' });
    expect(r.created).toBe(true);
    expect(r.auction).toEqual({ id: 9, auctionNo: null, name: 'Mid State Market', zip: '77845', city: 'College Station', state: 'TX' });
  });

  test('a market added with no zip has no city or state, and the zip table is not asked', async () => {
    const { repo, queries } = repoWith([['INSERT INTO public.feeder_ref_auctions', [{ id: 10, auctionNo: null, name: 'Another Market', zip: null }]]]);
    const r = await repo.addAuction({ name: 'Another Market', zip: null });
    expect(r.auction).toEqual({ id: 10, auctionNo: null, name: 'Another Market', zip: null, city: null, state: null });
    expect(queries.some((q) => q.text.includes('zip_codes'))).toBe(false);
  });

  test('a zip that is not in the zip table gives no city or state', async () => {
    const { repo } = repoWith([['INSERT INTO public.feeder_ref_auctions', [{ id: 11, auctionNo: null, name: 'Odd Market', zip: '59101' }]]]);
    const r = await repo.addAuction({ name: 'Odd Market', zip: '59101' });
    expect(r.auction).toMatchObject({ zip: '59101', city: null, state: null });
  });
});
