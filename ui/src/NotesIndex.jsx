/**
 * NotesIndex — compact searchable note index (Proposal D1).
 * Pinned section first, then All notes; pinned rows are never duplicated.
 *
 * Props:
 *   - totalNotes: number of notes in the group (drives 'No notes yet' vs 'No matching notes')
 *   - pinnedRows / rows: filtered+sorted note arrays for each section
 *   - query / onQueryChange: live search text
 *   - sort / onSortToggle: 'updated' | 'title'
 *   - onOpen(noteId), onNew(), searchRef: ref for the Search input
 */
import { fmtNoteDate } from './dateFormat';
import { displayTitle } from './noteSearch';

/** First non-empty body line, used for the one-line preview. */
function previewLine(note) {
  return String(note.body || '')
    .split('\n')
    .map(l => l.trim())
    .find(l => l.length > 0) || '';
}

function NoteRow({ note, onOpen }) {
  const preview = previewLine(note);
  // When the body line is already the title fallback, showing it twice is noise.
  const showPreview = Boolean(String(note.title || '').trim()) && preview;
  return (
    <button type="button" className={`ns-row${note.pinned ? ' pinned' : ''}`} onClick={() => onOpen(note.id)}>
      <span className="ns-row-title">
        {displayTitle(note)}{note.pinned && <span className="ns-pin-flag">📌</span>}
      </span>
      {showPreview && <span className="ns-row-preview">{preview}</span>}
      <span className="ns-row-meta">
        {note.author_name || '?'} · {fmtNoteDate(note.updated_at || note.created_at)}
      </span>
    </button>
  );
}

function NotesIndex({ totalNotes, pinnedRows, rows, query, onQueryChange, sort, onSortToggle, onOpen, onNew, searchRef }) {
  const matchCount = pinnedRows.length + rows.length;
  return (
    <div className="ns-index">
      <div className="ns-index-top">
        <input ref={searchRef} className="form-input ns-search" type="search" placeholder="Search notes…"
          aria-label="Search notes" value={query} onChange={e => onQueryChange(e.target.value)} />
        <button type="button" className="btn btn-ghost btn-xs ns-sort-toggle" onClick={onSortToggle}
          title="Toggle sort order">
          {sort === 'updated' ? '⇅ Recently updated' : '⇅ Title A–Z'}
        </button>
        <button type="button" className="btn btn-primary btn-xs" onClick={onNew}>＋ New note</button>
      </div>
      {totalNotes === 0 ? (
        <div className="empty-state" style={{ padding: '30px 0' }}>
          <span className="icon" style={{ color: 'var(--text-muted)' }}>📝</span>
          <p>No notes yet</p>
          <p style={{ fontSize: '0.82rem' }}>Add Airbnb details, schedules, packing lists…</p>
        </div>
      ) : matchCount === 0 ? (
        <div className="empty-state" style={{ padding: '30px 0' }}>
          <span className="icon" style={{ color: 'var(--text-muted)' }}>🔍</span>
          <p>No matching notes</p>
          <button type="button" className="btn btn-ghost btn-xs" style={{ marginTop: 8 }} onClick={() => onQueryChange('')}>
            Clear search
          </button>
        </div>
      ) : (
        <>
          {pinnedRows.length > 0 && (
            <>
              <div className="ns-section-label">Pinned</div>
              {pinnedRows.map(n => <NoteRow key={n.id} note={n} onOpen={onOpen} />)}
            </>
          )}
          {rows.length > 0 && (
            <>
              {pinnedRows.length > 0 && <div className="ns-section-label">All notes</div>}
              {rows.map(n => <NoteRow key={n.id} note={n} onOpen={onOpen} />)}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default NotesIndex;