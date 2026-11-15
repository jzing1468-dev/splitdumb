/**
 * Pure note filter/sort/title helpers for the notes index (Proposal D1).
 * No React, no I/O — deterministic so rows never jump between renders.
 */
import { parseNoteDate } from './dateFormat.js';

/** Display title: explicit title, else first non-empty body line (~60 chars), else 'Untitled note'. */
export function displayTitle(note) {
  const title = String(note?.title || '').trim();
  if (title) return title;
  const firstLine = String(note?.body || '')
    .split('\n')
    .map(l => l.trim())
    .find(l => l.length > 0) || '';
  if (!firstLine) return 'Untitled note';
  const clipped = firstLine.length > 60 ? firstLine.slice(0, 60).trimEnd() + '…' : firstLine;
  return clipped || 'Untitled note';
}

/**
 * Case-insensitive search over title OR body; every whitespace-separated
 * query word must match somewhere in the combined title+body text.
 */
export function searchNotes(notes, query) {
  const list = Array.isArray(notes) ? notes : [];
  const q = String(query || '').trim().toLowerCase();
  if (!q) return list.slice();
  const words = q.split(/\s+/);
  return list.filter(n => {
    const hay = `${n.title || ''}\n${n.body || ''}`.toLowerCase();
    return words.every(w => hay.includes(w));
  });
}

const idString = (n) => (n?.id == null ? '' : String(n.id));
const idRank = (s) => {
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
};
/** Stable tie-break by ID so equal-valued rows never reorder. */
const byId = (a, b) =>
  (idRank(idString(a)) - idRank(idString(b))) ||
  (idString(a) < idString(b) ? -1 : idString(a) > idString(b) ? 1 : 0);

/**
 * Sort notes. Modes:
 *   - 'updated' (default): newest updated_at/created_at first
 *   - 'title': case-insensitive localeCompare on the display title
 * Both use the stable ID tie-break.
 */
export function sortNotes(notes, mode = 'updated') {
  const arr = (Array.isArray(notes) ? notes : []).slice();
  if (mode === 'title') {
    arr.sort((a, b) =>
      displayTitle(a).localeCompare(displayTitle(b), undefined, { sensitivity: 'base' }) ||
      byId(a, b));
    return arr;
  }
  const ts = (n) => {
    const d = parseNoteDate(n?.updated_at || n?.created_at);
    return d ? d.getTime() : 0;
  };
  arr.sort((a, b) => (ts(b) - ts(a)) || byId(a, b));
  return arr;
}