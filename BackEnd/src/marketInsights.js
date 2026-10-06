'use strict';

// Local Market Insights comes from BlockTrust's own USDA market report service.
// The Red Angus site passes the request along (read only) so the browser only
// ever talks to this site.
const ZIP_RE = /^\d{5}$/;
const SLUG_RE = /^[A-Za-z0-9_-]{1,40}$/;
const DEFAULT_RADIUS = 200;
const MAX_RADIUS = 500;

function cleanRadius(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_RADIUS;
  return Math.min(n, MAX_RADIUS);
}

function createMarketInsights({ config, fetchFn = (...a) => fetch(...a), timeoutMs = 25000 }) {
  const base = String(config.marketInsightsUrl || '').replace(/\/+$/, '');
  return {
    available: () => base !== '',
    // Returns the service's own { ok, data } / { ok:false, error } answer.
    // Throws when the service cannot be reached or does not answer in JSON.
    async lookup({ zip, radius, slugId }) {
      let url = `${base}/api/usda-market-insights?zip=${encodeURIComponent(zip)}&radius=${cleanRadius(radius)}`;
      if (slugId) url += `&slug_id=${encodeURIComponent(slugId)}`;
      const res = await fetchFn(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
      const json = await res.json();
      if (!json || typeof json !== 'object' || typeof json.ok !== 'boolean') throw new Error('unexpected answer');
      return json.ok
        ? { ok: true, data: json.data }
        : { ok: false, error: typeof json.error === 'string' ? json.error.slice(0, 200) : 'No market data for that zip code.' };
    },
  };
}

module.exports = { createMarketInsights, ZIP_RE, SLUG_RE, cleanRadius };
