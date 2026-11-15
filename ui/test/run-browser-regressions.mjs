// Dependency-free headless runner for the actual React component regressions.
// Install client dependencies, then: BROWSER_BIN=/path/to/chromium npm run test:ui
import { createServer } from '../../client/node_modules/vite/dist/node/index.js';
import react from '../../client/node_modules/@vitejs/plugin-react/dist/index.js';
import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../..', import.meta.url));
let browserBin = process.env.BROWSER_BIN;
if (!browserBin) {
  for (const name of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
    for (const dir of (process.env.PATH || '').split(path.delimiter)) {
      const candidate = path.join(dir, name);
      try { await access(candidate, constants.X_OK); browserBin = candidate; break; } catch { /* next candidate */ }
    }
    if (browserBin) break;
  }
}
if (!browserBin) throw new Error('Set BROWSER_BIN to a Chromium/Chrome executable to run browser regressions.');

const profile = await mkdtemp(path.join(tmpdir(), 'splitdumb-ui-tests-'));
let server;
let chrome;
let socket;
try {
  server = await createServer({
    configFile: false, root, plugins: [react()],
    resolve: { alias: {
      'react-dom': path.join(root, 'client/node_modules/react-dom'),
      'react-router-dom': path.join(root, 'client/node_modules/react-router-dom'),
      '@splitdumb/ui': path.join(root, 'ui/src/index.js'),
      '@splitdumb/core': path.join(root, 'core/src'),
      react: path.join(root, 'client/node_modules/react'),
    } },
    // No API proxy: these component tests cannot mutate the production backend.
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  let browserError;
  chrome = spawn(browserBin, [
    '--headless=new', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });
  chrome.on('error', error => { browserError = error; });
  const deadline = Date.now() + 15000;
  let debugPort;
  while (!debugPort) {
    if (browserError) throw browserError;
    if (chrome.exitCode !== null) throw new Error(`Browser exited: ${chrome.exitCode}`);
    if (Date.now() > deadline) throw new Error('Browser did not start in 15 seconds');
    try { debugPort = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; }
    catch { await delay(50); }
  }
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  const target = targets.find(item => item.type === 'page');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let serial = 0;
  const pending = new Map();
  const events = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
    } else if (events.has(message.method)) {
      events.get(message.method)(message.params); events.delete(message.method);
    }
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 30000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  await cdp('Page.enable');
  const all = [];
  for (const [page, resultKey] of [['info-regressions', '__infoRegressionResults'], ['notes-regressions', 'notesRegressionResults'], ['group-refresh-regressions', 'groupRefreshRegressionResults']]) {
    const loaded = new Promise(resolve => events.set('Page.loadEventFired', resolve));
    await cdp('Page.navigate', { url: `${origin}/ui/test/${page}.html` });
    await Promise.race([loaded, delay(15000).then(() => { throw new Error(`Page failed to load: ${page}`); })]);
    const evaluated = await cdp('Runtime.evaluate', {
      expression: `new Promise((resolve,reject)=>{const deadline=Date.now()+15000;const check=()=>{if(window[${JSON.stringify(resultKey)}])return resolve(window[${JSON.stringify(resultKey)}]);if(Date.now()>deadline)return reject(new Error('Regression harness did not finish'));setTimeout(check,20);};check();})`,
      awaitPromise: true, returnByValue: true,
    });
    if (evaluated.exceptionDetails) throw new Error(JSON.stringify(evaluated.exceptionDetails));
    const results = evaluated.result.value;
    if (!Array.isArray(results) || results.length === 0) throw new Error(`No assertions from ${page}`);
    for (const result of results) console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}${result.error ? ': ' + result.error : ''}`);
    all.push(...results);
  }
  const failures = all.filter(result => !result.passed);
  console.log(`Browser regressions: ${all.length - failures.length}/${all.length} passed`);
  if (failures.length) process.exitCode = 1;
} finally {
  socket?.close();
  if (chrome && chrome.exitCode === null && chrome.pid) {
    await new Promise(resolve => { chrome.once('exit', resolve); chrome.kill(); });
  }
  await server?.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
