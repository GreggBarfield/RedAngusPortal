'use strict';
const { Pool } = require('pg');

// Connections to BTN's catalog database. Created lazily and only when the
// matching URL is set, so a missing value never crashes the server.
function createBtn(config) {
  let readPool = null;
  let writePool = null;
  let refPool = null;
  return {
    canRead: () => Boolean(config.barnsDatabaseUrl),
    canWrite: () => Boolean(config.barnsWriteDatabaseUrl),
    canRef: () => Boolean(config.refDatabaseUrl),
    read: {
      query(text, params) {
        if (!config.barnsDatabaseUrl) throw new Error('BARNS_DATABASE_URL is not set');
        if (!readPool) readPool = new Pool({ connectionString: config.barnsDatabaseUrl, max: 4 });
        return readPool.query(text, params);
      },
    },
    write: {
      connect() {
        if (!config.barnsWriteDatabaseUrl) throw new Error('BARNS_WRITE_DATABASE_URL is not set');
        if (!writePool) writePool = new Pool({ connectionString: config.barnsWriteDatabaseUrl, max: 2 });
        return writePool.connect();
      },
    },
    // Pick lists, zip codes, and adding vaccine products / auction markets.
    ref: {
      query(text, params) {
        if (!config.refDatabaseUrl) throw new Error('REF_DATABASE_URL is not set');
        if (!refPool) refPool = new Pool({ connectionString: config.refDatabaseUrl, max: 4 });
        return refPool.query(text, params);
      },
    },
    async close() {
      if (readPool) await readPool.end();
      if (writePool) await writePool.end();
      if (refPool) await refPool.end();
      readPool = null;
      writePool = null;
      refPool = null;
    },
  };
}

module.exports = { createBtn };
