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

// Runs fn(client) inside one transaction; any error rolls everything back.
async function transaction(fn) {
  const p = getPool();
  if (!p) throw new Error('DATABASE_URL is not set');
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (e) {
      /* connection already gone */
    }
    throw err;
  } finally {
    client.release();
  }
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { query, transaction, ping, isConfigured, close };
