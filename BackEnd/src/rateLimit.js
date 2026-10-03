'use strict';

// Small in-memory limiter. It forgets everything when the server restarts,
// which is fine for slowing down password guessing.
function createLimiter({ max, windowMs, now = () => Date.now() }) {
  const hits = new Map();

  function prune(t) {
    for (const [key, list] of hits) {
      const fresh = list.filter((ts) => t - ts < windowMs);
      if (fresh.length === 0) hits.delete(key);
      else hits.set(key, fresh);
    }
  }

  return {
    // true when this key has used up its allowance
    isBlocked(key) {
      const t = now();
      const list = (hits.get(key) || []).filter((ts) => t - ts < windowMs);
      return list.length >= max;
    },
    record(key) {
      const t = now();
      if (hits.size > 5000) prune(t);
      const list = (hits.get(key) || []).filter((ts) => t - ts < windowMs);
      list.push(t);
      hits.set(key, list);
    },
    reset(key) {
      hits.delete(key);
    },
  };
}

module.exports = { createLimiter };
