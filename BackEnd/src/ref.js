'use strict';

// Pick lists and zip codes read live from BTN's catalog database through the
// raaaa_ref_rw login. That login can read these tables and add new vaccine
// products and auction markets - nothing else.
function likePattern(q) {
  return '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
}

const TTL_MS = 5 * 60 * 1000;

function createRefRepo({ btn, now = () => Date.now() }) {
  const cache = new Map();
  const ask = (text, params) => btn.ref.query(text, params);

  // The lists that never change per visitor are kept for a few minutes.
  async function cached(key, load) {
    const hit = cache.get(key);
    if (hit && now() - hit.at < TTL_MS) return hit.value;
    const value = await load();
    cache.set(key, { at: now(), value });
    return value;
  }

  return {
    available: () => btn.canRef(),
    clearCache: () => cache.clear(),

    // Red Angus entries first, then the rest in BTN's order.
    breeds() {
      return cached('breeds', async () => {
        const r = await ask('SELECT name FROM public.feeder_ref_breeds WHERE is_active ORDER BY sort_order, name');
        const names = r.rows.map((x) => x.name);
        const red = (n) => /^red angus/i.test(n);
        return [...names.filter(red), ...names.filter((n) => !red(n))];
      });
    },

    // type: 'PC' (preconditioning) or 'SP' (special program)
    programs(type) {
      return cached('programs', async () => {
        const r = await ask(
          `SELECT prog_name AS name, prog_type AS type, prog_image AS image
           FROM public.feeder_ref_programs WHERE is_active ORDER BY sort_order, prog_name`,
        );
        return r.rows.map((x) => ({ name: x.name, type: String(x.type).trim(), image: x.image }));
      }).then((all) => (type ? all.filter((p) => p.type === type) : all));
    },

    epdTraits() {
      return cached('epd', async () => {
        const r = await ask(
          `SELECT trait_code AS code, display_name AS name, unit, description, breed_assoc
           FROM public.ref_epd_traits WHERE COALESCE(is_active, true) ORDER BY sort_order, display_name`,
        );
        return r.rows;
      });
    },

    async vaccineProducts(q) {
      const params = [];
      let where = 'is_active';
      if (q) {
        params.push(likePattern(q));
        where += ' AND rx_name ILIKE $1';
      }
      const r = await ask(
        `SELECT id, rx_name AS name, rx_company AS company FROM public.feeder_ref_medications
         WHERE ${where} ORDER BY rx_name LIMIT 50`,
        params,
      );
      return r.rows;
    },

    async auctions(q) {
      const params = [];
      let where = 'auc_active';
      if (q) {
        params.push(likePattern(q));
        where += ' AND auc_name ILIKE $1';
      }
      const r = await ask(
        `SELECT id, auction_no AS "auctionNo", auc_name AS name, auc_zip AS zip FROM public.feeder_ref_auctions
         WHERE ${where} ORDER BY auc_name LIMIT 50`,
        params,
      );
      return r.rows;
    },

    async zip(zip) {
      const r = await ask(
        `SELECT zip, city, state_code AS state, lat::float8 AS lat, lon::float8 AS lon
         FROM public.zip_codes WHERE zip = $1`,
        [zip],
      );
      const row = r.rows[0];
      if (!row) return null;
      return { zip: String(row.zip).trim(), city: row.city, state: String(row.state).trim().toUpperCase(), lat: row.lat, lon: row.lon };
    },

    // Adds a vaccine / medication product BTN does not list yet. An existing
    // product with the same name (any capitalization) is returned instead.
    async addVaccineProduct({ name, company }) {
      const find = () =>
        ask(
          `SELECT id, rx_name AS name, rx_company AS company FROM public.feeder_ref_medications
           WHERE lower(rx_name) = lower($1) LIMIT 1`,
          [name],
        );
      const found = await find();
      if (found.rows[0]) return { created: false, product: found.rows[0] };
      const ins = await ask(
        `INSERT INTO public.feeder_ref_medications (rx_name, rx_company, is_custom) VALUES ($1, $2, true)
         ON CONFLICT (rx_name) DO NOTHING RETURNING id, rx_name AS name, rx_company AS company`,
        [name, company],
      );
      if (ins.rows[0]) return { created: true, product: ins.rows[0] };
      return { created: false, product: (await find()).rows[0] };
    },

    // Adds an auction market BTN does not list yet (no auction number).
    async addAuction({ name, zip }) {
      const find = () =>
        ask(
          `SELECT id, auction_no AS "auctionNo", auc_name AS name, auc_zip AS zip FROM public.feeder_ref_auctions
           WHERE lower(auc_name) = lower($1) ORDER BY auc_active DESC, id LIMIT 1`,
          [name],
        );
      const found = await find();
      if (found.rows[0]) return { created: false, auction: found.rows[0] };
      const ins = await ask(
        `INSERT INTO public.feeder_ref_auctions (auc_name, auc_zip, is_custom) VALUES ($1, $2, true)
         RETURNING id, auction_no AS "auctionNo", auc_name AS name, auc_zip AS zip`,
        [name, zip],
      );
      return { created: true, auction: ins.rows[0] };
    },
  };
}

module.exports = { createRefRepo };
