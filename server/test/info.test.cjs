'use strict';
// Group utilities API contract tests (Releases 1-3: stay, travel plans,
// lists/items), exercised over real HTTP against the Express app backed by
// an isolated temp sql.js database (DB_PATH env).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-auth-secret';
const DB_PATH = path.join(os.tmpdir(), `splitdumb-info-test-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = DB_PATH;

const db = require('../db');
const server = require('../index');
const { SignJWT } = require('jose');

let http;
let baseUrl;
let adminCookie;
let groupCode;
let otherGroupCode;

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

async function addMember(name) {
  const r = await req('POST', `/api/v1/groups/${groupCode}/members`, { body: { name } });
  assert.equal(r.status, 201, `addMember ${name}`);
  return r.json;
}

function asMember(member) {
  return { 'x-member-id': member.id };
}

function assertStayShape(s) {
  assert.equal(typeof s.id, 'string');
  for (const k of ['title', 'address', 'listing_url', 'checkin_at', 'checkout_at', 'timezone',
    'instructions', 'parking', 'wifi', 'contact_name', 'contact_phone']) {
    assert.ok(s[k] === null || typeof s[k] === 'string', `${k} is string|null`);
  }
  assert.match(s.created_at, ISO_RE);
  assert.match(s.updated_at, ISO_RE);
  assert.equal(Number.isInteger(s.revision), true);
}

function assertPlanShape(p) {
  assert.equal(typeof p.id, 'string');
  assert.equal(typeof p.member_id, 'string');
  assert.equal(typeof p.member_name, 'string');
  for (const k of ['arrival_at', 'arrival_place', 'arrival_detail', 'departure_at',
    'departure_place', 'pickup_by', 'pickup_by_name', 'status', 'notes']) {
    assert.ok(p[k] === null || typeof p[k] === 'string', `${k} is string|null`);
  }
  assert.equal(typeof p.pickup_requested, 'boolean');
  assert.match(p.updated_at, ISO_RE);
  assert.equal(Number.isInteger(p.revision), true);
}

function assertItemShape(i) {
  assert.equal(typeof i.id, 'string');
  assert.equal(typeof i.list_id, 'string');
  assert.equal(typeof i.text, 'string');
  assert.ok(i.assignee_id === null || typeof i.assignee_id === 'string');
  assert.ok(i.assignee_name === null || typeof i.assignee_name === 'string');
  assert.equal(typeof i.done, 'boolean', 'done is a JSON boolean, not 0/1');
  assert.equal(Number.isInteger(i.position), true);
  assert.equal(Number.isInteger(i.revision), true);
}

before(async () => {
  await db.init();
  adminCookie = `johnzhong_session=${await new SignJWT({ username: 'tester', role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET))}`;
  http = server.app.listen(0, '127.0.0.1');
  await new Promise(r => http.once('listening', r));
  baseUrl = `http://127.0.0.1:${http.address().port}`;
  const g = await req('POST', '/api/v1/groups', { body: { name: 'Info Test Group' } });
  assert.equal(g.status, 201);
  groupCode = g.json.code;
  const og = await req('POST', '/api/v1/groups', { body: { name: 'Other Group' } });
  assert.equal(og.status, 201);
  otherGroupCode = og.json.code;
});

after(async () => {
  if (http) await new Promise(r => http.close(r));
  for (const p of [DB_PATH, DB_PATH + '.tmp']) { try { fs.unlinkSync(p); } catch {} }
});

test('info endpoint: empty group -> null stay, empty arrays, zero counts', async () => {
  const m = await addMember('Empty');
  const r = await req('GET', `/api/v1/groups/${groupCode}/info`);
  assert.equal(r.status, 200);
  const { stay, travel_plans, lists, counts } = r.json;
  assert.equal(stay, null);
  assert.deepEqual(travel_plans, []);
  assert.deepEqual(lists, []);
  assert.deepEqual(counts, { stay: 0, travel_plans: 0, lists: 0, list_items: 0, notes: 0 });
  // no X-Member-Id needed for reads
  assert.equal(m.id, m.id);
});

test('stay: create -> info -> update (revision bump) -> stale 409 -> delete', async () => {
  const m = await addMember('Host');
  const url = `/api/v1/groups/${groupCode}/stay`;

  // Mutation requires X-Member-Id of a group member
  assert.equal((await req('PUT', url, { body: { title: 'X' } })).status, 400);
  assert.equal((await req('PUT', url, { body: { title: 'X' }, headers: { 'x-member-id': 'nope' } })).status, 400);

  const created = await req('PUT', url, {
    body: {
      title: '  Lakeside Cabin  ',
      address: '123 Pine Rd',
      listing_url: 'https://airbnb.example/123',
      checkin_at: '2026-11-20 15:00',
      checkout_at: '2026-11-22',
      timezone: 'America/New_York',
      instructions: 'Door code 1234',
      parking: 'Driveway',
      wifi: 'SSID lake / pw 1234',
      contact_name: 'Ana',
      contact_phone: '+15550001111',
    },
    headers: asMember(m),
  });
  assert.equal(created.status, 200, JSON.stringify(created.json));
  const s = created.json;
  assertStayShape(s);
  assert.equal(s.title, 'Lakeside Cabin');            // trimmed
  assert.equal(s.checkin_at, '2026-11-20 15:00');     // local wall-clock verbatim
  assert.equal(s.checkout_at, '2026-11-22');         // date-only stays date-only
  assert.equal(s.revision, 1);

  const info = await req('GET', `/api/v1/groups/${groupCode}/info`);
  assert.equal(info.json.stay.id, s.id);
  assert.equal(info.json.counts.stay, 1);

  // Matching expected_revision applies, bumps revision + updated_at
  const updated = await req('PUT', url, {
    body: { address: '456 Birch Ln', expected_revision: 1 }, headers: asMember(m),
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.json.address, '456 Birch Ln');
  assert.equal(updated.json.title, 'Lakeside Cabin'); // untouched field preserved
  assert.equal(updated.json.revision, 2);
  assert.notEqual(updated.json.updated_at, s.updated_at);

  // Stale expected_revision -> 409 with the current stay
  const conflict = await req('PUT', url, {
    body: { address: 'nope', expected_revision: 1 }, headers: asMember(m),
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.json.error, 'Stay was updated by someone else');
  assertStayShape(conflict.json.stay);
  assert.equal(conflict.json.stay.revision, 2);
  assert.equal(conflict.json.stay.address, '456 Birch Ln');

  // Empty update is a no-op (no revision bump)
  const noop = await req('PUT', url, { body: {}, headers: asMember(m) });
  assert.equal(noop.status, 200);
  assert.equal(noop.json.revision, 2);

  // Same-value update does not bump revision
  const same = await req('PUT', url, { body: { address: '456 Birch Ln' }, headers: asMember(m) });
  assert.equal(same.status, 200);
  assert.equal(same.json.revision, 2);

  // Absent expected_revision = unconditional update
  const forced = await req('PUT', url, { body: { title: 'Cabin' }, headers: asMember(m) });
  assert.equal(forced.status, 200);
  assert.equal(forced.json.revision, 3);

  const del = await req('DELETE', url);
  assert.equal(del.status, 200);
  assert.deepEqual(del.json, { ok: true });
  // delete is idempotent
  assert.equal((await req('DELETE', url)).status, 200);
  assert.equal((await req('GET', `/api/v1/groups/${groupCode}/info`)).json.stay, null);
});

test('stay: invalid fields -> 400 (URL protocol, datetime, timezone, caps)', async () => {
  const m = await addMember('Validator');
  const url = `/api/v1/groups/${groupCode}/stay`;
  const cases = [
    [{ listing_url: 'javascript:alert(1)' }, 'non-http(s) URL'],
    [{ listing_url: 'ftp://x.example' }, 'ftp URL'],
    [{ checkin_at: '20 Nov 2026' }, 'bad datetime'],
    [{ checkin_at: '2026-11-20T15' }, 'partial time'],
    [{ checkout_at: '2026/11/22' }, 'slash date'],
    [{ timezone: 'Mars/Olympus' }, 'invalid IANA tz'],
    [{ instructions: 'x'.repeat(2001) }, 'instructions over 2000'],
    [{ parking: 'x'.repeat(2001) }, 'parking over 2000'],
    [{ wifi: 'x'.repeat(2001) }, 'wifi over 2000'],
    [{ address: 'x'.repeat(301) }, 'address over 300'],
    [{ title: 'x'.repeat(101) }, 'title over 100'],
    [{ contact_name: 'x'.repeat(61) }, 'contact_name over 60'],
    [{ contact_phone: 'x'.repeat(61) }, 'contact_phone over 60'],
    [{ title: 42 }, 'title number'],
    [{ checkin_at: 7 }, 'checkin number'],
    [{ expected_revision: 'one' }, 'expected_revision string'],
  ];
  for (const [payload, label] of cases) {
    const r = await req('PUT', url, { body: payload, headers: asMember(m) });
    assert.equal(r.status, 400, `${label} -> 400`);
    assert.equal(typeof r.json.error, 'string', `${label} -> JSON error`);
  }
  // Nothing persisted
  assert.equal((await req('GET', `/api/v1/groups/${groupCode}/info`)).json.stay, null);
  // Valid edge forms pass: date-only, datetime with seconds, "T" separator
  const ok = await req('PUT', url, {
    body: { checkin_at: '2026-11-20', checkout_at: '2026-11-22T11:30:45' },
    headers: asMember(m),
  });
  assert.equal(ok.status, 200);
  await req('DELETE', url);
});

test('travel plans: upsert per member, foreign member 400, pickup_by cross-group 400, delete', async () => {
  const alice = await addMember('Traveler Alice');
  const bob = await addMember('Traveler Bob');
  const planUrl = (mid) => `/api/v1/groups/${groupCode}/travel-plans/${mid}`;

  const created = await req('PUT', planUrl(alice.id), {
    body: {
      arrival_at: '2026-11-20 21:45',
      arrival_place: '  BTV airport  ',
      arrival_detail: 'Gate 3, United 452',
      departure_at: '2026-11-23',
      departure_place: 'Cabin',
      pickup_requested: true,
      pickup_by: bob.id,
      status: 'planned',
      notes: 'Text me when landing',
    },
    headers: asMember(alice),
  });
  assert.equal(created.status, 200, JSON.stringify(created.json));
  const p = created.json;
  assertPlanShape(p);
  assert.equal(p.member_id, alice.id);
  assert.equal(p.member_name, 'Traveler Alice');
  assert.equal(p.arrival_place, 'BTV airport');   // trimmed
  assert.equal(p.arrival_at, '2026-11-20 21:45'); // local wall-clock verbatim
  assert.equal(p.pickup_requested, true);         // real boolean
  assert.equal(p.pickup_by, bob.id);
  assert.equal(p.pickup_by_name, 'Traveler Bob');
  assert.equal(p.status, 'planned');
  assert.equal(p.revision, 1);

  // Upsert (second PUT updates, not duplicate)
  const updated = await req('PUT', planUrl(alice.id), {
    body: { status: 'on_the_way', expected_revision: 1 }, headers: asMember(alice),
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.json.status, 'on_the_way');
  assert.equal(updated.json.arrival_place, 'BTV airport'); // preserved
  assert.equal(updated.json.revision, 2);

  // Stale revision -> 409 with current plan
  const stale = await req('PUT', planUrl(alice.id), {
    body: { status: 'arrived', expected_revision: 1 }, headers: asMember(alice),
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error, 'Travel plan was updated by someone else');
  assert.equal(stale.json.travel_plan.revision, 2);
  assert.equal(stale.json.travel_plan.status, 'on_the_way');

  // Bob has no plan yet; his plan is separate
  const bobPlan = await req('PUT', planUrl(bob.id), {
    body: { arrival_at: '2026-11-21 10:00', arrival_place: 'Drive up' }, headers: asMember(bob),
  });
  assert.equal(bobPlan.status, 200);
  assert.notEqual(bobPlan.json.id, p.id);

  // memberId not in this group -> 400
  const foreign = await req('PUT', planUrl('not-a-member'), {
    body: { arrival_place: 'x' }, headers: asMember(alice),
  });
  assert.equal(foreign.status, 400);

  // pickup_by from another group -> 400
  const otherMember = await req('POST', `/api/v1/groups/${otherGroupCode}/members`, { body: { name: 'Outsider' } });
  assert.equal(otherMember.status, 201);
  const badPickup = await req('PUT', planUrl(alice.id), {
    body: { pickup_by: otherMember.json.id }, headers: asMember(alice),
  });
  assert.equal(badPickup.status, 400);

  // Field validation: bad status, truthy pickup_requested, bad datetime
  const badCases = [
    [{ status: 'flying' }, 'bad status'],
    [{ pickup_requested: 'yes' }, 'truthy string pickup_requested'],
    [{ arrival_at: 'Nov 20' }, 'bad datetime'],
    [{ notes: 'x'.repeat(501) }, 'notes over 500'],
    [{ arrival_place: 'x'.repeat(121) }, 'arrival_place over 120'],
  ];
  for (const [payload, label] of badCases) {
    const r = await req('PUT', planUrl(bob.id), { body: payload, headers: asMember(bob) });
    assert.equal(r.status, 400, `${label} -> 400`);
  }

  // info shows only members WITH plans, both plans, pickup names resolved
  const info = await req('GET', `/api/v1/groups/${groupCode}/info`);
  assert.equal(info.json.counts.travel_plans, 2);
  const ids = info.json.travel_plans.map(x => x.member_id);
  assert.ok(ids.includes(alice.id) && ids.includes(bob.id));

  // Delete
  const del = await req('DELETE', planUrl(alice.id));
  assert.equal(del.status, 200);
  assert.deepEqual(del.json, { ok: true });
  assert.equal((await req('GET', `/api/v1/groups/${groupCode}/info`)).json.counts.travel_plans, 1);
  await req('DELETE', planUrl(bob.id));
});

test('lists: create, patch, stale 409, delete cascades items', async () => {
  const m = await addMember('Lister');
  const listsUrl = `/api/v1/groups/${groupCode}/lists`;

  const created = await req('POST', listsUrl, {
    body: { title: '  Groceries  ', kind: 'buy' }, headers: asMember(m),
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const l = created.json;
  assert.equal(l.title, 'Groceries'); // trimmed
  assert.equal(l.kind, 'buy');
  assert.equal(l.revision, 1);
  assert.match(l.created_at, ISO_RE);

  // Validation: missing/blank title, bad kind
  assert.equal((await req('POST', listsUrl, { body: { kind: 'buy' }, headers: asMember(m) })).status, 400);
  assert.equal((await req('POST', listsUrl, { body: { title: '   ' }, headers: asMember(m) })).status, 400);
  assert.equal((await req('POST', listsUrl, { body: { title: 'x'.repeat(61) }, headers: asMember(m) })).status, 400);
  assert.equal((await req('POST', listsUrl, { body: { title: 'ok', kind: 'other' }, headers: asMember(m) })).status, 400);
  // No recognized fields -> 400 'No fields to update'
  const noFields = await req('PATCH', `${listsUrl}/${l.id}`, { body: {}, headers: asMember(m) });
  assert.equal(noFields.status, 400);
  assert.equal(noFields.json.error, 'No fields to update');

  const patched = await req('PATCH', `${listsUrl}/${l.id}`, {
    body: { title: 'Groceries + drinks', expected_revision: 1 }, headers: asMember(m),
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.json.title, 'Groceries + drinks');
  assert.equal(patched.json.revision, 2);

  const stale = await req('PATCH', `${listsUrl}/${l.id}`, {
    body: { title: 'nope', expected_revision: 1 }, headers: asMember(m),
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error, 'List was updated by someone else');
  assert.equal(stale.json.list.title, 'Groceries + drinks');

  // kind can be cleared to null
  const cleared = await req('PATCH', `${listsUrl}/${l.id}`, { body: { kind: null }, headers: asMember(m) });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.json.kind, null);

  // Add two items, then delete the list -> items cascade
  const i1 = await req('POST', `${listsUrl}/${l.id}/items`, { body: { text: 'Ice' }, headers: asMember(m) });
  const i2 = await req('POST', `${listsUrl}/${l.id}/items`, { body: { text: 'Snacks' }, headers: asMember(m) });
  assert.equal(i1.status, 201);
  assert.equal(i2.status, 201);

  const del = await req('DELETE', `${listsUrl}/${l.id}`);
  assert.equal(del.status, 200);
  assert.deepEqual(del.json, { ok: true });
  const info = await req('GET', `/api/v1/groups/${groupCode}/info`);
  assert.equal(info.json.counts.lists, 0);
  assert.equal(info.json.counts.list_items, 0);
  assert.equal((await req('PATCH', `/api/v1/groups/${groupCode}/items/${i1.json.id}`, {
    body: { done: true }, headers: asMember(m),
  })).status, 404);
});

test('list items: create, assign, toggle done, 409, delete; positions increment', async () => {
  const m = await addMember('Shopper');
  const other = await addMember('Shopper2');
  const list = (await req('POST', `/api/v1/groups/${groupCode}/lists`, {
    body: { title: 'Checkout', kind: 'checkout' }, headers: asMember(m),
  })).json;

  // text required 1..200; assignee must be group member
  assert.equal((await req('POST', `/api/v1/groups/${groupCode}/lists/${list.id}/items`, {
    body: { text: '' }, headers: asMember(m),
  })).status, 400);
  assert.equal((await req('POST', `/api/v1/groups/${groupCode}/lists/${list.id}/items`, {
    body: { text: 'x'.repeat(201) }, headers: asMember(m),
  })).status, 400);
  const outsider = (await req('POST', `/api/v1/groups/${otherGroupCode}/members`, {
    body: { name: 'Stranger' },
  })).json;
  assert.equal((await req('POST', `/api/v1/groups/${groupCode}/lists/${list.id}/items`, {
    body: { text: 'ok', assignee_id: outsider.id }, headers: asMember(m),
  })).status, 400);

  const a = (await req('POST', `/api/v1/groups/${groupCode}/lists/${list.id}/items`, {
    body: { text: '  Wash dishes  ', assignee_id: other.id }, headers: asMember(m),
  })).json;
  const b = (await req('POST', `/api/v1/groups/${groupCode}/lists/${list.id}/items`, {
    body: { text: 'Take out trash' }, headers: asMember(m),
  })).json;
  assertItemShape(a);
  assertItemShape(b);
  assert.equal(a.text, 'Wash dishes');
  assert.equal(a.assignee_name, 'Shopper2');
  assert.equal(a.done, false);
  assert.equal(a.position, 1);
  assert.equal(b.position, 2);
  assert.equal(a.revision, 1);

  // done must be a real boolean, not truthy
  const badDone = await req('PATCH', `/api/v1/groups/${groupCode}/items/${a.id}`, {
    body: { done: 'true' }, headers: asMember(m),
  });
  assert.equal(badDone.status, 400);
  assert.equal((await req('PATCH', `/api/v1/groups/${groupCode}/items/${a.id}`, {
    body: { done: 1 }, headers: asMember(m),
  })).status, 400);
  assert.equal((await req('PATCH', `/api/v1/groups/${groupCode}/items/${a.id}`, {
    body: {}, headers: asMember(m),
  })).json.error, 'No fields to update');

  // Toggle done with matching revision
  const done = await req('PATCH', `/api/v1/groups/${groupCode}/items/${a.id}`, {
    body: { done: true, expected_revision: 1 }, headers: asMember(m),
  });
  assert.equal(done.status, 200);
  assert.equal(done.json.done, true);
  assert.equal(done.json.revision, 2);
  assert.equal(done.json.assignee_id, other.id);

  // Reopen without revision (unconditional)
  const reopen = await req('PATCH', `/api/v1/groups/${groupCode}/items/${a.id}`, {
    body: { done: false }, headers: asMember(m),
  });
  assert.equal(reopen.status, 200);
  assert.equal(reopen.json.done, false);
  assert.equal(reopen.json.revision, 3);

  // Stale revision -> 409 with current item
  const stale = await req('PATCH', `/api/v1/groups/${groupCode}/items/${a.id}`, {
    body: { done: true, expected_revision: 2 }, headers: asMember(m),
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error, 'Item was updated by someone else');
  assert.equal(stale.json.item.revision, 3);

  // Unassign via null
  const unassign = await req('PATCH', `/api/v1/groups/${groupCode}/items/${a.id}`, {
    body: { assignee_id: null }, headers: asMember(m),
  });
  assert.equal(unassign.status, 200);
  assert.equal(unassign.json.assignee_id, null);
  assert.equal(unassign.json.assignee_name, null);

  // Cross-group item id -> 404
  assert.equal((await req('PATCH', `/api/v1/groups/${otherGroupCode}/items/${a.id}`, {
    body: { done: true }, headers: asMember(m),
  })).status, 404);

  // Info ordering: position asc
  const info = await req('GET', `/api/v1/groups/${groupCode}/info`);
  const items = info.json.lists.find(x => x.id === list.id).items;
  assert.deepEqual(items.map(x => x.text), ['Wash dishes', 'Take out trash']);
  assert.equal(info.json.counts.list_items, 2);

  // Delete one item
  const del = await req('DELETE', `/api/v1/groups/${groupCode}/items/${b.id}`);
  assert.equal(del.status, 200);
  assert.deepEqual(del.json, { ok: true });
  assert.equal((await req('GET', `/api/v1/groups/${groupCode}/info`)).json.counts.list_items, 1);

  await req('DELETE', `/api/v1/groups/${groupCode}/lists/${list.id}`);
});

test('counts endpoint reflects all mutations together', async () => {
  const m = await addMember('Counter');
  await req('PUT', `/api/v1/groups/${groupCode}/stay`, {
    body: { title: 'Counter cabin' }, headers: asMember(m),
  });
  await req('PUT', `/api/v1/groups/${groupCode}/travel-plans/${m.id}`, {
    body: { arrival_place: 'bus stop' }, headers: asMember(m),
  });
  const list = (await req('POST', `/api/v1/groups/${groupCode}/lists`, {
    body: { title: 'Counter list' }, headers: asMember(m),
  })).json;
  await req('POST', `/api/v1/groups/${groupCode}/lists/${list.id}/items`, {
    body: { text: 'one' }, headers: asMember(m),
  });
  await req('POST', `/api/v1/groups/${groupCode}/notes`, {
    body: { body: 'counter note' }, headers: asMember(m),
  });

  const info = await req('GET', `/api/v1/groups/${groupCode}/info`);
  // stay/plans/lists/items counted above are exactly this test's mutations
  assert.equal(info.json.counts.stay, 1);
  assert.equal(info.json.counts.travel_plans, 1);
  assert.equal(info.json.counts.lists, 1);
  assert.equal(info.json.counts.list_items, 1);
  assert.ok(info.json.counts.notes >= 1);
  // No financial fields recomputed/returned
  assert.equal('balances' in info.json, false);
});

test('member deletion removes their travel plan and nulls assignee, list survives', async () => {
  const keeper = await addMember('Keeper');
  const departing = await addMember('Departing');
  const list = (await req('POST', `/api/v1/groups/${groupCode}/lists`, {
    body: { title: 'Survive list' }, headers: asMember(keeper),
  })).json;
  const item = (await req('POST', `/api/v1/groups/${groupCode}/lists/${list.id}/items`, {
    body: { text: 'Their chore', assignee_id: departing.id }, headers: asMember(keeper),
  })).json;
  const plan = await req('PUT', `/api/v1/groups/${groupCode}/travel-plans/${departing.id}`, {
    body: { arrival_place: 'somewhere' }, headers: asMember(departing),
  });
  assert.equal(plan.status, 200);

  const del = await req('DELETE', `/api/v1/groups/${groupCode}/members/${departing.id}?force=true`);
  assert.equal(del.status, 200, JSON.stringify(del.json));

  const info = await req('GET', `/api/v1/groups/${groupCode}/info`);
  // Travel plan gone with the member
  assert.equal(info.json.travel_plans.find(p => p.member_id === departing.id), undefined);
  // Item survives, assignee detached
  const survived = info.json.lists.find(x => x.id === list.id).items.find(x => x.id === item.id);
  assert.ok(survived, 'list item survives member removal');
  assert.equal(survived.text, 'Their chore');
  assert.equal(survived.assignee_id, null);
  assert.equal(survived.assignee_name, null);

  await req('DELETE', `/api/v1/groups/${groupCode}/lists/${list.id}`);
});

test('404s for unknown group across every utility route', async () => {
  const m = await addMember('NotFound');
  assert.equal((await req('GET', '/api/v1/groups/NOPE00/info')).status, 404);
  assert.equal((await req('PUT', '/api/v1/groups/NOPE00/stay', { body: { title: 'x' }, headers: asMember(m) })).status, 404);
  assert.equal((await req('DELETE', '/api/v1/groups/NOPE00/stay')).status, 404);
  assert.equal((await req('PUT', '/api/v1/groups/NOPE00/travel-plans/x', { body: {}, headers: asMember(m) })).status, 404);
  assert.equal((await req('DELETE', '/api/v1/groups/NOPE00/travel-plans/x')).status, 404);
  assert.equal((await req('POST', '/api/v1/groups/NOPE00/lists', { body: { title: 'x' }, headers: asMember(m) })).status, 404);
  assert.equal((await req('PATCH', '/api/v1/groups/NOPE00/lists/x', { body: { title: 'x' }, headers: asMember(m) })).status, 404);
  assert.equal((await req('DELETE', '/api/v1/groups/NOPE00/lists/x')).status, 404);
  assert.equal((await req('POST', '/api/v1/groups/NOPE00/lists/x/items', { body: { text: 'x' }, headers: asMember(m) })).status, 404);
  assert.equal((await req('PATCH', '/api/v1/groups/NOPE00/items/x', { body: { done: true }, headers: asMember(m) })).status, 404);
  assert.equal((await req('DELETE', '/api/v1/groups/NOPE00/items/x')).status, 404);
});

test('every mutation route requires X-Member-Id of a group member', async () => {
  const m = await addMember('HeaderCheck');
  const list = (await req('POST', `/api/v1/groups/${groupCode}/lists`, {
    body: { title: 'Hdr list' }, headers: asMember(m),
  })).json;
  const item = (await req('POST', `/api/v1/groups/${groupCode}/lists/${list.id}/items`, {
    body: { text: 'hdr item' }, headers: asMember(m),
  })).json;
  const noHeader = [
    ['PUT', `/api/v1/groups/${groupCode}/stay`, { title: 'x' }],
    ['PUT', `/api/v1/groups/${groupCode}/travel-plans/${m.id}`, { arrival_place: 'x' }],
    ['POST', `/api/v1/groups/${groupCode}/lists`, { title: 'x' }],
    ['PATCH', `/api/v1/groups/${groupCode}/lists/${list.id}`, { title: 'x' }],
    ['POST', `/api/v1/groups/${groupCode}/lists/${list.id}/items`, { text: 'x' }],
    ['PATCH', `/api/v1/groups/${groupCode}/items/${item.id}`, { done: true }],
  ];
  for (const [method, url, body] of noHeader) {
    assert.equal((await req(method, url, { body })).status, 400, `${method} ${url} without header -> 400`);
    const foreign = await req(method, url, { body, headers: { 'x-member-id': 'not-a-member' } });
    assert.equal(foreign.status, 400, `${method} ${url} with foreign member -> 400`);
  }
  await req('DELETE', `/api/v1/groups/${groupCode}/lists/${list.id}`);
});