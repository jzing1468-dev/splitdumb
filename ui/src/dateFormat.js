/**
 * Display-only date formatting for notes. Pure helpers, no React.
 *
 * Timestamp shapes arriving from the notes API:
 *   - ISO UTC strings with 'T'/'Z' (new + updated rows) — parse directly.
 *   - Legacy SQLite datetimes 'YYYY-MM-DD HH:mm:ss' (UTC) — ' ' → 'T' + 'Z'
 *     BEFORE parsing (appending 'T12:00:00' to these produced Invalid Date).
 *   - Date-only 'YYYY-MM-DD' — resolve to local noon so the calendar day
 *     never shifts across timezones; display only, never persisted.
 */

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SQLITE_DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/;

/** Parse a note timestamp into a Date, or null when missing/unparseable. */
export function parseNoteDate(ts) {
  if (ts == null || ts === '') return null;
  const str = String(ts);
  if (str.includes('T')) return new Date(str);
  if (SQLITE_DATETIME_RE.test(str)) return new Date(str.replace(' ', 'T') + 'Z');
  if (DATE_ONLY_RE.test(str)) return new Date(str + 'T12:00:00');
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Human display date ('Nov 14, 2026'); '' when missing, 'Unknown date' when invalid. */
export function fmtNoteDate(ts) {
  const d = parseNoteDate(ts);
  if (!d) return ts ? 'Unknown date' : '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/*
 * Wall-clock (local, display-only) formatting for group-info fields.
 * Stay/travel datetimes arrive as LOCAL 'YYYY-MM-DDTHH:mm' (or date-only
 * 'YYYY-MM-DD') strings — display exactly as typed, never converted between
 * timezones. new Date('YYYY-MM-DDTHH:mm') parses as local wall-clock per spec.
 */
const WALL_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * Format a local wall-clock datetime for display ('Nov 14, 6:30 PM').
 * Date-only values show the calendar day; invalid values show '—'.
 * Missing (null/'') returns '' so callers can omit empty rows.
 */
export function fmtWallDateTime(v) {
  if (v == null || v === '') return '';
  const str = String(v);
  let d;
  if (WALL_DATETIME_RE.test(str)) d = new Date(str);
  else if (DATE_ONLY_RE.test(str)) d = new Date(str + 'T12:00:00');
  else d = new Date(str);
  if (Number.isNaN(d.getTime())) return '—';
  const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return DATE_ONLY_RE.test(str) ? day : `${day}, ${time}`;
}

/** True when a wall-clock value parses as a datetime (not date-only/missing). */
export function isWallTime(v) {
  return WALL_DATETIME_RE.test(String(v || ''));
}