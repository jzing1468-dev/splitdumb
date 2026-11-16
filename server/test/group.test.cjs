'use strict';
// Group PATCH (rename/passcode) API contract tests, exercised over real HTTP
// against the Express app backed by an isolated temp sql.js database (DB_PATH).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.AUTH_SECRET = 'test-auth-secret';
const DB_PATH = path.join(os.tmpdir(), `splitdumb-group-test-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = DB_PATH;

const db = require('../db');
const server = require('../index');
const { SignJWT } = require('jose');

let http;
let baseUrl;
let adminCookie;
let groupCode;

async function req(method, url, { body, headers } = {}) {
  const res = await fetch(`${baseUrl}${url}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(adminCookie ? { cookie: adminCookie } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON body */ }
  return { status: res.status, json };
}

before(async () => {
  await db.init();
  adminCookie = `johnzhong_session=${await new SignJWT({ username: 'tester', role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET))}`;
  http = server.app.listen(0, '127.0.0.1');
  await new Promise(r => http.once('listening', r));
  baseUrl = `http://127.0.0.1:${http.address().port}`;
  const g = await req('POST', '/api/v1/groups', { body: { name: 'Original Name' } });
  assert.equal(g.status, 201);
  groupCode = g.json.code;
});

after(async () => {
  if (http) await new Promise(r => http.close(r));
  for (const p of [DB_PATH, DB_PATH + '.tmp']) { try { fs.unlinkSync(p); } catch {} }
});

test('rename: trims, persists across GET, and logs the actor member', async () => {
  const m = await req('POST', `/api/v1/groups/${groupCode}/members`, { body: { name: 'Renamer' } });
  assert.equal(m.status, 201);

  const renamed = await req('PATCH', `/api/v1/groups/${groupCode}`, {
    body: { name: '  Tahoe Trip 2026  ' },
    headers: { 'x-member-id': m.json.id },
  });
  assert.equal(renamed.status, 200, JSON.stringify(renamed.json));
  assert.equal(renamed.json.name, 'Tahoe Trip 2026');
  assert.equal(renamed.json.code, groupCode);

  const viaGet = await req('GET', `/api/v1/groups/${groupCode}`);
  assert.equal(viaGet.json.name, 'Tahoe Trip 2026');

  // Audit attribution: X-Member-Id member appears on the update entry
  const audit = await req('GET', `/api/v1/groups/${groupCode}/audit`);
  const entry = audit.json.find(e => e.action === 'update' && e.entity_type === 'group');
  assert.ok(entry, 'rename recorded in audit log');
  assert.equal(entry.member_name, 'Renamer');
  assert.equal(entry.changes.name, 'Tahoe Trip 2026');
});

test('rename: invalid names -> 400, group unchanged', async () => {
  const before = (await req('GET', `/api/v1/groups/${groupCode}`)).json.name;
  const cases = [
    [{ name: '' }, 'empty string'],
    [{ name: '   ' }, 'whitespace only'],
    [{ name: 'x'.repeat(51) }, 'over 50 chars'],
    [{ name: 42 }, 'number'],
    [{ name: null }, 'null'],
    [{}, 'no recognized fields'],
  ];
  for (const [payload, label] of cases) {
    const r = await req('PATCH', `/api/v1/groups/${groupCode}`, { body: payload });
    assert.equal(r.status, 400, `${label} -> 400`);
    assert.equal(typeof r.json.error, 'string', `${label} -> JSON error`);
  }
  const afterGet = await req('GET', `/api/v1/groups/${groupCode}`);
  assert.equal(afterGet.json.name, before, 'failed renames leave the name unchanged');
});

test('rename: boundary length 50 applies; unknown group -> 404', async () => {
  const exact = 'y'.repeat(50);
  const ok = await req('PATCH', `/api/v1/groups/${groupCode}`, { body: { name: exact } });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.name, exact);

  assert.equal((await req('PATCH', '/api/v1/groups/NOPE00', { body: { name: 'x' } })).status, 404);
});

test('passcode-only update still works alongside the stricter validation', async () => {
  const r = await req('PATCH', `/api/v1/groups/${groupCode}`, { body: { passcode: '1234' } });
  assert.equal(r.status, 200);
  // passcode is never echoed back into the GET group response shape check:
  // the group payload includes passcode (existing behavior), only admin_token is stripped.
  assert.equal(r.json.passcode, '1234');
  const clear = await req('PATCH', `/api/v1/groups/${groupCode}`, { body: { passcode: '' } });
  assert.equal(clear.status, 200);
  assert.equal(clear.json.passcode, null);
});
