'use strict';

// A person's saved searches on the feeder and breeding search screens.
function createSavedFiltersRepo(db) {
  return {
    async list(ownerId, kind) {
      const r = await db.query(
        `SELECT id, kind, name, params, created_at FROM saved_filters
         WHERE owner_id = $1 AND ($2::text IS NULL OR kind = $2) ORDER BY kind, lower(name)`,
        [ownerId, kind || null],
      );
      return r.rows;
    },

    // Saving under an existing name replaces that search.
    async save(ownerId, kind, name, params) {
      const r = await db.query(
        `INSERT INTO saved_filters (owner_id, kind, name, params) VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (owner_id, kind, name) DO UPDATE SET params = EXCLUDED.params
         RETURNING id, kind, name, params, created_at`,
        [ownerId, kind, name, JSON.stringify(params)],
      );
      return r.rows[0];
    },

    async remove(ownerId, id) {
      const r = await db.query('DELETE FROM saved_filters WHERE id = $1 AND owner_id = $2 RETURNING id', [id, ownerId]);
      return r.rowCount === 1;
    },
  };
}

module.exports = { createSavedFiltersRepo };
