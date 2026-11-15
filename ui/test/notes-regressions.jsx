import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import NotesSheet from '../src/NotesSheet';

// Actual shared components, real DOM events, fake in-memory adapters only.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const host = document.querySelector('#test-root');
const results = [];
const note = { id: '1', title: 'Booking', body: 'Original', revision: 1, created_at: '2026-01-01T12:00:00Z' };
let root;
let props;
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const render = async (patch = {}) => {
  props = { ...props, ...patch };
  await act(async () => { root.render(<NotesSheet {...props} />); });
};
const button = (text) => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text || b.getAttribute('aria-label') === text || b.querySelector('.ns-row-title')?.textContent === text);
const click = async (text) => {
  const el = button(text);
  assert(el, `Missing button: ${text}`);
  await act(async () => { el.click(); });
};
const input = async (id, value) => {
  const el = host.querySelector(id);
  assert(el, `Missing input: ${id}`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const edit = async () => { await click('Booking'); await click('✏️ Edit'); };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function test(name, fn) {
  root = createRoot(host);
  props = { open: true, notes: [note], adapter: {}, onClose: () => {} };
  try { await render(); await fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.message }); }
  finally { await act(async () => { root.unmount(); }); }
}

await test('draft keeps original revision across refetch and conflict retries', async () => {
  const calls = [];
  const latest = { ...note, body: 'Remote', revision: 2 };
  await render({ adapter: { editNote: async (id, data) => { calls.push(data); throw Object.assign(new Error('Conflict'), { status: 409, note: latest }); } } });
  await edit(); await input('#ns-editor-body', 'Mine');
  await render({ notes: [latest] });
  await click('Save note'); await click('Save note');
  assert(calls.length === 2 && calls.every(c => c.expected_revision === 1), `Base revision changed: ${JSON.stringify(calls)}`);
  assert(host.querySelector('#ns-editor-body').value === 'Mine', 'Conflict lost draft');
  await click('Load latest'); await input('#ns-editor-body', 'Merged'); await click('Save note');
  assert(calls[2].expected_revision === 2, 'Load latest did not explicitly rebase');
});
await test('dirty comparison uses original content, not refetched content', async () => {
  await edit(); await input('#ns-editor-body', 'Mine');
  await render({ notes: [{ ...note, body: 'Mine', revision: 2 }] });
  await click('Close notes');
  assert(button('Discard'), 'Refetch hid unsaved changes warning');
});
await test('same-tick Ctrl/Cmd+S sends one create', async () => {
  const pending = deferred(); let calls = 0;
  await render({ notes: [], adapter: { addNote: () => { calls++; return pending.promise; } } });
  await click('＋ New note'); await input('#ns-editor-body', 'New body');
  const el = host.querySelector('#ns-editor-body');
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true }));
  });
  assert(calls === 1, `Created ${calls} requests`);
  await act(async () => { pending.resolve({ ...note, id: 'new-id', body: 'New body' }); });
});
await test('saving disables editing and navigation until request completes', async () => {
  const pending = deferred();
  await render({ adapter: { editNote: () => pending.promise } });
  await edit(); await input('#ns-editor-body', 'Mine'); await click('Save note');
  assert(host.querySelector('#ns-editor-title').disabled && host.querySelector('#ns-editor-body').disabled, 'Inputs still editable during save');
  assert(button('Cancel').disabled, 'Cancel enabled during save');
  await click('Close notes');
  assert(!button('Discard'), 'Close can discard an in-flight draft');
  await act(async () => { pending.resolve({ ...note, body: 'Mine', revision: 2 }); });
  assert(host.querySelector('.ns-reader-body')?.textContent === 'Mine', 'Saved record not shown');
});
await test('failed save retains text, unlocks inputs, and retries the original base', async () => {
  const calls = [];
  await render({ adapter: { editNote: async (id, data) => {
    calls.push(data);
    if (calls.length === 1) throw new Error('Offline');
    return { ...note, ...data, revision: 3 };
  } } });
  await edit(); await input('#ns-editor-body', 'Retained'); await click('Save note');
  assert(host.querySelector('#ns-editor-body').value === 'Retained', 'Failure lost draft');
  assert(!host.querySelector('#ns-editor-body').disabled, 'Failure left editor locked');
  await render({ notes: [{ ...note, body: 'Remote', revision: 2 }] });
  await click('Save note');
  assert(calls.length === 2 && calls.every(c => c.expected_revision === 1), 'Retry advanced revision');
  assert(host.querySelector('.ns-reader-body')?.textContent === 'Retained', 'Retry did not complete');
});
await test('clean editor ignores remote changes for dirty detection and reopens latest base', async () => {
  await edit(); await render({ notes: [{ ...note, body: 'Remote', revision: 2 }] });
  await click('Cancel');
  assert(!button('Discard'), 'Unedited draft incorrectly became dirty');
  await click('✏️ Edit');
  assert(host.querySelector('#ns-editor-body').value === 'Remote', 'Clean canceled draft shadowed latest note');
});
await test('discard-close reopens a usable index instead of blank editor', async () => {
  await render({ onClose: () => { props = { ...props, open: false }; root.render(<NotesSheet {...props} />); } });
  await click('＋ New note'); await input('#ns-editor-body', 'Discard me');
  await click('Close notes'); await click('Discard'); await render({ open: true });
  assert(host.querySelector('.ns-index'), 'Reopened without index');
  await click('＋ New note');
  assert(host.querySelector('#ns-editor-body').value === '', 'Discarded text returned');
});
await test('acknowledged edit overlay does not resurrect a remotely deleted note', async () => {
  const saved = { ...note, body: 'Saved', revision: 2 };
  await render({ adapter: { editNote: async () => saved } });
  await edit(); await input('#ns-editor-body', 'Saved'); await click('Save note');
  assert(host.querySelector('.ns-reader-body').textContent === 'Saved', 'No immediate overlay');
  await render({ notes: [{ ...saved }] }); await render({ notes: [] });
  assert(host.textContent.includes('no longer available'), 'Overlay resurrected deleted record');
  await click('← All notes'); assert(host.textContent.includes('No notes yet'), 'Deleted record in index');
});
await test('acknowledged creation overlay also retires', async () => {
  const saved = { ...note, id: 'created', body: 'Created' };
  await render({ notes: [], adapter: { addNote: async () => saved } });
  await click('＋ New note'); await input('#ns-editor-body', 'Created'); await click('Save note');
  await render({ notes: [saved] }); await render({ notes: [] });
  assert(host.textContent.includes('no longer available'), 'Created overlay resurrected deleted record');
});
await test('missing reader offers All notes recovery', async () => {
  await click('Booking'); await render({ notes: [] }); await click('← All notes');
  assert(host.querySelector('.ns-index'), 'Cannot recover from missing reader');
});
await test('linkification excludes sentence punctuation and unmatched wrappers, preserves balanced URL parentheses', async () => {
  const body = 'Book (https://example.com/booking?code=ABC). Also https://example.com/wiki/Place_(city), and https://example.com/x! javascript:alert(1) <img src=x onerror=alert(1)>';
  await render({ notes: [{ ...note, body }] }); await click('Booking');
  const links = [...host.querySelectorAll('.ns-reader-body a')];
  assert(JSON.stringify(links.map(a => a.getAttribute('href'))) === JSON.stringify(['https://example.com/booking?code=ABC', 'https://example.com/wiki/Place_(city)', 'https://example.com/x']), `Bad links: ${links.map(a => a.href).join(', ')}`);
  assert(host.querySelector('.ns-reader-body').textContent === body, 'Linkification altered text');
  assert(!host.querySelector('.ns-reader-body img'), 'HTML was interpreted');
  assert(links.every(a => a.target === '_blank' && a.rel.includes('noopener')), 'Unsafe link target');
});
await test('create then delete keeps its tombstone through a delayed creation refresh', async () => {
  const created = { ...note, id: 'created', body: 'Created' };
  await render({ notes: [], adapter: { addNote: async () => created, deleteNote: async () => ({ ok: true }) } });
  await click('＋ New note'); await input('#ns-editor-body', 'Created'); await click('Save note');
  await click('🗑 Delete');
  await act(async () => { host.querySelector('.modal .btn-danger').click(); });
  assert(host.textContent.includes('No notes yet'), 'Delete did not hide note');
  await render({ notes: [created] });
  assert(host.textContent.includes('No notes yet'), 'Delayed creation snapshot resurrected deleted note');
  await render({ notes: [] });
});
window.notesRegressionResults = results;
document.querySelector('#results').textContent = results.map(r => `${r.passed ? 'PASS' : 'FAIL'} ${r.name}${r.error ? ': ' + r.error : ''}`).join('\n');
document.title = results.every(r => r.passed) ? 'PASS notes regressions' : 'FAIL notes regressions';
console.log(JSON.stringify(results));
