// Exercise the real Group page, API adapter, and NotesWorkspace with reordered HTTP responses.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Group from '../../client/src/pages/Group';
import '../src/styles.css';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const host = document.getElementById('test-root');
const originalFetch = window.fetch;
const results = [];
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const member = { id: 'alice', name: 'Alice', color: '#dd6600' };
const originalNote = { id: 'note', title: 'Booking', body: 'Original', revision: 1, pinned: false };
const groupOf = note => ({ code: 'RACE01', name: 'Refresh test', members: [member], expenses: [], settlements: [], notes: [note], balances: {}, simplifiedDebts: [] });
const infoOf = title => ({ stay: title ? { id: 'stay', title, revision: 1 } : null, travel_plans: [], lists: [], counts: {} });
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const button = text => [...host.querySelectorAll('button')].find(b => b.getClientRects().length && (b.textContent.trim() === text || b.getAttribute('aria-label') === text || b.querySelector('.ns-row-title')?.textContent === text));
const click = async text => { assert(button(text), `Missing button: ${text}`); await act(async () => { button(text).click(); }); };
let root, groupPending, infoPending, saved;
async function setup() {
  groupPending = []; infoPending = []; saved = originalNote;
  let groupLoaded = false, infoLoaded = false;
  window.fetch = async (url, options = {}) => {
    const pathname = new URL(url, location.origin).pathname;
    const method = options.method || 'GET';
    if (pathname.endsWith('/auth/me')) return response({ role: 'member' });
    if (pathname.includes('/audit')) return response([]);
    if (pathname.endsWith('/groups/RACE01') && method === 'GET') {
      if (!groupLoaded) { groupLoaded = true; return response(groupOf(originalNote)); }
      return new Promise(resolve => groupPending.push({ resolve: data => resolve(response(data)), fail: () => resolve(response({ error: 'Group not found' }, 404)) }));
    }
    if (pathname.endsWith('/info')) {
      if (!infoLoaded) { infoLoaded = true; return response(infoOf()); }
      return new Promise(resolve => infoPending.push(data => resolve(response(data))));
    }
    if (pathname.endsWith('/notes/note') && method === 'PATCH') {
      const patch = JSON.parse(options.body);
      saved = { ...saved, ...patch, revision: saved.revision + 1 };
      return response(saved);
    }
    throw new Error(`Unexpected test request: ${method} ${pathname}`);
  };
  localStorage.setItem('splitdumb_actors', JSON.stringify({ RACE01: member }));
  localStorage.removeItem('splitdumb_groups');
  root = createRoot(host);
  await act(async () => { root.render(<MemoryRouter initialEntries={['/splitdumb/group/RACE01']}><Routes><Route path="/splitdumb/group/:code" element={<Group />} /></Routes></MemoryRouter>); });
  await click('Group info'); await click('Notes'); await click('Booking');
  await click('📌 Pin');
  await click('✏️ Edit');
  await act(async () => {
    const el = host.querySelector('#ns-editor-body');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, 'Saved');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click('Save note');
  assert(groupPending.length === 2 && infoPending.length === 2, 'Expected overlapping refresh requests');
}
async function test(name, fn) {
  try { await setup(); await fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.message }); }
  finally { if (root) await act(async () => { root.unmount(); }); window.fetch = originalFetch; }
}
await test('older group refresh cannot roll back an acknowledged note save', async () => {
  await act(async () => { groupPending[1].resolve(groupOf(saved)); });
  assert(host.querySelector('.ns-reader-body')?.textContent === 'Saved', 'Newest refresh lost saved note');
  await act(async () => { groupPending[0].resolve(groupOf({ ...originalNote, pinned: true, revision: 2 })); });
  assert(host.querySelector('.ns-reader-body')?.textContent === 'Saved', 'Older refresh rolled back saved note');
});
await test('older failed group refresh cannot remove a valid recent group', async () => {
  await act(async () => { groupPending[1].resolve(groupOf(saved)); });
  await act(async () => { groupPending[0].fail(); });
  assert(JSON.parse(localStorage.getItem('splitdumb_groups')).some(g => g.code === 'RACE01'), 'Stale 404 removed current group');
});
await test('older utility refresh cannot replace the latest group-info snapshot', async () => {
  await act(async () => { infoPending[1](infoOf('Latest stay')); });
  await act(async () => { infoPending[0](infoOf('Old stay')); });
  await click('Stay');
  assert(host.querySelector('.ns-stay-title')?.textContent === 'Latest stay', 'Older info refresh replaced latest stay');
});
window.groupRefreshRegressionResults = results;
document.getElementById('results').textContent = JSON.stringify(results, null, 2);
document.title = results.every(r => r.passed) ? 'PASS group refresh regressions' : 'FAIL group refresh regressions';
