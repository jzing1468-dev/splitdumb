/**
 * NoteEditor — ONE editor for new and existing notes (Proposal D3).
 * Labeled Title + auto-growing Body, sticky Save/Cancel bar (no scrolling
 * past the note to save), Ctrl/Cmd+S saves, Enter in the body is a newline.
 *
 * The editor is fully controlled: the container (NotesSheet) owns the draft,
 * so unsaved text survives navigation and closing the sheet.
 *
 * Props:
 *   - draft: { title, body }
 *   - onDraftChange(patch): merge { title?, body? } into the draft
 *   - saving: bool, error: string (shown with role=alert)
 *   - conflict: server note from a 409 revision mismatch, or null
 *   - onLoadLatest(): reload the server version into the editor
 *   - onKeepMine(): copy my text + discard the draft
 *   - onSave(), onCancel()
 */
import { useRef, useEffect } from 'react';

function NoteEditor({ draft, onDraftChange, saving, error, conflict, onLoadLatest, onKeepMine, onSave, onCancel }) {
  const bodyRef = useRef(null);

  // Auto-grow: size to existing content, generous minimum (old NotesSheet pattern)
  const autoGrow = (el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.max(96, el.scrollHeight) + 'px';
  };
  // Re-size whenever the draft changes (incl. Load latest replacing the text)
  useEffect(() => { autoGrow(bodyRef.current); }, [draft?.body]);

  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (!saving) onSave();
    }
  };

  const status = saving ? 'Saving…'
    : error ? 'Save failed — Retry'
    : 'Unsaved changes';

  return (
    <div className="ns-editor" onKeyDown={onKeyDown}>
      {conflict && (
        <div className="ns-conflict" role="alert">
          Edited by someone else since you started.
          <div className="ns-conflict-actions">
            <button type="button" className="btn btn-ghost btn-xs" disabled={saving} onClick={onLoadLatest}>Load latest</button>
            <button type="button" className="btn btn-ghost btn-xs" disabled={saving} onClick={onKeepMine}>Keep my version (copy text)</button>
          </div>
        </div>
      )}
      <label className="ns-field-label" htmlFor="ns-editor-title">Title</label>
      <input id="ns-editor-title" className="form-input" type="text" maxLength={100}
        placeholder="Title (optional) — e.g. Airbnb, Schedule"
        disabled={saving} value={draft.title} onChange={e => onDraftChange({ title: e.target.value })} />
      <label className="ns-field-label" htmlFor="ns-editor-body">
        Body <span className="ns-count">{draft.body.length}/4000</span>
      </label>
      <textarea id="ns-editor-body" ref={bodyRef} className="form-input ns-body-input" maxLength={4000}
        rows={4} placeholder="Note — address, confirmation code, plan…"
        disabled={saving} value={draft.body}
        onChange={e => { onDraftChange({ body: e.target.value }); autoGrow(e.target); }} />
      {error && <div className="error" role="alert">{error}</div>}
      <div className="ns-sticky-actions">
        <span className="ns-sticky-status" aria-live="polite">{status}</span>
        <button type="button" className="btn btn-ghost btn-xs" disabled={saving} onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary btn-xs"
          disabled={saving || !(draft.body || '').trim()} onClick={onSave}>
          {saving ? 'Saving…' : 'Save note'}
        </button>
      </div>
    </div>
  );
}

export default NoteEditor;