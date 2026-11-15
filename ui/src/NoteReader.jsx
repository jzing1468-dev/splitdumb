/**
 * NoteReader — one focused note (Proposal D2).
 * Title as heading, preserved line breaks, safe http(s) links, secondary
 * metadata, and actions that stay reachable while the body scrolls.
 *
 * Props:
 *   - note: { id, title, body, pinned, author_name, created_at, updated_at }
 *   - onBack, onEdit, onTogglePin(note), onDelete(note)
 */
import { useState } from 'react';
import { fmtNoteDate } from './dateFormat';
import { displayTitle } from './noteSearch';

/** Only http(s) URLs become links; everything else stays plain text. */
const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

function linkEnd(part) {
  let end = part.length;
  const pairs = { ')': '(', ']': '[', '}': '{' };
  while (end > 0) {
    const last = part[end - 1];
    if (/[.,!?;:]/.test(last)) { end--; continue; }
    const open = pairs[last];
    if (!open) break;
    const url = part.slice(0, end);
    if (url.split(last).length <= url.split(open).length) break;
    end--;
  }
  return end;
}

function renderBody(body) {
  // split() with a capture group alternates plain text / URL parts.
  return String(body || '')
    .split(URL_RE)
    .map((part, i) => {
      if (i % 2 === 0) return part;
      // Sentence punctuation and unbalanced wrappers are text, not URL data.
      // Balanced parentheses inside a URL (e.g. wiki paths) remain intact.
      const end = linkEnd(part);
      const url = part.slice(0, end);
      return [<a key={i} href={url} target="_blank" rel="noopener noreferrer">{url}</a>, part.slice(end)];
    });
}

function NoteReader({ note, onBack, onEdit, onTogglePin, onDelete }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(note.body || '');
      setCopied(true);
      setCopyError('');
      window.setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      setCopyError('Copy failed — select the text and copy manually.');
    }
  };

  const created = fmtNoteDate(note.created_at);
  const edited = note.updated_at && note.updated_at !== note.created_at
    ? ` · Edited ${fmtNoteDate(note.updated_at)}` : '';

  return (
    <div className="ns-reader">
      <button type="button" className="btn btn-ghost btn-xs ns-back" onClick={onBack}>← All notes</button>
      <h2 className="ns-reader-title">
        {displayTitle(note)}{note.pinned && <span className="ns-pin-flag">📌</span>}
      </h2>
      <div className="ns-reader-meta">
        {note.author_name || '?'} · Created {created}{edited}
      </div>
      <div className="ns-reader-body">{renderBody(note.body)}</div>
      {copyError && <div className="error" role="alert">{copyError}</div>}
      <div className="ns-reader-actions">
        <button type="button" className="btn btn-ghost btn-xs" onClick={onEdit}>✏️ Edit</button>
        <button type="button" className="btn btn-ghost btn-xs" onClick={copy}>
          {copied ? '✓ Copied' : '📋 Copy note'}
        </button>
        <button type="button" className="btn btn-ghost btn-xs" onClick={() => onTogglePin(note)}>
          {note.pinned ? '📌 Unpin' : '📌 Pin'}
        </button>
        <span className="ns-flex" />
        <button type="button" className="btn btn-danger-outline btn-xs" onClick={() => onDelete(note)}>🗑 Delete</button>
      </div>
    </div>
  );
}

export default NoteReader;