'use strict';
// Notes API contract tests, exercised over real HTTP against the Express app
// backed by an isolated temp sql.js database (DB_PATH env).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.AUTH_SECRET = 'test-auth-secret';
const DB_PATH = path.join(os.tmpdir(), `splitdumb-notes-test-${process.pid}-${Date.now()}.db`);
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

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function assertNoteShape(n) {
  assert.equal(typeof n.id, 'string');
  assert.ok(n.title === null || typeof n.title === 'string', 'title is string|null');
  assert.equal(typeof n.body, 'string');
  assert.equal(typeof n.pinned, 'boolean', 'pinned is a JSON boolean');
  assert.ok(n.author_member_id === null || typeof n.author_member_id === 'string');
  assert.equal(typeof n.author_name, 'string');
  assert.ok(n.author_name.length > 0, 'author_name non-null fallback');
  assert.match(n.created_at, ISO_RE, 'created_at is ISO 8601 UTC');
  assert.match(n.updated_at, ISO_RE, 'updated_at is ISO 8601 UTC');
  assert.equal(typeof n.revision, 'number');
  assert.equal(Number.isInteger(n.revision), true);
}

async function addMember(name) {
  const r = await req('POST', `/api/v1/groups/${groupCode}/members`, { body: { name } });
  assert.equal(r.status, 201, `addMember ${name}`);
  return r.json;
}

function asMember(member) {
  return { 'x-member-id': member.id };
}

async function createNote(member, payload) {
  const r = await req('POST', `/api/v1/groups/${groupCode}/notes`, { body: payload, headers: asMember(member) });
  assert.equal(r.status, 201, `createNote: ${JSON.stringify(r.json)}`);
  return r.json;
}

before(async () => {
  await db.init();
  adminCookie = `johnzhong_session=${await new SignJWT({ username: 'tester', role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET))}`;
  http = server.app.listen(0, '127.0.0.1');
  await new Promise(r => http.once('listening', r));
  baseUrl = `http://127.0.0.1:${http.address().port}`;
  const g = await req('POST', '/api/v1/groups', { body: { name: 'Notes Test Group' } });
  assert.equal(g.status, 201);
  groupCode = g.json.code;
});

after(async () => {
  if (http) await new Promise(r => http.close(r));
  for (const p of [DB_PATH, DB_PATH + '.tmp']) { try { fs.unlinkSync(p); } catch {} }
});

test('note CRUD happy path against the API contract', async () => {
  const alice = await addMember('Alice');
  const created = await req('POST', `/api/v1/groups/${groupCode}/notes`, {
    body: { title: '  Check-in info  ', body: '  Door code is 1234  ', pinned: true },
    headers: asMember(alice),
  });
  assert.equal(created.status, 201);
  const n = created.json;
  assertNoteShape(n);
  assert.equal(n.title, 'Check-in info');           // trimmed
  assert.equal(n.body, 'Door code is 1234');        // trimmed
  assert.equal(n.pinned, true);                    // real boolean, not 1
  assert.equal(n.author_member_id, alice.id);
  assert.equal(n.author_name, 'Alice');
  assert.equal(n.revision, 1);                      // new rows start at 1
  assert.equal(n.created_at, n.updated_at);

  // Group GET returns the note in contract shape
  const grp = await req('GET', `/api/v1/groups/${groupCode}`);
  const viaGroup = grp.json.notes.find(x => x.id === n.id);
  assert.ok(viaGroup, 'note visible in group GET');
  assert.equal(viaGroup.author_name, 'Alice');
  assert.equal(viaGroup.pinned, true);
  assert.equal(viaGroup.revision, 1);

  // PATCH with matching expected_revision applies and bumps revision+updated_at
  const patched = await req('PATCH', `/api/v1/groups/${groupCode}/notes/${n.id}`, {
    body: { body: 'Door code is 5678', expected_revision: 1 },
  });
  assert.equal(patched.status, 200);
  assertNoteShape(patched.json);
  assert.equal(patched.json.body, 'Door code is 5678');
  assert.equal(patched.json.title, 'Check-in info'); // untouched field preserved
  assert.equal(patched.json.revision, 2);
  assert.notEqual(patched.json.updated_at, n.updated_at);

  // Stale expected_revision now conflicts
  const conflict = await req('PATCH', `/api/v1/groups/${groupCode}/notes/${n.id}`, {
    body: { body: 'nope', expected_revision: 1 },
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.json.error, 'Note was edited by someone else');
  assertNoteShape(conflict.json.note);
  assert.equal(conflict.json.note.revision, 2, '409 returns the current note');
  assert.equal(conflict.json.note.body, 'Door code is 5678');

  // DELETE returns {ok:true}; note gone from group GET
  const del = await req('DELETE', `/api/v1/groups/${groupCode}/notes/${n.id}`);
  assert.equal(del.status, 200);
  assert.deepEqual(del.json, { ok: true });
  const after = await req('GET', `/api/v1/groups/${groupCode}`);
  assert.equal(after.json.notes.find(x => x.id === n.id), undefined);
});

test('create: empty/absent title becomes null, pinned defaults to false', async () => {
  const m = await addMember('Titleless');
  const n = await createNote(m, { title: '   ', body: 'body only' });
  assert.equal(n.title, null);
  assert.equal(n.pinned, false);
  assert.equal(n.revision, 1);
});

test('create returns 400 for every invalid field type', async () => {
  const m = await addMember('Validator');
  const cases = [
    [{}, 'body missing'],
    [{ body: null }, 'body null'],
    [{ body: 42 }, 'body number'],
    [{ body: ['array'] }, 'body array'],
    [{ body: '   ' }, 'body whitespace only'],
    [{ body: 'x'.repeat(4001) }, 'body over 4000'],
    [{ body: 'ok', title: null }, 'title null'],
    [{ body: 'ok', title: 7 }, 'title number'],
    [{ body: 'ok', title: 'x'.repeat(101) }, 'title over 100'],
    [{ body: 'ok', pinned: 'yes' }, 'pinned truthy string'],
    [{ body: 'ok', pinned: 1 }, 'pinned number'],
    [{ body: 'ok', pinned: null }, 'pinned null'],
  ];
  for (const [payload, label] of cases) {
    const r = await req('POST', `/api/v1/groups/${groupCode}/notes`, { body: payload, headers: asMember(m) });
    assert.equal(r.status, 400, `${label} -> 400`);
    assert.equal(typeof r.json.error, 'string', `${label} -> JSON error`);
  }
  // missing author header
  const noHeader = await req('POST', `/api/v1/groups/${groupCode}/notes`, { body: { body: 'x' } });
  assert.equal(noHeader.status, 400);
  // unknown author
  const badAuthor = await req('POST', `/api/v1/groups/${groupCode}/notes`, {
    body: { body: 'x' }, headers: { 'x-member-id': 'not-a-member' },
  });
  assert.equal(badAuthor.status, 400);
});

test('patch: 400 for no recognized fields, invalid field types, bad expected_revision', async () => {
  const m = await addMember('Patcher');
  const n = await createNote(m, { body: 'patch me' });
  const url = `/api/v1/groups/${groupCode}/notes/${n.id}`;
  const cases = [
    [{}, 'empty object'],
    [[1, 2], 'array body'],
    [{ nope: true }, 'unrecognized field'],
    [{ body: null }, 'body null'],
    [{ body: '  ' }, 'body whitespace'],
    [{ body: 'y'.repeat(4001) }, 'body over 4000'],
    [{ title: null }, 'title null'],
    [{ title: 'z'.repeat(101) }, 'title over 100'],
    [{ pinned: 1 }, 'pinned number'],
    [{ pinned: 'true' }, 'pinned string'],
    [{ expected_revision: 'one' }, 'expected_revision string'],
    [{ expected_revision: 1.5 }, 'expected_revision float'],
  ];
  for (const [payload, label] of cases) {
    const r = await req('PATCH', url, { body: payload });
    assert.equal(r.status, 400, `${label} -> 400`);
    assert.equal(typeof r.json.error, 'string');
  }
  // Nothing above was applied: note unchanged
  const after = await req('GET', `/api/v1/groups/${groupCode}`);
  const unchanged = after.json.notes.find(x => x.id === n.id);
  assert.equal(unchanged.revision, 1);
  assert.equal(unchanged.body, 'patch me');
});

test('patch without expected_revision applies unconditionally; expected_revision-only PATCH is a check that does not bump revision', async () => {
  const m = await addMember('Rev');
  const n = await createNote(m, { body: 'v1' });
  const url = `/api/v1/groups/${groupCode}/notes/${n.id}`;

  const pinned = await req('PATCH', url, { body: { pinned: true } });
  assert.equal(pinned.status, 200);
  assert.equal(pinned.json.pinned, true);
  assert.equal(pinned.json.revision, 2, 'content PATCH bumps revision');

  const check = await req('PATCH', url, { body: { expected_revision: 2 } });
  assert.equal(check.status, 200);
  assert.equal(check.json.revision, 2, 'revision-only check does not bump');

  const staleCheck = await req('PATCH', url, { body: { expected_revision: 1 } });
  assert.equal(staleCheck.status, 409);
  assert.equal(staleCheck.json.error, 'Note was edited by someone else');
  assert.equal(staleCheck.json.note.revision, 2);

  const title = await req('PATCH', url, { body: { title: '  ', expected_revision: 2 } });
  assert.equal(title.status, 200);
  assert.equal(title.json.title, null, 'empty title clears to null');
  assert.equal(title.json.revision, 3);
});

test('removing a member preserves their notes with a name snapshot', async () => {
  const bob = await addMember('Bob Departing');
  const note = await createNote(bob, { title: 'Airbnb', body: 'Check-in after 3pm' });

  const del = await req('DELETE', `/api/v1/groups/${groupCode}/members/${bob.id}?force=true`);
  assert.equal(del.status, 200, JSON.stringify(del.json));

  const grp = await req('GET', `/api/v1/groups/${groupCode}`);
  const surviving = grp.json.notes.find(x => x.id === note.id);
  assert.ok(surviving, 'note survives member removal');
  assert.equal(surviving.author_member_id, null, 'author reference detached');
  assert.equal(surviving.author_name, 'Bob Departing', 'snapshot name used');
  assertNoteShape(surviving);

  // The note can still be edited (no author FK constraint trip)
  const edited = await req('PATCH', `/api/v1/groups/${groupCode}/notes/${note.id}`, { body: { body: 'Check-in after 4pm' } });
  assert.equal(edited.status, 200);
  assert.equal(edited.json.author_name, 'Bob Departing');
  assert.equal(edited.json.author_member_id, null);
});

test('pre-orphaned notes fall back to their snapshot, then "Former member"', async () => {
  const grpBefore = await req('GET', `/api/v1/groups/${groupCode}`);
  const groupId = grpBefore.json.id;
  const now = new Date().toISOString();
  // A note with no author and a stored snapshot name
  db.prepare('INSERT INTO notes (id, group_id, author_member_id, author_name, title, body, pinned, created_at, updated_at, revision) VALUES (?, ?, NULL, ?, ?, ?, 0, ?, ?, 1)')
    .run('note-snap', groupId, 'Snapshotted Sam', 'T', 'legacy body', now, now);
  // A note with neither author nor snapshot
  db.prepare('INSERT INTO notes (id, group_id, author_member_id, author_name, title, body, pinned, created_at, updated_at, revision) VALUES (?, ?, NULL, NULL, NULL, ?, 0, ?, ?, 1)')
    .run('note-orphan', groupId, 'orphan body', now, now);

  const grp = await req('GET', `/api/v1/groups/${groupCode}`);
  const snap = grp.json.notes.find(x => x.id === 'note-snap');
  assert.equal(snap.author_name, 'Snapshotted Sam', 'snapshot preferred over Former member');
  assert.equal(snap.author_member_id, null);
  const orphan = grp.json.notes.find(x => x.id === 'note-orphan');
  assert.equal(orphan.author_name, 'Former member', 'honest fallback for lost names');
  assertNoteShape(orphan);
});

test('audit limit is clamped to 1..200', async () => {
  for (const q of ['?limit=-1', '?limit=0', '?limit=99999', '?limit=abc']) {
    const r = await req('GET', `/api/v1/groups/${groupCode}/audit${q}`);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json));
    assert.ok(r.json.length <= 200);
  }
  // -1 must not error and must not return an unbounded/limit-less query result
  const neg = await req('GET', `/api/v1/groups/${groupCode}/audit?limit=-1`);
  assert.equal(neg.status, 200);
  assert.ok(Array.isArray(neg.json));
});

test('404s for unknown group or note', async () => {
  const m = await addMember('NotFound');
  assert.equal((await req('GET', '/api/v1/groups/NOPE00')).status, 404);
  assert.equal((await req('POST', '/api/v1/groups/NOPE00/notes', { body: { body: 'x' }, headers: asMember(m) })).status, 404);
  const n = await createNote(m, { body: 'will not patch' });
  assert.equal((await req('PATCH', `/api/v1/groups/${groupCode}/notes/${n.id}zzz`, { body: { body: 'y' } })).status, 404);
  assert.equal((await req('DELETE', `/api/v1/groups/${groupCode}/notes/${n.id}zzz`)).status, 404);
  // cross-group: a note id from another group code path
  assert.equal((await req('PATCH', `/api/v1/groups/NOPE00/notes/${n.id}`, { body: { body: 'y' } })).status, 404);
});