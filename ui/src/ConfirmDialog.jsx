/**
 * Shared ConfirmDialog — styled replacement for native confirm().
 *
 * Props:
 *   - title: string
 *   - message: string
 *   - confirmLabel: string (default 'Confirm') — label for the destructive button
 *   - destructive: bool (default true) — red confirm button
 *   - onConfirm: () => void | Promise
 *   - onClose: () => void
 */
function ConfirmDialog({ title, message, confirmLabel = 'Confirm', destructive = true, onConfirm, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: 18 }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className={`btn ${destructive ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
