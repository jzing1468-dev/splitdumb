const { jwtVerify } = require('jose');

const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) throw new Error('AUTH_SECRET env var is required');
const SECRET = new TextEncoder().encode(AUTH_SECRET);

// Auth service URL — must be configured via AUTH_SERVICE env var
const AUTH_SERVICE = process.env.AUTH_SERVICE || 'https://auth.johnzhong.win';

// Auth service cookie name (configurable domain)
const COOKIE_NAME = 'johnzhong_session';

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(c => {
    const [key, ...rest] = c.trim().split('=');
    if (key) cookies[key] = rest.join('=');
  });
  return cookies;
}

async function verifySession(token) {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return { username: payload.username, role: payload.role };
  } catch {
    return null;
  }
}

// Express middleware: require admin role (from shared cookie)
function requireAdmin(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'Authentication required', authUrl: `${AUTH_SERVICE}/login` });
  }
  verifySession(token).then(user => {
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired session', authUrl: `${AUTH_SERVICE}/login` });
    }
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.user = user;
    next();
  }).catch(() => {
    res.status(401).json({ error: 'Authentication required', authUrl: `${AUTH_SERVICE}/login` });
  });
}

// Express middleware: require any authenticated user
function requireAuth(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'Authentication required', authUrl: `${AUTH_SERVICE}/login` });
  }
  verifySession(token).then(user => {
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired session', authUrl: `${AUTH_SERVICE}/login` });
    }
    req.user = user;
    next();
  }).catch(() => {
    res.status(401).json({ error: 'Authentication required', authUrl: `${AUTH_SERVICE}/login` });
  });
}

module.exports = {
  COOKIE_NAME,
  SECRET,
  AUTH_SERVICE,
  verifySession,
  parseCookies,
  requireAdmin,
  requireAuth,
};