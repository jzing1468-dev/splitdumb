// Combined proxy: serves both PokerWise and SplitDumb static frontends
// and proxies API calls to the combined backend on port 3000

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 7780;
const BACKEND_PORT = parseInt(process.env.BACKEND_PORT) || 3000;

const APPS = [
  { base: '/pokerwise', staticDir: path.join('/home/jzing/Projects/pokerwise', 'client', 'dist') },
  { base: '/splitdumb', staticDir: path.join('/home/jzing/Projects/splitdumb', 'client', 'dist') },
];

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function findApp(urlPath) {
  return APPS.find(a => urlPath === a.base || urlPath.startsWith(a.base + '/'));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const app = findApp(url.pathname);

  // No matching app — redirect to splitdumb (default landing)
  if (!app) {
    res.writeHead(302, { Location: '/splitdumb/' });
    res.end();
    return;
  }

  // API proxy: /{app}/api/... → http://localhost:3000/{app}/api/...
  if (url.pathname.startsWith(`${app.base}/api/`)) {
    const proxyReq = http.request(
      {
        hostname: 'localhost',
        port: BACKEND_PORT,
        path: url.pathname + url.search,
        method: req.method,
        headers: { ...req.headers, host: `localhost:${BACKEND_PORT}` },
      },
      (proxyRes) => {
        const headers = { ...proxyRes.headers };
        headers['cache-control'] = 'no-store, no-cache, must-revalidate, proxy-revalidate';
        headers['pragma'] = 'no-cache';
        headers['expires'] = '0';
        res.writeHead(proxyRes.statusCode, headers);
        proxyRes.pipe(res);
      }
    );
    proxyReq.on('error', () => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Backend unavailable' }));
    });

    const isMultipart = req.headers['content-type']?.includes('multipart/form-data');
    if ((req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT') && !isMultipart) {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        if (body) proxyReq.write(body);
        proxyReq.end();
      });
    } else {
      req.pipe(proxyReq);
    }
    return;
  }

  // Static files
  let filePath;
  if (url.pathname === app.base || url.pathname === app.base + '/') {
    filePath = path.join(app.staticDir, 'index.html');
  } else {
    const relativePath = url.pathname.slice(app.base.length + 1);
    filePath = path.join(app.staticDir, relativePath);
  }

  // SPA fallback
  if (!fs.existsSync(filePath)) {
    filePath = path.join(app.staticDir, 'index.html');
  }

  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(content);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Combined proxy running on port ${PORT}`);
  APPS.forEach(a => {
    console.log(`  ${a.base}/ → ${a.staticDir}`);
    console.log(`  ${a.base}/api/ → http://localhost:${BACKEND_PORT}${a.base}/api/`);
  });
});