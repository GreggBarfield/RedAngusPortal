'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'migrations');
const LOCK_KEY = 4200001; // advisory lock so two runs cannot overlap

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function listMigrationFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort();
}

// Applies every migration file that has not been applied yet, in order.
// Each file runs in its own transaction. A file that was already applied
// and has since been edited is an error - never edit an applied migration.
async function runMigrations({ connectionString, dir = MIGRATIONS_DIR, log = console.log }) {
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const client = new Client({ connectionString });
  await client.connect();
  const applied = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      checksum   text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const done = new Map(
      (await client.query('SELECT name, checksum FROM schema_migrations')).rows.map((r) => [r.name, r.checksum]),
    );
    for (const file of listMigrationFiles(dir)) {
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      const sum = sha256(sql);
      if (done.has(file)) {
        if (done.get(file) !== sum) {
          throw new Error(`Migration ${file} was changed after it was applied`);
        }
        continue;
      }
      log(`applying ${file}`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [file, sum]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
      applied.push(file);
    }
    if (applied.length === 0) log('database is up to date');
    return applied;
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    } catch (e) {
      /* connection may already be closed */
    }
    await client.end();
  }
}

module.exports = { runMigrations, listMigrationFiles };

if (require.main === module) {
  const config = require('./config');
  runMigrations({ connectionString: config.databaseUrl })
    .then((applied) => {
      console.log(`done - ${applied.length} migration(s) applied`);
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
