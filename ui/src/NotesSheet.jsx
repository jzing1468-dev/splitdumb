/**
 * NotesSheet — thin sheet chrome around NotesWorkspace (Proposal D).
 * Kept for compatibility with existing importers: scrim + ns-sheet dialog +
 * header title. All view/draft/conflict state lives in NotesWorkspace, which
 * stays mounted (hidden) while the sheet is closed so unsaved drafts survive.
 *
 * Props:
 *   - open: bool (chrome hidden while closed; workspace state persists)
 *   - onClose: () => void
 *   - notes, members, actor, adapter, onRefresh: passed through to NotesWorkspace
 */
import { useRef, useEffect } from 'react';
import NotesWorkspace from './NotesWorkspace';

function NotesSheet({ open, onClose, notes = [], members = [], actor, adapter, onRefresh }) {
  const workspaceRef = useRef(null);
  const openerRef = useRef(null);

  // Focus: back to the opener element when the sheet closes
  useEffect(() => {
    if (!open) return undefined;
    if (!openerRef.current && document.activeElement instanceof HTMLElement) {
      openerRef.current = document.activeElement;
    }
    return () => {
      openerRef.current?.focus?.();
      openerRef.current = null;
    };
  }, [open]);

  const requestClose = () => workspaceRef.current?.requestClose();

  return (
    <>
      {open && <div className="ns-scrim" onClick={requestClose} />}
      {/* Sheet stays in the DOM (hidden) while closed so the mounted
          NotesWorkspace keeps its view state and unsaved drafts. */}
      <div className="ns-sheet" role="dialog" aria-label="Trip notes" hidden={!open}>
        <div className="ns-sheet-head">
          <span className="ns-sheet-title">Trip Notes</span>
          {open && (
            <button type="button" className="modal-close" aria-label="Close notes" onClick={requestClose}>✕</button>
          )}
        </div>
        <div className="ns-sheet-body">
          <NotesWorkspace
            ref={workspaceRef}
            active={open}
            notes={notes}
            members={members}
            actor={actor}
            adapter={adapter}
            onRefresh={onRefresh}
            onEscapeBottom={onClose}
            onCloseRequest={onClose}
          />
        </div>
      </div>
    </>
  );
}

export default NotesSheet;