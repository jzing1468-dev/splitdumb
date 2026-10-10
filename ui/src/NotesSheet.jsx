import { useState } from 'react';
import ConfirmDialog from './ConfirmDialog';

/**
 * NotesSheet — side-sheet notes board for a group (trip details, schedule, etc).
 *
 * Props:
 *   - open: bool
 *   - onClose: () => void
 *   - notes: array of { id, title, body, pinned, author_member_id, author_name, created_at, updated_at }
 *   - members: array (for author colors)
 *   - actor: { id, name, color } or null
 *   - adapter: { addNote, editNote, deleteNote }
 *   - onRefresh: () => void (called after mutations)
 */
function NotesSheet({ open, onClose, notes = [], members = [], actor, adapter, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formPinned, setFormPinned] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const initialsOf = (name) =>
    (name || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';

  const fmtTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts + (ts.includes('T') ? '' : 'T12:00:00'));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (!open) return null;

  const pinnedNotes = notes.filter(n => n.pinned);
  const otherNotes = notes.filter(n => !n.pinned);

  const submitNote = async () => {
    if (!formBody.trim()) return;
    setSaving(true);
    setError('');
    try {
      await adapter.addNote({ title: formTitle, body: formBody, pinned: formPinned });
      setFormTitle(''); setFormBody(''); setFormPinned(false);
      setShowForm(false);
      if (onRefresh) onRefresh();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const saveEdit = async (id) => {
    if (!editBody.trim()) return;
    setSaving(true);
    setError('');
    try {
      await adapter.editNote(id, { title: editTitle, body: editBody });
      setEditingId(null);
      if (onRefresh) onRefresh();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const togglePin = async (note) => {
    try {
      await adapter.editNote(note.id, { pinned: !note.pinned });
      if (onRefresh) onRefresh();
    } catch (err) { setError(err.message); }
  };

  const noteCard = (n) => {
    const isEditing = editingId === n.id;
    const member = members.find(m => m.id === (n.author_member_id || n.authorMemberId));
    return (
      <div key={n.id} className={`ns-note ${n.pinned ? 'pinned' : ''}`}>
        {isEditing ? (
          <div className="ns-edit-form">
            <input className="form-input" placeholder="Title (optional)" value={editTitle}
              onChange={e => setEditTitle(e.target.value)} maxLength={100} />
            <textarea className="form-input" placeholder="Note..." value={editBody}
              onChange={e => setEditBody(e.target.value)} rows={4} maxLength={4000} autoFocus />
            <div className="ns-edit-actions">
              <button className="btn btn-ghost btn-xs" onClick={() => setEditingId(null)}>Cancel</button>
              <button className="btn btn-primary btn-xs" disabled={saving} onClick={() => saveEdit(n.id)}>Save</button>
            </div>
          </div>
        ) : (
          <>
            <div className="ns-note-head">
              <span className="ns-avatar" style={{ background: member?.color || '#999' }}>{initialsOf(n.author_name)}</span>
              <span className="ns-note-title">{n.title || ''}</span>
              {n.pinned && <span className="ns-pin-flag">📌</span>}
            </div>
            <div className="ns-note-body">{n.body}</div>
            <div className="ns-note-meta">
              {n.author_name || '?'}{n.updated_at ? ' · edited' : ''} · {fmtTime(n.created_at)}
            </div>
            <div className="ns-note-actions">
              <button className="btn btn-ghost btn-xs" onClick={() => togglePin(n)}>
                {n.pinned ? 'Unpin' : '📌 Pin'}
              </button>
              <button className="btn btn-ghost btn-xs" onClick={() => { setEditingId(n.id); setEditTitle(n.title || ''); setEditBody(n.body); }}>
                ✏️ Edit
              </button>
              <button className="btn btn-danger-outline btn-xs" onClick={() => setConfirmDelete(n)}>
                🗑 Delete
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="ns-scrim" onClick={onClose} />
      <div className="ns-sheet" role="dialog" aria-label="Trip notes">
        <div className="ns-sheet-head">
          <span className="ns-sheet-title">Trip Notes</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="ns-sheet-body">
          {showForm ? (
            <div className="ns-add-form">
              <input className="form-input" placeholder="Title (optional) — e.g. Airbnb, Schedule"
                value={formTitle} onChange={e => setFormTitle(e.target.value)} maxLength={100} />
              <textarea className="form-input" placeholder="Note — address, confirmation code, plan..."
                value={formBody} onChange={e => setFormBody(e.target.value)} rows={4} maxLength={4000} autoFocus />
              <label className="ns-pin-toggle">
                <input type="checkbox" checked={formPinned} onChange={e => setFormPinned(e.target.checked)} />
                📌 Pin to top of group page
              </label>
              <div className="ns-edit-actions">
                <button className="btn btn-ghost btn-xs" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="btn btn-primary btn-xs" disabled={saving || !formBody.trim()} onClick={submitNote}>Save note</button>
              </div>
            </div>
          ) : (
            <button className="ns-add-btn" onClick={() => setShowForm(true)}>＋ Add note</button>
          )}
          {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
          {notes.length === 0 && !showForm && (
            <div className="empty-state" style={{ padding: '30px 0' }}>
              <span className="icon" style={{ color: 'var(--text-muted)' }}>📝</span>
              <p>No notes yet</p>
              <p style={{ fontSize: '0.82rem' }}>Add Airbnb details, schedules, packing lists…</p>
            </div>
          )}
          {pinnedNotes.length > 0 && (
            <>
              {pinnedNotes.length > 0 && otherNotes.length > 0 && <div className="ns-section-label">Pinned</div>}
              {pinnedNotes.map(noteCard)}
            </>
          )}
          {otherNotes.length > 0 && (
            <>
              {pinnedNotes.length > 0 && <div className="ns-section-label">Notes</div>}
              {otherNotes.map(noteCard)}
            </>
          )}
        </div>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title="Delete note"
          message={confirmDelete.title
            ? `Delete the note "${confirmDelete.title}"? This cannot be undone.`
            : 'Delete this note? This cannot be undone.'}
          confirmLabel="🗑 Delete"
          onConfirm={async () => {
            const id = confirmDelete.id;
            setConfirmDelete(null);
            try {
              await adapter.deleteNote(id);
              if (onRefresh) onRefresh();
            } catch (err) { setError(err.message); }
          }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}

export default NotesSheet;
