'use strict';

const COLUMNS = `id, email, display_name, membership_number, membership_status,
  role, is_active, created_at, last_login_at`;

// All SQL for the users table lives here so routes stay simple and tests
// can swap in a fake.
function createUsersRepo(db) {
  return {
    async findByEmail(email) {
      const r = await db.query(
        `SELECT ${COLUMNS}, password_hash FROM users WHERE lower(email) = lower($1)`,
        [email],
      );
      return r.rows[0] || null;
    },

    async findById(id) {
      const r = await db.query(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
      return r.rows[0] || null;
    },

    // Throws an error with code '23505' if the email is already taken.
    async create({ email, passwordHash, displayName, membershipNumber }) {
      const r = await db.query(
        `INSERT INTO users (email, password_hash, display_name, membership_number)
         VALUES ($1, $2, $3, $4)
         RETURNING ${COLUMNS}`,
        [email, passwordHash, displayName, membershipNumber],
      );
      return r.rows[0];
    },

    async touchLogin(id) {
      await db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [id]);
    },
  };
}

module.exports = { createUsersRepo };
