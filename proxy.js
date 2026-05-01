const http = require('http');
const fs = require('fs');
const path = require('path');

// Lightweight reverse proxy for SplitDumb
// Serves static SPA files under /splitdumb/
// Proxies /splitdumb/api/ → backend on 3001

const PORT = 7780;
const BACKEND_PORT = 3001;
const BASE_PATH = '/splitdumb';
const STATIC_DIR = path.join(__dirname, 'client', 'dist');

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // API proxy: /splitdumb/api/v1/... → http://localhost:3001/api/v1/...
  if (url.pathname.startsWith(`${BASE_PATH}/api/`)) {
    const targetPath = url.pathname.replace(BASE_PATH, '');
    const proxyReq = http.request(
      {
        hostname: 'localhost',
        port: BACKEND_PORT,
        path: targetPath + url.search,
        method: req.method,
        headers: { ...req.headers, host: `localhost:${BACKEND_PORT}` },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );
    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Backend unavailable' }));
    });

    // Collect request body for POST/PATCH
    if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT') {
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

  // Static files: serve from client/dist
  let filePath;
  if (url.pathname === BASE_PATH || url.pathname === BASE_PATH + '/') {
    filePath = path.join(STATIC_DIR, 'index.html');
  } else if (url.pathname.startsWith(BASE_PATH + '/')) {
    // Strip /splitdumb/ prefix, serve from dist/
    const relativePath = url.pathname.slice(BASE_PATH.length + 1);
    filePath = path.join(STATIC_DIR, relativePath);
  } else {
    // Root requests — redirect to /splitdumb/
    res.writeHead(302, { Location: BASE_PATH + '/' });
    res.end();
    return;
  }

  // SPA fallback: if file doesn't exist, serve index.html (for client-side routing)
  if (!fs.existsSync(filePath)) {
    filePath = path.join(STATIC_DIR, 'index.html');
  }

  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
    res.end(content);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`SplitDumb proxy running on port ${PORT}`);
  console.log(`  Static: ${BASE_PATH}/ → ${STATIC_DIR}`);
  console.log(`  API:    ${BASE_PATH}/api/ → http://localhost:${BACKEND_PORT}/api/`);
});