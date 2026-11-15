'use strict';
// Group-utility validators: ESM/CJS parity + typed behavior.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const cjs = require('../src/validators.cjs');
const pkg = require('../index.cjs');

const NAMES = ['validateStay', 'validateStayPatch', 'validateTravelPlan', 'validateTravelPlanPatch',
  'validateList', 'validateListPatch', 'validateListItem', 'validateListItemPatch'];

test('CJS source and barrel both export every group-utility validator', () => {
  for (const n of NAMES) assert.equal(typeof cjs[n], 'function', `validators.cjs exports ${n}`);
  for (const n of NAMES) assert.equal(typeof pkg[n], 'function', `index.cjs re-exports ${n}`);
  assert.deepEqual(pkg.LIST_KINDS, ['bring', 'buy', 'checkout']);
  assert.deepEqual(pkg.TRAVEL_STATUSES, ['planned', 'on_the_way', 'arrived']);
});

test('ESM source and barrel export the same validators (dual format)', async () => {
  const esm = await import(pathToFileURL(path.join(__dirname, '../src/validators.js')).href);
  const esmPkg = await import(pathToFileURL(path.join(__dirname, '../src/index.js')).href);
  for (const n of NAMES) {
    assert.equal(typeof esm[n], 'function', `validators.js exports ${n}`);
    assert.equal(typeof esmPkg[n], 'function', `src/index.js re-exports ${n}`);
  }
});

test('stay: subsets valid, empty no-op valid, bad URL/datetime/timezone rejected', () => {
  assert.equal(cjs.validateStay({}), null);
  assert.equal(cjs.validateStay({ title: 'Cabin', checkin_at: '2026-11-20 15:00', checkout_at: '2026-11-22', timezone: 'Europe/Paris', listing_url: 'https://x.example/l' }), null);
  assert.equal(cjs.validateStay({ listing_url: 'javascript:alert(1)' }) !== null, true);
  assert.equal(cjs.validateStay({ checkin_at: 'tomorrow' }) !== null, true);
  assert.equal(cjs.validateStay({ timezone: 'Not/AZone' }) !== null, true);
  assert.equal(cjs.validateStay({ expected_revision: 'x' }) !== null, true);
  assert.equal(cjs.validateStayPatch({}), 'No fields to update');
  assert.equal(cjs.validateStayPatch({ title: 'x' }), null);
});

test('travel plan: field checks and status enum', () => {
  assert.equal(cjs.validateTravelPlan({}), null);
  assert.equal(cjs.validateTravelPlan({ arrival_at: '2026-11-20 21:45', status: 'arrived', pickup_requested: true, pickup_by: 'some-id', notes: 'x' }), null);
  assert.equal(cjs.validateTravelPlan({ status: 'flying' }) !== null, true);
  assert.equal(cjs.validateTravelPlan({ pickup_requested: 'true' }) !== null, true);
  assert.equal(cjs.validateTravelPlan({ arrival_at: 'Nov 20' }) !== null, true);
  assert.equal(cjs.validateTravelPlan({ notes: 'x'.repeat(501) }) !== null, true);
  assert.equal(cjs.validateTravelPlanPatch({}), 'No fields to update');
});

test('list and list item validators', () => {
  assert.equal(cjs.validateList({ title: 'Groceries', kind: 'buy' }), null);
  assert.equal(cjs.validateList({ title: 'Groceries' }), null);
  assert.equal(cjs.validateList({}), 'List title must be 1-60 characters');
  assert.equal(cjs.validateList({ title: 'x', kind: 'other' }) !== null, true);
  assert.equal(cjs.validateListPatch({}), 'No fields to update');
  assert.equal(cjs.validateListPatch({ kind: null }), null);

  assert.equal(cjs.validateListItem({ text: 'Ice' }), null);
  assert.equal(cjs.validateListItem({ text: 'Ice', assignee_id: 'm1' }), null);
  assert.equal(cjs.validateListItem({}), 'List item text must be 1-200 characters');
  assert.equal(cjs.validateListItem({ text: 'x'.repeat(201) }) !== null, true);
  assert.equal(cjs.validateListItemPatch({}), 'No fields to update');
  assert.equal(cjs.validateListItemPatch({ done: 'true' }) !== null, true);
  assert.equal(cjs.validateListItemPatch({ done: true }), null);
  assert.equal(cjs.validateListItemPatch({ expected_revision: 1.5 }) !== null, true);
});