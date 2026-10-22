/**
 * Platform admin (developer/owner) authentication, separate from shopkeeper auth.
 * Credentials come only from ADMIN_USERNAME / ADMIN_PASSWORD; if they are missing,
 * admin login is disabled. Admin tokens are signed with a different key than shop
 * tokens, so a shop JWT can never pass adminMiddleware.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { SECRET } = require('./middleware');

const MIN_PASSWORD_LENGTH = 8;
const TOKEN_TTL = '12h';
const AUDIENCE = 'antarya-platform-admin';
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const failures = new Map();

function adminConfig() {
  const username = (process.env.ADMIN_USERNAME || '').trim();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!username || !password) {
    return { enabled: false, reason: 'Admin login is disabled. Set ADMIN_USERNAME and ADMIN_PASSWORD in server/.env and restart the server.' };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { enabled: false, reason: `Admin login is disabled. ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  return { enabled: true, username, password };
}

// Changing ADMIN_PASSWORD invalidates every issued admin token.
function adminSecret(config) {
  if (process.env.ADMIN_JWT_SECRET) return process.env.ADMIN_JWT_SECRET;
  return crypto.createHash('sha256').update(`${SECRET}|platform-admin|${config.password}`).digest('hex');
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function tooManyFailures(ip) {
  const entry = failures.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.first > FAILURE_WINDOW_MS) {
    failures.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

function recordFailure(ip) {
  const entry = failures.get(ip);
  if (!entry || Date.now() - entry.first > FAILURE_WINDOW_MS) failures.set(ip, { count: 1, first: Date.now() });
  else entry.count += 1;
}

function adminLogin(req, res) {
  const config = adminConfig();
  if (!config.enabled) return res.status(503).json({ error: config.reason });

  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  if (tooManyFailures(ip)) {
    return res.status(429).json({ error: 'Too many failed admin login attempts. Try again in 15 minutes.' });
  }

  const { username, password } = req.body || {};
  const userOk = safeEqual(username || '', config.username);
  const passOk = safeEqual(password || '', config.password);
  if (!userOk || !passOk) {
    recordFailure(ip);
    console.warn(`Admin login failed from ${ip}`);
    return res.status(401).json({ error: 'Invalid admin username or password' });
  }

  failures.delete(ip);
  const token = jwt.sign({ role: 'platform_admin', sub: config.username }, adminSecret(config), { expiresIn: TOKEN_TTL, audience: AUDIENCE });
  res.json({ token, username: config.username, expiresIn: TOKEN_TTL });
}

function adminMiddleware(req, res, next) {
  const config = adminConfig();
  if (!config.enabled) return res.status(503).json({ error: config.reason });

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Admin authentication required' });

  try {
    const decoded = jwt.verify(authHeader.slice(7), adminSecret(config), { audience: AUDIENCE });
    if (decoded.role !== 'platform_admin' || decoded.sub !== config.username) {
      return res.status(403).json({ error: 'Admin access denied' });
    }
    req.adminUser = decoded.sub;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired admin session' });
  }
}

module.exports = { adminLogin, adminMiddleware, adminConfig };
