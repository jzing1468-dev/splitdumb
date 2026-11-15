// Browser regressions against real components, without production API calls.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import GroupInfoSheet from '../src/GroupInfoSheet';
import { validateStay, validateTravelPlan } from '../../core/src/validators';
import '../src/styles.css';

const sync = fn => act(() => { flushSync(fn); });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const root = createRoot(document.getElementById('root'));
const results = [];
const tick = () => act(async () => {});
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const member = { id: 'alice', name: 'Alice', color: '#123456' };
let props;
let calls;
const render = () => sync(() => root.render(<GroupInfoSheet {...props} />));
const shown = selector => [...document.querySelectorAll(selector)].filter(el => el.getClientRects().length);
const button = text => shown('button').find(el => el.textContent.trim() === text);
const click = async text => { const el = button(text); assert(el, `Missing button: ${text}`); sync(() => el.click()); await tick(); };
const input = async (selector, value) => {
  const el = document.querySelector(selector);
  assert(el, `Missing input: ${selector}`);
  const prototype = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(el, value);
  sync(() => el.dispatchEvent(new Event('input', { bubbles: true })));
  await tick();
};
async function setup(info = {}) {
  sync(() => root.render(null));
  calls = [];
  props = {
    open: true, info: { stay: null, travel_plans: [], lists: [], ...info },
    notes: [], members: [member], actor: member, onClose() {},
    adapter: {
      async saveStay(payload) {
        calls.push(payload);
        const error = validateStay(payload);
        if (error) throw new Error(error);
        return { id: 'stay', ...payload, revision: 1 };
      },
      async saveTravelPlan(id, payload) {
        calls.push(payload);
        const error = validateTravelPlan(payload);
        if (error) throw new Error(error);
        return { id: 'plan', member_id: id, member_name: 'Alice', ...payload, revision: 1 };
      },
    },
  };
  render(); await tick();
}
async function test(name, fn) {
  try { await fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.message }); }
}

await test('first stay uses a valid create payload', async () => {
  await setup(); await click('Add stay details'); await input('#ns-stay-title', 'Cabin'); await click('Save stay');
  assert(calls.length === 1 && !Object.hasOwn(calls[0], 'expected_revision'), 'Create must omit expected_revision');
  assert(shown('.ns-stay-title')[0]?.textContent === 'Cabin', 'Stay did not save');
});
await test('first travel plan uses a valid create payload', async () => {
  await setup(); await click('Arrivals'); await click('＋ Add'); await input('#ns-plan-arrival-place', 'Airport'); await click('Save plan');
  assert(calls.length === 1 && !Object.hasOwn(calls[0], 'expected_revision'), 'Create must omit expected_revision');
  assert(!shown('#ns-plan-arrival-place').length, 'Plan did not leave editor');
});
await test('travel 409 loads latest and saves its revision', async () => {
  const plan = { id: 'plan', member_id: member.id, arrival_place: 'Old', revision: 1 };
  await setup({ travel_plans: [plan] });
  props.adapter.saveTravelPlan = async (id, payload) => {
    calls.push(payload);
    if (calls.length === 1) throw Object.assign(new Error('Conflict'), { status: 409, body: { travel_plan: { ...plan, arrival_place: 'Latest', revision: 2 } } });
    return { ...plan, ...payload, revision: 3 };
  };
  await click('Arrivals'); await click('✏️ Edit'); await input('#ns-plan-arrival-place', 'Mine'); await click('Save plan');
  await click('Load latest');
  assert(document.querySelector('#ns-plan-arrival-place').value === 'Latest', 'Latest content missing');
  await click('Save plan'); assert(calls[1].expected_revision === 2, 'Latest revision missing');
});
await test('section switches retain stay, travel and list drafts', async () => {
  await setup(); await click('Add stay details'); await input('#ns-stay-title', 'Unsaved cabin');
  await click('Arrivals'); await click('＋ Add'); await input('#ns-plan-arrival-place', 'Unsaved airport');
  await click('Lists'); await click('＋ New list'); await input('#ns-new-list-title', 'Unsaved groceries');
  await click('Stay'); assert(document.querySelector('#ns-stay-title')?.value === 'Unsaved cabin', 'Stay draft lost');
  await click('Arrivals'); assert(document.querySelector('#ns-plan-arrival-place')?.value === 'Unsaved airport', 'Travel draft lost');
  await click('Lists'); assert(document.querySelector('#ns-new-list-title')?.value === 'Unsaved groceries', 'List draft lost');
});
await test('form maxlength matches server limits', async () => {
  await setup(); await click('Add stay details');
  assert(document.querySelector('#ns-stay-instructions').maxLength === 2000, 'Stay instructions limit');
  assert(document.querySelector('#ns-stay-contact-name').maxLength === 60, 'Stay contact limit');
  await click('Arrivals'); await click('＋ Add');
  assert(document.querySelector('#ns-plan-arrival-place').maxLength === 120, 'Travel place limit');
  assert(document.querySelector('#ns-plan-arrival-detail').maxLength === 200, 'Travel detail limit');
  assert(document.querySelector('#ns-plan-notes').maxLength === 500, 'Travel notes limit');
  await click('Lists'); await click('＋ New list');
  assert(document.querySelector('#ns-new-list-title').maxLength === 60, 'List title limit');
});
await test('stay edit revision is not upgraded by background refetch', async () => {
  await setup({ stay: { id: 'stay', title: 'Base', revision: 1 } });
  await click('✏️ Edit'); await input('#ns-stay-title', 'My draft');
  props.info = { ...props.info, stay: { id: 'stay', title: 'Remote', revision: 2 } }; render(); await tick();
  await click('Save stay'); assert(calls[0].expected_revision === 1, 'Draft revision silently upgraded');
});
await test('travel edit revision is not upgraded by background refetch', async () => {
  const plan = { id: 'plan', member_id: member.id, arrival_place: 'Base', revision: 1 };
  await setup({ travel_plans: [plan] }); await click('Arrivals'); await click('✏️ Edit');
  await input('#ns-plan-arrival-place', 'My draft');
  props.info = { ...props.info, travel_plans: [{ ...plan, arrival_place: 'Remote', revision: 2 }] }; render(); await tick();
  await click('Save plan'); assert(calls[0].expected_revision === 1, 'Draft revision silently upgraded');
});

await test('list creation locks its draft and sends one request while pending', async () => {
  await setup();
  let resolve;
  props.adapter.addList = payload => { calls.push(payload); return new Promise(r => { resolve = r; }); };
  await click('Lists'); await click('＋ New list'); await input('#ns-new-list-title', 'Groceries');
  const create = button('Create list');
  sync(() => { create.click(); create.click(); }); await tick();
  const inputLocked = document.querySelector('#ns-new-list-title').matches(':disabled');
  const count = calls.length;
  resolve({ id: 'list', title: 'Groceries', revision: 1, items: [] }); await tick();
  assert(count === 1 && inputLocked, `Create calls: ${count}; draft locked: ${inputLocked}`);
});
await test('list edit locks during save, retains failed draft and original revision, and explicitly rebases', async () => {
  const list = { id: 'list', title: 'Base', revision: 1, items: [] };
  await setup({ lists: [list] });
  let reject;
  props.adapter.updateList = (id, payload) => { calls.push(payload); return new Promise((resolve, r) => { reject = r; }); };
  await click('Lists'); await click('✏️ Edit'); await input('#ns-list-title-list', 'Mine');
  props.info = { ...props.info, lists: [{ ...list, title: 'Remote', revision: 2 }] }; render(); await tick();
  await click('Save');
  const locked = document.querySelector('#ns-list-title-list').matches(':disabled');
  reject(Object.assign(new Error('Conflict'), { status: 409, body: { list: { ...list, title: 'Remote', revision: 2 } } })); await tick();
  assert(locked, 'List edit remained editable while saving');
  assert(calls[0].expected_revision === 1, 'List edit silently advanced revision');
  assert(document.querySelector('#ns-list-title-list').value === 'Mine', 'Failure lost list draft');
  assert(!document.querySelector('#ns-list-title-list').matches(':disabled'), 'Failure left list locked');
  await click('Load latest');
  props.adapter.updateList = async (id, payload) => { calls.push(payload); return { ...list, ...payload, revision: 3 }; };
  await click('Save'); assert(calls[1].expected_revision === 2, 'Load latest did not rebase list revision');
});
await test('item addition locks its input, blocks duplicate requests, and accepts the next item after success', async () => {
  await setup({ lists: [{ id: 'list', title: 'Groceries', revision: 1, items: [] }] });
  let resolve;
  props.adapter.addItem = (id, payload) => { calls.push(payload); return new Promise(r => { resolve = r; }); };
  await click('Lists'); await input('.ns-item-add input', 'Milk');
  const add = button('＋ Add'); sync(() => { add.click(); add.click(); }); await tick();
  const count = calls.length, locked = document.querySelector('.ns-item-add input').matches(':disabled');
  resolve({ id: 'item', list_id: 'list', text: 'Milk', revision: 1 }); await tick();
  assert(count === 1 && locked, `Item calls: ${count}; input locked: ${locked}`);
  await input('.ns-item-add input', 'Eggs'); assert(document.querySelector('.ns-item-add input').value === 'Eggs', 'Next draft lost');
  assert(document.querySelector('.ns-item-add input').maxLength === 200, 'Item limit mismatch');
});
await test('section navigation retains existing list edits and add-item drafts', async () => {
  await setup({ lists: [{ id: 'list', title: 'Groceries', revision: 1, items: [] }] });
  await click('Lists'); await input('.ns-item-add input', 'Milk'); await click('✏️ Edit');
  await input('#ns-list-title-list', 'Revised groceries');
  await click('Stay'); await click('Lists');
  assert(document.querySelector('#ns-list-title-list').value === 'Revised groceries', 'Existing-list edit lost');
  assert(document.querySelector('#ns-list-title-list').maxLength === 60, 'Edit-list limit mismatch');
  await click('Cancel'); assert(document.querySelector('.ns-item-add input').value === 'Milk', 'Add-item draft lost');
});
for (const kind of ['stay', 'travel']) {
  await test(`${kind} save locks inputs, blocks duplicates, and retains a failed draft for retry`, async () => {
    await setup(); let reject;
    const operation = payload => { calls.push(payload); return new Promise((resolve, r) => { reject = r; }); };
    const selector = kind === 'stay' ? '#ns-stay-title' : '#ns-plan-arrival-place';
    const label = kind === 'stay' ? 'Save stay' : 'Save plan';
    if (kind === 'stay') { props.adapter.saveStay = operation; await click('Add stay details'); }
    else { props.adapter.saveTravelPlan = (id, payload) => operation(payload); await click('Arrivals'); await click('＋ Add'); }
    await input(selector, 'Retain me');
    const save = button(label); sync(() => { save.click(); save.click(); }); await tick();
    const locked = document.querySelector(selector).matches(':disabled');
    reject(new Error('Offline')); await tick();
    assert(calls.length === 1 && locked, 'Pending guard or input lock missing');
    assert(document.querySelector(selector).value === 'Retain me' && !document.querySelector(selector).matches(':disabled'), `Failure draft: ${document.querySelector(selector).value}; locked: ${document.querySelector(selector).matches(':disabled')}`);
  });
}

sync(() => root.render(null));
window.__infoRegressionResults = results;
document.getElementById('results').textContent = JSON.stringify(results, null, 2);
document.title = results.every(result => result.passed) ? 'PASS: Group info regressions' : 'FAIL: Group info regressions';
