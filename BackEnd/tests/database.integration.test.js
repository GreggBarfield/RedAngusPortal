'use strict';
// Runs only when TEST_DATABASE_URL points at an EMPTY scratch database.
// It creates tables there. Never point it at the real raaaa database.
const { Client } = require('pg');
const { runMigrations } = require('../src/migrate');
const { createUsersRepo } = require('../src/users');

const url = process.env.TEST_DATABASE_URL;
const maybe = url ? describe : describe.skip;

maybe('migrations and users table (real Postgres)', () => {
  let client;
  const quiet = () => {};

  beforeAll(async () => {
    client = new Client({ connectionString: url });
    await client.connect();
    await client.query('DROP TABLE IF EXISTS users, schema_migrations CASCADE');
  });
  afterAll(async () => {
    await client.query('DROP TABLE IF EXISTS users, schema_migrations CASCADE');
    await client.end();
  });

  test('applies migrations once and is a no-op the second time', async () => {
    const first = await runMigrations({ connectionString: url, log: quiet });
    expect(first).toContain('001_users.sql');
    const second = await runMigrations({ connectionString: url, log: quiet });
    expect(second).toEqual([]);
  });

  test('users repo: create, find, duplicate email, defaults', async () => {
    const db = { query: (t, p) => client.query(t, p) };
    const repo = createUsersRepo(db);
    const u = await repo.create({
      email: 'rancher@example.com',
      passwordHash: 'x',
      displayName: 'Pat',
      membershipNumber: 'RA-1',
    });
    expect(u.role).toBe('member');
    expect(u.membership_status).toBe('unverified');
    expect(u.is_active).toBe(true);
    expect((await repo.findByEmail('RANCHER@EXAMPLE.COM')).id).toBe(u.id);
    expect((await repo.findById(u.id)).email).toBe('rancher@example.com');
    await expect(
      repo.create({ email: 'Rancher@Example.com', passwordHash: 'y', displayName: 'Other', membershipNumber: 'RA-2' }),
    ).rejects.toMatchObject({ code: '23505' });
    await repo.touchLogin(u.id);
    expect((await repo.findByEmail('rancher@example.com')).last_login_at).not.toBeNull();
  });

  test('database refuses a bad role', async () => {
    await expect(
      client.query("UPDATE users SET role = 'admin' WHERE email = 'rancher@example.com'"),
    ).rejects.toThrow();
  });
});
