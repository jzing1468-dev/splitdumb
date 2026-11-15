// @splitdumb/core — validators.js

export function validateGroupName(name) {
  if (!name || name.trim().length === 0 || name.length > 50) {
    return 'Group name must be 1-50 characters';
  }
  return null;
}

export function validateMemberName(name) {
  if (!name || name.trim().length === 0 || name.length > 30) {
    return 'Member name must be 1-30 characters';
  }
  return null;
}

export function validateExpense(data) {
  if (!data.description || data.description.trim().length === 0) return 'Description is required';
  if (!data.amount || data.amount <= 0) return 'Amount must be greater than $0';
  if (!data.payer_id) return 'Payer is required';
  if (!data.split_type) return 'Split type is required';
  return null;
}

export function validateSettlement(fromId, toId, amount) {
  if (!fromId || !toId) return 'Both parties are required';
  if (fromId === toId) return 'Cannot settle with yourself';
  if (!amount || amount <= 0) return 'Amount must be greater than $0';
  return null;
}

function asObject(data) {
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

// Field-level checks shared by create and partial update.
// title: optional, but if present must be a string (<=100 chars after trim).
// body: if present must be a string, 1..4000 chars after trim.
// pinned: if present must be a real boolean.
function validateNoteFields(d) {
  if (d.title !== undefined && (d.title === null || typeof d.title !== 'string')) {
    return 'Note title must be a string';
  }
  if (typeof d.title === 'string' && d.title.trim().length > 100) {
    return 'Note title must be at most 100 characters';
  }
  if (d.body !== undefined && (d.body === null || typeof d.body !== 'string')) {
    return 'Note body is required';
  }
  if (typeof d.body === 'string') {
    const body = d.body.trim();
    if (body.length === 0 || body.length > 4000) return 'Note body must be 1-4000 characters';
  }
  if (d.pinned !== undefined && typeof d.pinned !== 'boolean') {
    return 'Note pinned must be a boolean';
  }
  return null;
}

// Create: {title?, body, pinned?} — body required.
export function validateNote(data) {
  const d = asObject(data);
  if (typeof d.body !== 'string') return 'Note body is required';
  return validateNoteFields(d);
}

// Partial update: {title?, body?, pinned?, expected_revision?}.
export function validateNotePatch(data) {
  const d = asObject(data);
  const hasRecognized = ['title', 'body', 'pinned', 'expected_revision'].some(k => d[k] !== undefined);
  if (!hasRecognized) return 'No recognized fields to update';
  if (d.expected_revision !== undefined && !Number.isInteger(d.expected_revision)) {
    return 'expected_revision must be an integer';
  }
  return validateNoteFields(d);
}

// ---- Group utilities (Releases 1-3): stay / travel plans / lists ----
// Shared typed checks. Datetime fields are LOCAL wall-clock text as typed by
// users ('YYYY-MM-DD' or 'YYYY-MM-DD[ T]HH:MM[:SS]') — never converted to UTC.

const URL_RE = /^https?:\/\//;
const LOCAL_DATETIME_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/;

export const LIST_KINDS = ['bring', 'buy', 'checkout'];
export const TRAVEL_STATUSES = ['planned', 'on_the_way', 'arrived'];

function isValidTimezone(tz) {
  if (typeof Intl.supportedValuesOf === 'function') {
    try { return Intl.supportedValuesOf('timeZone').includes(tz); } catch { /* fall through */ }
  }
  return typeof tz === 'string' && tz.length > 0;
}

function checkStringField(d, key, label, max) {
  if (d[key] === undefined || d[key] === null) return null;
  if (typeof d[key] !== 'string') return `${label} must be a string or null`;
  if (d[key].trim().length > max) return `${label} must be at most ${max} characters`;
  return null;
}

function checkUrlField(d, key, label) {
  if (d[key] === undefined || d[key] === null) return null;
  if (typeof d[key] !== 'string' || !URL_RE.test(d[key].trim())) {
    return `${label} must be an http(s) URL or null`;
  }
  return null;
}

function checkDatetimeField(d, key, label) {
  if (d[key] === undefined || d[key] === null) return null;
  if (typeof d[key] !== 'string' || !LOCAL_DATETIME_RE.test(d[key].trim())) {
    return `${label} must be a date or date-time string or null`;
  }
  return null;
}

function checkTimezoneField(d, key, label) {
  if (d[key] === undefined || d[key] === null) return null;
  if (typeof d[key] !== 'string' || !isValidTimezone(d[key].trim())) {
    return `${label} must be a valid IANA timezone or null`;
  }
  return null;
}

function checkExpectedRevision(d) {
  if (d.expected_revision !== undefined && !Number.isInteger(d.expected_revision)) {
    return 'expected_revision must be an integer';
  }
  return null;
}

function checkIdOrNull(d, key, label) {
  if (d[key] === undefined || d[key] === null) return null;
  if (typeof d[key] !== 'string') return `${label} must be a member id or null`;
  return null;
}

const STAY_FIELDS = [
  ['title', 'Stay title', 100],
  ['address', 'Stay address', 300],
  ['listing_url', 'Stay listing URL'],
  ['checkin_at', 'Stay check-in time'],
  ['checkout_at', 'Stay checkout time'],
  ['timezone', 'Stay timezone'],
  ['instructions', 'Stay instructions', 2000],
  ['parking', 'Stay parking', 2000],
  ['wifi', 'Stay wifi', 2000],
  ['contact_name', 'Stay contact name', 60],
  ['contact_phone', 'Stay contact phone', 60],
];

const STAY_KEYS = STAY_FIELDS.map(([k]) => k);

function validateStayFields(d) {
  for (const [key, label, max] of STAY_FIELDS) {
    const err = max !== undefined
      ? checkStringField(d, key, label, max)
      : key === 'listing_url' ? checkUrlField(d, key, label)
      : key === 'timezone' ? checkTimezoneField(d, key, label)
      : checkDatetimeField(d, key, label);
    if (err) return err;
  }
  return null;
}

// Create/upsert: any subset of stay fields (+ expected_revision?); an
// explicit empty body is a valid no-op.
export function validateStay(data) {
  const d = asObject(data);
  const err = checkExpectedRevision(d);
  if (err) return err;
  return validateStayFields(d);
}

// Partial update: same fields, but at least one recognized field required.
export function validateStayPatch(data) {
  const d = asObject(data);
  if (!STAY_KEYS.concat('expected_revision').some(k => d[k] !== undefined)) {
    return 'No fields to update';
  }
  const err = checkExpectedRevision(d);
  if (err) return err;
  return validateStayFields(d);
}

const TRAVEL_FIELDS = [
  ['arrival_at', 'Travel plan arrival time'],
  ['arrival_place', 'Travel plan arrival place', 120],
  ['arrival_detail', 'Travel plan arrival detail', 200],
  ['departure_at', 'Travel plan departure time'],
  ['departure_place', 'Travel plan departure place', 120],
  ['pickup_requested', 'Travel plan pickup_requested'],
  ['pickup_by', 'Travel plan pickup_by'],
  ['status', 'Travel plan status'],
  ['notes', 'Travel plan notes', 500],
];

const TRAVEL_KEYS = TRAVEL_FIELDS.map(([k]) => k);

function validateTravelPlanFields(d) {
  for (const [key, label, max] of TRAVEL_FIELDS) {
    let err = null;
    if (key === 'arrival_at' || key === 'departure_at') {
      err = checkDatetimeField(d, key, label);
    } else if (key === 'pickup_requested') {
      if (d[key] !== undefined && d[key] !== null && typeof d[key] !== 'boolean') {
        err = `${label} must be a boolean or null`;
      }
    } else if (key === 'pickup_by') {
      err = checkIdOrNull(d, key, label);
    } else if (key === 'status') {
      if (d[key] !== undefined && d[key] !== null &&
          (typeof d[key] !== 'string' || !TRAVEL_STATUSES.includes(d[key]))) {
        err = `Travel plan status must be one of: ${TRAVEL_STATUSES.join(', ')} or null`;
      }
    } else {
      err = checkStringField(d, key, label, max);
    }
    if (err) return err;
  }
  return null;
}

// Create/upsert: one plan per member; any subset of fields.
export function validateTravelPlan(data) {
  const d = asObject(data);
  const err = checkExpectedRevision(d);
  if (err) return err;
  return validateTravelPlanFields(d);
}

export function validateTravelPlanPatch(data) {
  const d = asObject(data);
  if (!TRAVEL_KEYS.concat('expected_revision').some(k => d[k] !== undefined)) {
    return 'No fields to update';
  }
  const err = checkExpectedRevision(d);
  if (err) return err;
  return validateTravelPlanFields(d);
}

function checkListTitle(d) {
  if (d.title === undefined) return null;
  if (typeof d.title !== 'string' || d.title.trim().length === 0 || d.title.trim().length > 60) {
    return 'List title must be 1-60 characters';
  }
  return null;
}

function checkListKind(d) {
  if (d.kind === undefined || d.kind === null) return null;
  if (typeof d.kind !== 'string' || !LIST_KINDS.includes(d.kind)) {
    return `List kind must be one of: ${LIST_KINDS.join(', ')} or null`;
  }
  return null;
}

// Create: {title (required), kind?}.
export function validateList(data) {
  const d = asObject(data);
  if (typeof d.title !== 'string' || d.title.trim().length === 0 || d.title.trim().length > 60) {
    return 'List title must be 1-60 characters';
  }
  return checkListKind(d);
}

// Partial update: {title?, kind?, expected_revision?}.
export function validateListPatch(data) {
  const d = asObject(data);
  if (!['title', 'kind', 'expected_revision'].some(k => d[k] !== undefined)) {
    return 'No fields to update';
  }
  const err = checkExpectedRevision(d) || checkListTitle(d) || checkListKind(d);
  return err;
}

function checkItemText(d) {
  if (d.text === undefined || d.text === null) return null;
  if (typeof d.text !== 'string' || d.text.trim().length === 0 || d.text.trim().length > 200) {
    return 'List item text must be 1-200 characters';
  }
  return null;
}

function checkItemDone(d) {
  if (d.done === undefined) return null;
  if (typeof d.done !== 'boolean') return 'List item done must be a boolean';
  return null;
}

// Create: {text (required), assignee_id?}.
export function validateListItem(data) {
  const d = asObject(data);
  if (typeof d.text !== 'string' || d.text.trim().length === 0 || d.text.trim().length > 200) {
    return 'List item text must be 1-200 characters';
  }
  return checkIdOrNull(d, 'assignee_id', 'List item assignee');
}

// Partial update: {text?, assignee_id?, done?, expected_revision?}.
export function validateListItemPatch(data) {
  const d = asObject(data);
  if (!['text', 'assignee_id', 'done', 'expected_revision'].some(k => d[k] !== undefined)) {
    return 'No fields to update';
  }
  const err = checkExpectedRevision(d) || checkItemText(d) ||
    checkIdOrNull(d, 'assignee_id', 'List item assignee') || checkItemDone(d);
  return err;
}