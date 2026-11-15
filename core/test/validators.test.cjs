'use strict';
// Covers the shared validators in @splitdumb/core (both via the CJS barrel).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const core = require(path.join(__dirname, '..', 'index.cjs'));
const validators = require(path.join(__dirname, '..', 'src', 'validators.cjs'));

test('barrel re-exports all validators', () => {
  for (const name of ['validateGroupName', 'validateMemberName', 'validateExpense', 'validateSettlement', 'validateNote', 'validateNotePatch']) {
    assert.equal(typeof core[name], 'function', `${name} exported from barrel`);
    assert.equal(core[name], validators[name], `${name} identical to validators.cjs export`);
  }
});

test('validateGroupName', () => {
  assert.equal(validators.validateGroupName('Trip'), null);
  assert.equal(validators.validateGroupName('  Trip  '), null);
  assert.equal(validators.validateGroupName(''), 'Group name must be 1-50 characters');
  assert.equal(validators.validateGroupName('   '), 'Group name must be 1-50 characters');
  assert.equal(validators.validateGroupName(null), 'Group name must be 1-50 characters');
  assert.equal(validators.validateGroupName('x'.repeat(51)), 'Group name must be 1-50 characters');
});

test('validateMemberName', () => {
  assert.equal(validators.validateMemberName('Alice'), null);
  assert.equal(validators.validateMemberName(''), 'Member name must be 1-30 characters');
  assert.equal(validators.validateMemberName(undefined), 'Member name must be 1-30 characters');
  assert.equal(validators.validateMemberName('x'.repeat(31)), 'Member name must be 1-30 characters');
});

test('validateExpense', () => {
  assert.equal(validators.validateExpense({ description: 'Dinner', amount: 20, payer_id: 'p1', split_type: 'equal' }), null);
  assert.equal(validators.validateExpense({ description: '', amount: 20, payer_id: 'p1', split_type: 'equal' }), 'Description is required');
  assert.equal(validators.validateExpense({ description: 'Dinner', amount: 0, payer_id: 'p1', split_type: 'equal' }), 'Amount must be greater than $0');
  assert.equal(validators.validateExpense({ description: 'Dinner', amount: 20, split_type: 'equal' }), 'Payer is required');
  assert.equal(validators.validateExpense({ description: 'Dinner', amount: 20, payer_id: 'p1' }), 'Split type is required');
});

test('validateSettlement', () => {
  assert.equal(validators.validateSettlement('a', 'b', 10), null);
  assert.equal(validators.validateSettlement(null, 'b', 10), 'Both parties are required');
  assert.equal(validators.validateSettlement('a', 'a', 10), 'Cannot settle with yourself');
  assert.equal(validators.validateSettlement('a', 'b', 0), 'Amount must be greater than $0');
});

test('validateNote accepts valid creates', () => {
  assert.equal(validators.validateNote({ body: 'Door code' }), null);
  assert.equal(validators.validateNote({ title: '  Check-in  ', body: 'Door code 1234', pinned: true }), null);
  assert.equal(validators.validateNote({ title: '   ', body: 'x' }), null); // empty title -> null, not an error
});

test('validateNote rejects invalid creates', () => {
  const cases = [
    [null, 'Note body is required'],
    [{}, 'Note body is required'],
    [{ body: null }, 'Note body is required'],
    [{ body: 123 }, 'Note body is required'],
    [{ body: ['x'] }, 'Note body is required'],
    [{ body: '   ' }, 'Note body must be 1-4000 characters'],
    [{ body: 'x'.repeat(4001) }, 'Note body must be 1-4000 characters'],
    [{ body: 'ok', title: null }, 'Note title must be a string'],
    [{ body: 'ok', title: 42 }, 'Note title must be a string'],
    [{ body: 'ok', title: 'x'.repeat(101) }, 'Note title must be at most 100 characters'],
    [{ body: 'ok', pinned: 'yes' }, 'Note pinned must be a boolean'],
    [{ body: 'ok', pinned: 1 }, 'Note pinned must be a boolean'],
    [{ body: 'ok', pinned: null }, 'Note pinned must be a boolean'],
    ['not an object', 'Note body is required'],
  ];
  for (const [data, expected] of cases) {
    assert.equal(validators.validateNote(data), expected, JSON.stringify(data));
  }
});

test('validateNotePatch rejects empty or unrecognized payloads', () => {
  assert.equal(validators.validateNotePatch({}), 'No recognized fields to update');
  assert.equal(validators.validateNotePatch(null), 'No recognized fields to update');
  assert.equal(validators.validateNotePatch([1, 2]), 'No recognized fields to update');
  assert.equal(validators.validateNotePatch({ surprise: true }), 'No recognized fields to update');
});

test('validateNotePatch applies create rules to present fields', () => {
  assert.equal(validators.validateNotePatch({ body: 'new text' }), null);
  assert.equal(validators.validateNotePatch({ pinned: false }), null);
  assert.equal(validators.validateNotePatch({ title: 'T', expected_revision: 3 }), null);
  assert.equal(validators.validateNotePatch({ body: null }), 'Note body is required');
  assert.equal(validators.validateNotePatch({ body: '  ' }), 'Note body must be 1-4000 characters');
  assert.equal(validators.validateNotePatch({ body: 'x'.repeat(4001) }), 'Note body must be 1-4000 characters');
  assert.equal(validators.validateNotePatch({ title: null }), 'Note title must be a string');
  assert.equal(validators.validateNotePatch({ title: 'y'.repeat(101) }), 'Note title must be at most 100 characters');
  assert.equal(validators.validateNotePatch({ pinned: 'true' }), 'Note pinned must be a boolean');
  assert.equal(validators.validateNotePatch({ expected_revision: 'one' }), 'expected_revision must be an integer');
  assert.equal(validators.validateNotePatch({ expected_revision: 1.5 }), 'expected_revision must be an integer');
  // expected_revision alone is a recognized no-op check
  assert.equal(validators.validateNotePatch({ expected_revision: 2 }), null);
});