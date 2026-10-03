'use strict';
const { Pool } = require('pg');
const config = require('./config');

// The pool is created only when DATABASE_URL is set. A missing value must
// never crash the whole server at load time.
let pool = null;

function getPool() {
  if (!config.databaseUrl) return null;
  if (!pool) {
    pool = new Pool({ connectionString: config.databaseUrl, max: 10 });
  }
  return pool;
}

function isConfigured() {
  return Boolean(config.databaseUrl);
}

async function query(text, params) {
  const p = getPool();
  if (!p) throw new Error('DATABASE_URL is not set');
  return p.query(text, params);
}

async function ping() {
  const result = await query('SELECT 1 AS ok');
  return result.rows[0].ok === 1;
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { query, ping, isConfigured, close };
