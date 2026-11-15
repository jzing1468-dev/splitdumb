/**
 * GroupInfoSheet — side sheet for the non-financial group utilities
 * (Releases 1–3): Stay · Arrivals · Lists · Notes.
 *
 * Sheet chrome only (scrim + ns-sheet + section nav pills); each section's
 * content lives in its own component (StayView / TravelPlansView / ListsView)
 * and the Notes section embeds NotesWorkspace. The sheet stays mounted while
 * closed (hidden) so the notes workspace keeps view state and unsaved drafts.
 *
 * Info data: the `info` prop (Group.jsx fetchInfo / GET /groups/:code/info) is
 * mirrored into local state; every section mutation reconciles the returned
 * record into that local state (same overlay idea as notes) AND calls
 * onRefreshInfo to refetch. Datetimes are local wall-clock strings, displayed
 * as typed — never converted between timezones.
 *
 * Escape order: sheet confirm → (Notes section: NotesWorkspace's own cascade,
 * landing back on Stay) → section nav back to Stay → close the sheet.
 *
 * Props:
 *   - open, onClose: sheet visibility
 *   - info: { stay, travel_plans, lists, counts } | null; loading/error for it
 *   - notes, members, actor, adapter, onRefresh: passed to NotesWorkspace
 *   - onRefreshInfo: () => void (refetch info after mutations)
 */
import { useState, useEffect, useRef } from 'react';
import ConfirmDialog from './ConfirmDialog';
import NotesWorkspace from './NotesWorkspace';
import StayView from './StayView';
import TravelPlansView from './TravelPlansView';
import ListsView from './ListsView';

const SECTIONS = [
  { key: 'stay', label: 'Stay' },
  { key: 'arrivals', label: 'Arrivals' },
  { key: 'lists', label: 'Lists' },
  { key: 'notes', label: 'Notes' },
];

function GroupInfoSheet({ open, onClose, info, loading, error, notes = [], members = [], actor, adapter, onRefresh, onRefreshInfo }) {
  const [section, setSection] = useState('stay');
  const [localInfo, setLocalInfo] = useState(null);
  const [confirmState, setConfirmState] = useState(null);

  const navRef = useRef(null);
  const openerRef = useRef(null);
  const workspaceRef = useRef(null);

  // Mirror fetched info into local state; sections then patch it with the
  // records returned by their own mutations until the next refetch lands.
  useEffect(() => {
    if (info !== null && info !== undefined) queueMicrotask(() => setLocalInfo(info));
  }, [info]);

  const data = localInfo ?? (info ?? null);
  const infoError = localInfo || info ? '' : (error || '');

  // Styled confirm shared by the section views (destructive actions)
  const askConfirm = (title, message, action, confirmLabel = 'Confirm') =>
    setConfirmState({ title, message, action, confirmLabel });

  // Explicit close (✕ / scrim): Notes owns its dirty check via the ref.
  // Stay/Arrivals/Lists editors do NOT warn on sheet close (documented
  // simplification — they warn on their own Cancel button instead).
  const requestCloseSheet = () => {
    if (section === 'notes') { workspaceRef.current?.requestClose(); return; }
    setConfirmState(null);
    onClose?.();
  };

  // Escape: sheet confirm → notes section (workspace cascade) → back to Stay → close
  const escapeRef = useRef(() => {});
  escapeRef.current = (e) => {
    e.preventDefault();
    if (confirmState) { setConfirmState(null); return; }
    if (section === 'notes') return; // NotesWorkspace handles Escape while active
    if (section !== 'stay') { setSection('stay'); return; }
    setConfirmState(null);
    onClose?.();
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') escapeRef.current(e); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Focus: into the section nav on open, back to the opener on close
  useEffect(() => {
    if (!open) return undefined;
    if (!openerRef.current && document.activeElement instanceof HTMLElement) {
      openerRef.current = document.activeElement;
    }
    const t = window.setTimeout(() => { navRef.current?.focus(); }, 0);
    return () => {
      window.clearTimeout(t);
      openerRef.current?.focus?.();
      openerRef.current = null;
    };
  }, [open]);

  const noDataYet = data == null;
  const showSkeleton = open && noDataYet && loading && !infoError;
  const showLoadError = open && noDataYet && infoError;

  return (
    <>
      {open && <div className="ns-scrim" onClick={requestCloseSheet} />}
      {/* Stays in the DOM (hidden) while closed so the mounted NotesWorkspace
          keeps view state and unsaved drafts across open/close. */}
      <div className="ns-sheet ns-sheet-wide" role="dialog" aria-label="Group info" hidden={!open}>
        <div className="ns-sheet-head">
          <nav className="ns-nav" aria-label="Group info sections">
            {SECTIONS.map(s => (
              <button
                key={s.key}
                ref={s.key === 'stay' ? navRef : undefined}
                type="button"
                className={`ns-nav-pill${section === s.key ? ' active' : ''}`}
                aria-current={section === s.key ? 'true' : undefined}
                onClick={() => setSection(s.key)}
              >
                {s.label}
              </button>
            ))}
          </nav>
          {open && (
            <button type="button" className="modal-close" aria-label="Close group info" onClick={requestCloseSheet}>✕</button>
          )}
        </div>
        <div className="ns-sheet-body">
          {showSkeleton && (
            <div className="ns-skeleton-block" aria-label="Loading group info">
              <div className="skeleton skeleton-line w-60" style={{ height: 20 }} />
              <div className="skeleton skeleton-line w-40" style={{ height: 14 }} />
              <div className="skeleton skeleton-line w-80" style={{ height: 14 }} />
            </div>
          )}
          {showLoadError && (
            <div className="empty-state">
              <span className="icon" style={{ color: 'var(--text-muted)' }}>⚠️</span>
              <p role="alert">{infoError}</p>
              <button type="button" className="btn btn-ghost btn-xs" style={{ marginTop: 8 }} onClick={() => { onRefreshInfo?.(); }}>
                Retry
              </button>
            </div>
          )}
          {!noDataYet && (
            <>
              {/* Keep section editors mounted so navigation never discards drafts. */}
              <div hidden={section !== 'stay'}>
                <StayView info={data} adapter={adapter} onInfoPatch={setLocalInfo} onRefreshInfo={onRefreshInfo} askConfirm={askConfirm} />
              </div>
              <div hidden={section !== 'arrivals'}>
                <TravelPlansView info={data} members={members} adapter={adapter} onInfoPatch={setLocalInfo} onRefreshInfo={onRefreshInfo} askConfirm={askConfirm} />
              </div>
              <div hidden={section !== 'lists'}>
                <ListsView info={data} members={members} adapter={adapter} onInfoPatch={setLocalInfo} onRefreshInfo={onRefreshInfo} askConfirm={askConfirm} />
              </div>
            </>
          )}
          {/* Always mounted: notes view state and drafts survive section switches */}
          <NotesWorkspace
            ref={workspaceRef}
            active={Boolean(open) && section === 'notes'}
            notes={notes}
            members={members}
            actor={actor}
            adapter={adapter}
            onRefresh={onRefresh}
            onEscapeBottom={() => setSection('stay')}
            onCloseRequest={onClose}
          />
          {confirmState && (
            <ConfirmDialog
              title={confirmState.title}
              message={confirmState.message}
              confirmLabel={confirmState.confirmLabel}
              onConfirm={async () => {
                const action = confirmState.action;
                setConfirmState(null);
                await action();
              }}
              onClose={() => setConfirmState(null)}
            />
          )}
        </div>
      </div>
    </>
  );
}

export default GroupInfoSheet;