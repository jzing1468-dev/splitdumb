const { jwtVerify } = require('jose');

// Use the SAME secret as auth.johnzhong.win shared auth service
const AUTH_SECRET = process.env.AUTH_SECRET || 'shared-auth-secret-prod-2026';
const SECRET = new TextEncoder().encode(AUTH_SECRET);

// Shared auth service URL
const AUTH_SERVICE = process.env.AUTH_SERVICE || 'https://auth.johnzhong.win';

// The shared auth service uses this cookie name on .johnzhong.win
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