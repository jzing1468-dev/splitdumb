'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

process.env.AUTH_SECRET = 'splitdumb-cleanup-test-secret';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'splitdumb-cleanup-'));
process.env.DB_PATH = path.join(dir, 'test.db');
const db = require('../db');
const { app } = require('../index');
const { SignJWT } = require('jose');
let http, base, cookie;
const OLD = '2000-01-01T00:00:00.000Z';

function sql(query, ...args) {
  const stmt = db.prepare(query);
  try { return stmt.all(...args); } finally { stmt.free(); }
}
function fixture() {
  const g = randomUUID(), actor = randomUUID(), departing = randomUUID();
  const list = randomUUID(), item = randomUUID(), freeItem = randomUUID();
  const plan = randomUUID(), ownPlan = randomUUID(), note = randomUUID(), untouchedNote = randomUUID();
  sql('INSERT INTO groups (id, name, code) VALUES (?, ?, ?)', g, 'Cleanup', g);
  for (const [id, name] of [[actor, 'Keeper'], [departing, 'Departing']]) {
    sql('INSERT INTO members (id, group_id, name, color) VALUES (?, ?, ?, ?)', id, g, name, '#fff');
  }
  sql('INSERT INTO stay (id, group_id, title) VALUES (?, ?, ?)', randomUUID(), g, 'Cabin');
  sql('INSERT INTO lists (id, group_id, title) VALUES (?, ?, ?)', list, g, 'Chores');
  for (const [id, assignee] of [[item, departing], [freeItem, null]]) {
    sql('INSERT INTO list_items (id, list_id, text, assignee_id, updated_at) VALUES (?, ?, ?, ?, ?)', id, list, 'Keep', assignee, OLD);
  }
  sql('INSERT INTO travel_plans (id, group_id, member_id, pickup_by, updated_at) VALUES (?, ?, ?, ?, ?)', plan, g, actor, departing, OLD);
  sql('INSERT INTO travel_plans (id, group_id, member_id, updated_at) VALUES (?, ?, ?, ?)', ownPlan, g, departing, OLD);
  for (const [id, author] of [[note, departing], [untouchedNote, actor]]) {
    sql('INSERT INTO notes (id, group_id, author_member_id, body, updated_at) VALUES (?, ?, ?, ?, ?)', id, g, author, 'Survive', OLD);
  }
  return { g, actor, departing, list, item, freeItem, plan, ownPlan, note, untouchedNote };
}
async function request(f, method, suffix = '', body, actor = f.actor) {
  const res = await fetch(`${base}/api/v1/groups/${f.g}${suffix}`, {
    method,
    headers: { cookie, ...(actor ? { 'x-member-id': actor } : {}), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}
before(async () => {
  await db.init();
  cookie = `johnzhong_session=${await new SignJWT({ username: 'tester', role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode(process.env.AUTH_SECRET))}`;
  http = app.listen(0, '127.0.0.1');
  await new Promise(resolve => http.once('listening', resolve));
  base = `http://127.0.0.1:${http.address().port}`;
});
after(async () => {
  if (http) await new Promise(resolve => http.close(resolve));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('group deletion manually removes all utility rows, preserving another group', async () => {
  const f = fixture(), other = fixture();
  assert.equal(sql('PRAGMA foreign_keys')[0].foreign_keys, 0);
  assert.equal((await request(f, 'DELETE')).status, 200);
  for (const table of ['groups', 'members', 'stay', 'travel_plans', 'lists', 'notes']) {
    const key = table === 'groups' ? 'id' : 'group_id';
    assert.deepEqual(sql(`SELECT * FROM ${table} WHERE ${key} = ?`, f.g), [], table);
    assert.ok(sql(`SELECT * FROM ${table} WHERE ${key} = ?`, other.g).length, `${table}: other group preserved`);
  }
  assert.deepEqual(sql('SELECT * FROM list_items WHERE list_id = ?', f.list), []);
  assert.equal(sql('SELECT * FROM list_items WHERE list_id = ?', other.list).length, 2);
});

for (const [name, table, field, idKey] of [
  ['pickup references', 'travel_plans', 'pickup_by', 'plan'],
  ['item assignments', 'list_items', 'assignee_id', 'item'],
  ['note authorship', 'notes', 'author_member_id', 'note'],
]) {
  test(`member deletion detaches ${name} with revision and timestamp; stale edits conflict`, async () => {
    const f = fixture();
    assert.equal((await request(f, 'DELETE', `/members/${f.departing}?force=true`)).status, 200);
    assert.deepEqual(sql('SELECT * FROM travel_plans WHERE id = ?', f.ownPlan), []);
    const row = sql(`SELECT * FROM ${table} WHERE id = ?`, f[idKey])[0];
    assert.equal(row[field], null);
    assert.equal(row.revision, 2);
    assert.notEqual(row.updated_at, OLD);
    assert.ok(Number.isFinite(Date.parse(row.updated_at)));
    if (table === 'notes') assert.equal(row.author_name, 'Departing');
    const info = (await request(f, 'GET', '/info')).json;
    assert.equal(info.travel_plans.find(p => p.id === f.plan).pickup_by, null);
    for (const [t, id] of [['list_items', f.freeItem], ['notes', f.untouchedNote]]) {
      const untouched = sql(`SELECT * FROM ${t} WHERE id = ?`, id)[0];
      assert.equal(untouched.revision, 1);
      assert.equal(untouched.updated_at, OLD);
    }
    const [method, url, body, key] = table === 'travel_plans'
      ? ['PUT', `/travel-plans/${f.actor}`, { pickup_by: null }, 'travel_plan']
      : table === 'list_items' ? ['PATCH', `/items/${f.item}`, { done: true }, 'item']
      : ['PATCH', `/notes/${f.note}`, { body: 'Stale' }, 'note'];
    const stale = await request(f, method, url, { ...body, expected_revision: 1 });
    assert.equal(stale.status, 409);
    assert.equal(stale.json[key].revision, 2);
  });
}

for (const kind of ['stay', 'travel', 'list', 'item']) {
  test(`${kind} DELETE requires a current in-group actor and leaves rejected targets unchanged`, async () => {
    const f = fixture(), other = fixture();
    const suffix = { stay: '/stay', travel: `/travel-plans/${f.actor}`, list: `/lists/${f.list}`, item: `/items/${f.item}` }[kind];
    const before = (await request(f, 'GET', '/info')).json;
    for (const actor of [null, 'nonexistent-member', other.actor]) {
      const rejected = await request(f, 'DELETE', suffix, undefined, actor);
      assert.equal(rejected.status, 400);
      assert.match(rejected.json.error, /X-Member-Id header required|Actor must be a member of this group/);
      assert.deepEqual((await request(f, 'GET', '/info')).json, before);
    }
    assert.equal((await request(f, 'DELETE', suffix)).status, 200);
    const info = (await request(f, 'GET', '/info')).json;
    if (kind === 'stay') assert.equal(info.stay, null);
    if (kind === 'travel') assert.ok(!info.travel_plans.some(p => p.member_id === f.actor));
    if (kind === 'list') assert.deepEqual(info.lists, []);
    if (kind === 'item') assert.ok(!info.lists[0].items.some(i => i.id === f.item));
  });
}

test('list item PATCH text:null returns validation 400 without mutating the item', async () => {
  const f = fixture();
  const before = sql('SELECT * FROM list_items WHERE id = ?', f.item)[0];
  const result = await request(f, 'PATCH', `/items/${f.item}`, { text: null });
  assert.equal(result.status, 400);
  assert.equal(result.json.error, 'List item text must be 1-200 characters');
  assert.deepEqual(sql('SELECT * FROM list_items WHERE id = ?', f.item)[0], before);
});
