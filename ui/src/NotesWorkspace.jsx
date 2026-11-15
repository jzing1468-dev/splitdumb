/**
 * NotesWorkspace — the notes view state machine (Proposal D), extracted from
 * NotesSheet so it can be embedded in the Group info sheet. NO sheet chrome:
 * no scrim, no dialog wrapper, no header title — the container shows its own.
 *
 * The workspace stays mounted (returns null while inactive) so query, sort,
 * selection and unsaved drafts survive closing the sheet and switching
 * sections. Drafts are in-memory only; bodies never touch localStorage.
 *
 * Mutations reconcile the returned saved record into an overlay so the index
 * and reader update immediately, before the parent's refresh lands. Edits
 * send expected_revision from the current base note; a 409 surfaces as
 * error.status + error.note / error.body (client/src/api.js request()).
 *
 * Props:
 *   - active: bool — true while visible; false keeps state, renders null
 *   - notes: array of { id, title, body, pinned, author_name, created_at, updated_at, revision }
 *   - members, actor: kept for parity with the rest of the shared UI
 *   - adapter: { addNote(data), editNote(id, data), deleteNote(id) }
 *   - onRefresh: () => void (refetch group data after mutations)
 *   - onEscapeBottom: () => void — Escape at the top (index) level;
 *       standalone sheet: close the sheet; embedded: back to the Stay section
 *   - onCloseRequest: () => void — explicit close (✕ / scrim click) after the
 *       dirty-editor warning; both wrappers pass their sheet close
 *   - ref: { requestClose() } — dirty-checked close for the wrapper's chrome
 */
import { useState, useEffect, useMemo, useRef, useImperativeHandle } from 'react';
import ConfirmDialog from './ConfirmDialog';
import NotesIndex from './NotesIndex';
import NoteReader from './NoteReader';
import NoteEditor from './NoteEditor';
import { searchNotes, sortNotes } from './noteSearch';

function NotesWorkspace({ ref, active = false, notes = [], members = [], actor, adapter, onRefresh, onEscapeBottom, onCloseRequest }) {
  const [view, setView] = useState('index');          // 'index' | 'reader' | 'editor'
  const [selectedId, setSelectedId] = useState(null); // note id (string); 'new' while drafting
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('updated');        // 'updated' | 'title'
  const [drafts, setDrafts] = useState({});           // { [id]: { title, body } }
  const [overlay, setOverlay] = useState({});         // { [id]: savedNote | null }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(null);     // current server note from a 409
  const [confirm, setConfirm] = useState(null);

  const searchRef = useRef(null);
  // Escape handling reads the latest state through a ref so one listener suffices
  const escapeRef = useRef(() => {});

  // Notes with reconciled mutation results overlaid. An overlay entry wins
  // only while it is at least as fresh as the props row (revision compare), so
  // a later refetch with newer data is never masked by a stale saved record.
  const effectiveNotes = useMemo(() => {
    const list = Array.isArray(notes) ? notes : [];
    const out = [];
    for (const n of list) {
      const o = overlay[String(n.id)];
      if (o === null) continue; // locally deleted, refetch not landed yet
      if (o && (o.revision ?? 0) >= (n.revision ?? 0)) { out.push(o); continue; }
      out.push(n);
    }
    const seen = new Set(list.map(n => String(n.id)));
    for (const [id, o] of Object.entries(overlay)) {
      if (o && !seen.has(id)) out.push(o); // created locally, not yet in props
    }
    return out;
  }, [notes, overlay]);

  const noteById = (id) => effectiveNotes.find(n => String(n.id) === String(id)) || null;
  const baseDraftOf = (id) => {
    if (id === 'new') return { title: '', body: '' };
    const n = noteById(id);
    return n ? { title: n.title || '', body: n.body || '' } : { title: '', body: '' };
  };
  const isDirty = (id) => {
    const d = drafts[id];
    if (!d) return false;
    const base = baseDraftOf(id);
    return (d.title || '') !== base.title || (d.body || '') !== base.body;
  };

  const discardDraft = (id) => setDrafts(prev => {
    const next = { ...prev };
    delete next[id];
    return next;
  });

  const openEditor = (id) => {
    setDrafts(prev => (prev[id] ? prev : { ...prev, [id]: baseDraftOf(id) }));
    setSelectedId(String(id));
    setView('editor');
    setError('');
    setConflict(null);
  };

  const goView = (dest) => {
    if (dest === 'reader' && selectedId !== 'new' && noteById(selectedId)) setView('reader');
    else setView('index');
  };

  const askDiscard = (after) => setConfirm({
    title: 'Discard changes?',
    message: 'Your unsaved note text will be lost.',
    confirmLabel: 'Discard',
    action: after,
  });

  const leaveEditor = (dest) => {
    if (isDirty(selectedId)) {
      askDiscard(() => { discardDraft(selectedId); goView(dest); });
      return;
    }
    goView(dest);
  };

  // Explicit close (✕ / scrim): warn on a dirty editor, then hand off to the container.
  const requestClose = () => {
    if (view === 'editor' && isDirty(selectedId)) {
      askDiscard(() => { discardDraft(selectedId); onCloseRequest?.(); });
      return;
    }
    onCloseRequest?.();
  };
  useImperativeHandle(ref, () => ({ requestClose }), [view, selectedId, drafts, notes, overlay, onCloseRequest]);

  const saveDraft = async () => {
    const id = selectedId;
    const draft = drafts[id];
    if (!draft || !(draft.body || '').trim() || !adapter) return;
    setSaving(true);
    setError('');
    try {
      let saved;
      if (id === 'new') {
        saved = await adapter.addNote({ title: draft.title, body: draft.body });
      } else {
        // Revision of the base we edited against; on conflict, the server's note
        const base = (conflict && String(conflict.id) === String(id)) ? conflict : noteById(id);
        saved = await adapter.editNote(id, { title: draft.title, body: draft.body, expected_revision: base?.revision });
      }
      setOverlay(prev => ({ ...prev, [String(saved.id)]: saved }));
      discardDraft(id);
      setConflict(null);
      setSelectedId(String(saved.id));
      setView('reader');
      if (onRefresh) onRefresh();
    } catch (err) {
      if (err && err.status === 409 && err.note) {
        setOverlay(prev => ({ ...prev, [String(err.note.id)]: err.note }));
        setConflict(err.note);
      } else {
        setError((err && err.message) || 'Save failed');
      }
    } finally {
      setSaving(false);
    }
  };

  const loadLatest = () => {
    if (!conflict) return;
    const id = String(conflict.id);
    setDrafts(prev => ({ ...prev, [id]: { title: conflict.title || '', body: conflict.body || '' } }));
    setOverlay(prev => ({ ...prev, [id]: conflict }));
    setConflict(null);
    setError('');
  };

  const keepMine = async () => {
    const id = selectedId;
    const draft = drafts[id] || { title: '', body: '' };
    try {
      await navigator.clipboard.writeText(`${draft.title ? draft.title + '\n\n' : ''}${draft.body}`);
    } catch (err) {
      setError('Copy failed — your text is still here in the editor.');
      return;
    }
    discardDraft(id);
    setConflict(null);
    setError('');
    goView('reader');
  };

  const togglePin = async (note) => {
    if (!adapter) return;
    try {
      const saved = await adapter.editNote(note.id, { pinned: !note.pinned, expected_revision: note.revision });
      setOverlay(prev => ({ ...prev, [String(saved.id)]: saved }));
      if (onRefresh) onRefresh();
    } catch (err) {
      if (err && err.status === 409 && err.note) {
        setOverlay(prev => ({ ...prev, [String(err.note.id)]: err.note }));
        setError('Note was just changed by someone else — showing the latest version.');
      } else {
        setError((err && err.message) || 'Could not update the pin');
      }
    }
  };

  const askDelete = (note) => setConfirm({
    title: 'Delete note',
    message: String(note.title || '').trim()
      ? `Delete the note "${note.title}"? This cannot be undone.`
      : 'Delete this note? This cannot be undone.',
    confirmLabel: '🗑 Delete',
    action: async () => {
      if (!adapter) return;
      try {
        await adapter.deleteNote(note.id);
        setOverlay(prev => ({ ...prev, [String(note.id)]: null }));
        discardDraft(String(note.id));
        if (String(selectedId) === String(note.id)) { setSelectedId(null); setView('index'); }
        if (onRefresh) onRefresh();
      } catch (err) {
        setError((err && err.message) || 'Delete failed');
      }
    },
  });

  // Escape order: confirm → editor (with dirty warning) → reader → container
  escapeRef.current = (e) => {
    e.preventDefault();
    if (confirm) { setConfirm(null); return; }
    if (view === 'editor') { leaveEditor(selectedId === 'new' ? 'index' : 'reader'); return; }
    if (view === 'reader') { setView('index'); return; }
    onEscapeBottom?.();
  };

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') escapeRef.current(e); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active]);

  // Focus: into the search input when the workspace becomes visible
  useEffect(() => {
    if (!active) return undefined;
    const t = window.setTimeout(() => { searchRef.current?.focus(); }, 0);
    return () => { window.clearTimeout(t); };
  }, [active]);

  if (!active) return null;

  const rows = sortNotes(searchNotes(effectiveNotes, query), sort);
  const pinnedRows = rows.filter(n => n.pinned);
  const otherRows = rows.filter(n => !n.pinned);
  const selectedNote = selectedId != null ? noteById(selectedId) : null;
  const draft = selectedId != null ? drafts[selectedId] : null;
  const activeConflict = conflict && selectedId != null && String(conflict.id) === String(selectedId) ? conflict : null;

  return (
    <>
      {error && view !== 'editor' && <div className="error" role="alert">{error}</div>}
      {view === 'index' && (
        <NotesIndex
          totalNotes={effectiveNotes.length}
          pinnedRows={pinnedRows}
          rows={otherRows}
          query={query}
          onQueryChange={setQuery}
          sort={sort}
          onSortToggle={() => setSort(s => (s === 'updated' ? 'title' : 'updated'))}
          onOpen={(id) => { setSelectedId(String(id)); setView('reader'); setError(''); }}
          onNew={() => openEditor('new')}
          searchRef={searchRef}
        />
      )}
      {view === 'reader' && (
        selectedNote ? (
          <NoteReader
            note={selectedNote}
            onBack={() => setView('index')}
            onEdit={() => openEditor(selectedNote.id)}
            onTogglePin={togglePin}
            onDelete={askDelete}
          />
        ) : (
          <div className="empty-state">
            <p>This note is no longer available.</p>
          </div>
        )
      )}
      {view === 'editor' && draft && (
        <NoteEditor
          draft={draft}
          onDraftChange={(patch) => setDrafts(prev => ({
            ...prev,
            [selectedId]: { ...prev[selectedId], ...patch },
          }))}
          saving={saving}
          error={error}
          conflict={activeConflict}
          onLoadLatest={loadLatest}
          onKeepMine={keepMine}
          onSave={saveDraft}
          onCancel={() => leaveEditor(selectedId === 'new' ? 'index' : 'reader')}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          onConfirm={async () => {
            const action = confirm.action;
            setConfirm(null);
            await action();
          }}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  );
}

export default NotesWorkspace;