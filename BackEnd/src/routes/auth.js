'use strict';
const express = require('express');
const {
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  hashPassword,
  checkPassword,
  signToken,
  publicUser,
  createRequireAuth,
} = require('../auth');
const { createLimiter } = require('../rateLimit');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MEMBERSHIP_RE = /^[A-Za-z0-9-]{1,20}$/;

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

// Returns { values } when the input is good, or { errors } with a message per field.
function validateRegistration(body) {
  const errors = {};
  const email = str(body.email).toLowerCase();
  const displayName = str(body.displayName);
  const membershipNumber = str(body.membershipNumber);
  const password = typeof body.password === 'string' ? body.password : '';

  if (!EMAIL_RE.test(email) || email.length > 254) errors.email = 'Enter a valid email address.';
  if (displayName.length < 1 || displayName.length > 100) errors.displayName = 'Enter your name (up to 100 characters).';
  if (!MEMBERSHIP_RE.test(membershipNumber)) {
    errors.membershipNumber = 'Enter your Red Angus membership number (letters, numbers and dashes, up to 20).';
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  } else if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    errors.password = `Use no more than ${MAX_PASSWORD_BYTES} bytes (about ${MAX_PASSWORD_BYTES} plain characters).`;
  }
  if (Object.keys(errors).length > 0) return { errors };
  return { values: { email, displayName, membershipNumber, password } };
}

function createAuthRouter({ users, config, now }) {
  const router = express.Router();
  const secret = config.jwtSecret;
  const usable = Boolean(secret) && secret.length >= 32;
  const requireAuth = createRequireAuth({ users, secret: usable ? secret : '' });

  // Failed logins per email: 5 in 15 minutes, then a 15 minute wait.
  const loginFailures = createLimiter({ max: 5, windowMs: 15 * 60 * 1000, now });
  // Sign-ups per address: generous, because the server may see one shared address.
  const signups = createLimiter({ max: 30, windowMs: 60 * 60 * 1000, now });

  router.use((req, res, next) => {
    if (!usable) return res.status(503).json({ error: 'auth_not_configured' });
    return next();
  });

  router.post('/register', async (req, res, next) => {
    try {
      const ipKey = req.ip || 'unknown';
      if (signups.isBlocked(ipKey)) return res.status(429).json({ error: 'too_many_requests' });
      signups.record(ipKey);

      const { values, errors } = validateRegistration(req.body || {});
      if (errors) return res.status(400).json({ error: 'validation', fields: errors });

      const passwordHash = await hashPassword(values.password);
      let user;
      try {
        user = await users.create({
          email: values.email,
          passwordHash,
          displayName: values.displayName,
          membershipNumber: values.membershipNumber,
        });
      } catch (err) {
        if (err && err.code === '23505') {
          return res.status(409).json({ error: 'email_taken', fields: { email: 'That email already has an account.' } });
        }
        throw err;
      }
      return res.status(201).json({ token: signToken(user, secret), user: publicUser(user) });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/login', async (req, res, next) => {
    try {
      const body = req.body || {};
      const email = str(body.email).toLowerCase();
      const password = typeof body.password === 'string' ? body.password : '';
      if (!email || !password) return res.status(400).json({ error: 'validation' });
      if (loginFailures.isBlocked(email)) return res.status(429).json({ error: 'too_many_requests' });

      const user = await users.findByEmail(email);
      const ok = await checkPassword(password, user && user.password_hash);
      if (!user || !ok || !user.is_active) {
        loginFailures.record(email);
        return res.status(401).json({ error: 'invalid_credentials' });
      }
      loginFailures.reset(email);
      await users.touchLogin(user.id);
      return res.json({ token: signToken(user, secret), user: publicUser(user) });
    } catch (err) {
      return next(err);
    }
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  return router;
}

module.exports = { createAuthRouter, validateRegistration };
