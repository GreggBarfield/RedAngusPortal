'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const BCRYPT_ROUNDS = 12;
// bcrypt only looks at the first 72 bytes, so longer passwords are refused
// instead of being silently cut short.
const MAX_PASSWORD_BYTES = 72;
const MIN_PASSWORD_LENGTH = 10;
const TOKEN_LIFETIME = '7d';

// Used to spend the same time on an unknown email as on a wrong password.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

function checkPassword(password, hash) {
  return bcrypt.compare(password, hash || DUMMY_HASH);
}

function signToken(user, secret) {
  return jwt.sign({ sub: String(user.id), role: user.role }, secret, {
    algorithm: 'HS256',
    expiresIn: TOKEN_LIFETIME,
  });
}

function verifyToken(token, secret) {
  return jwt.verify(token, secret, { algorithms: ['HS256'] });
}

// Public shape of a user. password_hash never leaves the server.
function publicUser(u) {
  return {
    id: String(u.id),
    email: u.email,
    displayName: u.display_name,
    membershipNumber: u.membership_number,
    membershipStatus: u.membership_status,
    role: u.role,
  };
}

function bearerToken(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer (.+)$/i.exec(h);
  return m ? m[1] : null;
}

// Loads the user from the database on every request, so a deactivated
// account or a changed role takes effect immediately.
function createRequireAuth({ users, secret }) {
  return async function requireAuth(req, res, next) {
    try {
      if (!secret) return res.status(503).json({ error: 'auth_not_configured' });
      const token = bearerToken(req);
      if (!token) return res.status(401).json({ error: 'unauthorized' });
      let payload;
      try {
        payload = verifyToken(token, secret);
      } catch (e) {
        return res.status(401).json({ error: 'unauthorized' });
      }
      const user = await users.findById(payload.sub);
      if (!user || !user.is_active) return res.status(401).json({ error: 'unauthorized' });
      req.user = user;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

function requireRole(...roles) {
  return function (req, res, next) {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    return next();
  };
}

module.exports = {
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  hashPassword,
  checkPassword,
  signToken,
  verifyToken,
  publicUser,
  createRequireAuth,
  requireRole,
};
