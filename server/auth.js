const { SignJWT, jwtVerify } = require('jose');
const { compareSync, hashSync } = require('bcryptjs');

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'atc-dashboard-secret-change-me-in-production'
);

const COOKIE_NAME = 'splitdumb_session';

// Decode dot-format bcrypt hash (same as ATC)
// "2b10xxxx.yyyy.zzzz" → "$2b$10$xxxxyyyyzzzz"
function decodeHash(dotFormat) {
  if (dotFormat.startsWith('$')) return dotFormat;
  const version = dotFormat.slice(0, 2);
  const cost = dotFormat.slice(2, 4);
  const body = dotFormat.slice(4);
  return `$${version}$${cost}$${body}`;
}

function getUsers() {
  const users = new Map();
  const adminHash = process.env.AUTH_ADMIN_HASH;
  if (adminHash) {
    users.set(process.env.AUTH_ADMIN_USER || 'admin', {
      passwordHash: decodeHash(adminHash),
      role: 'admin',
    });
  }
  const viewerHash = process.env.AUTH_VIEWER_HASH;
  if (viewerHash) {
    users.set(process.env.AUTH_VIEWER_USER || 'viewer', {
      passwordHash: decodeHash(viewerHash),
      role: 'viewer',
    });
  }
  // Fallback for local dev
  if (users.size === 0) {
    users.set('admin', { passwordHash: hashSync('admin', 10), role: 'admin' });
  }
  return users;
}

async function verifyLogin(username, password) {
  const users = getUsers();
  const user = users.get(username);
  if (!user) return null;
  if (!compareSync(password, user.passwordHash)) return null;
  return { username, role: user.role };
}

async function createSession(user) {
  return new SignJWT({ username: user.username, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET);
}

async function verifySession(token) {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return { username: payload.username, role: payload.role };
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(c => {
    const [key, ...rest] = c.trim().split('=');
    if (key) cookies[key] = rest.join('=');
  });
  return cookies;
}

// Express middleware: require admin role
function requireAdmin(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  verifySession(token).then(user => {
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.user = user;
    next();
  }).catch(() => {
    res.status(401).json({ error: 'Authentication required' });
  });
}

// Express middleware: require any authenticated user (admin or viewer)
function requireAuth(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  verifySession(token).then(user => {
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    req.user = user;
    next();
  }).catch(() => {
    res.status(401).json({ error: 'Authentication required' });
  });
}

module.exports = {
  COOKIE_NAME,
  SECRET,
  verifyLogin,
  createSession,
  verifySession,
  parseCookies,
  requireAdmin,
  requireAuth,
};