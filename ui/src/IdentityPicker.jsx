import { useState } from 'react';

/**
 * Shared IdentityPicker — pure React, receives data and callbacks as props.
 *
 * Props:
 *   - members: array of { id, name, color }
 *   - title: string (group name displayed at top)
 *   - onReady: (member) => void — called with { id, name, color }
 *   - onAddMember: (name) => Promise<{ id, name, color }> — called when user joins as new member
 *   - onBack: () => void (optional) — called when user clicks "Back" button
 */
function IdentityPicker({ members, title, onReady, onAddMember, onBack }) {
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const selectMember = (member) => {
    onReady(member);
  };

  const addAndSelect = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setError('');
    setAdding(true);
    try {
      const member = await onAddMember(newName.trim());
      onReady(member);
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 300, alignItems: 'center' }}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: 8 }}>💸</span>
          <h1 className="modal-title" style={{ fontSize: '1.4rem', marginBottom: 2 }}>{title}</h1>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem' }}>Who are you?</p>
        </div>

        {members?.length > 0 && (
          <div className="card" style={{ margin: '0 0 10px' }}>
            <div className="card-title">Select member</div>
            {members.map(m => (
              <div key={m.id} onClick={() => selectMember(m)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 0', cursor: 'pointer', borderRadius: 'var(--radius-xs)',
                  transition: 'background var(--transition)',
                }}
                onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                <span className="member-dot" style={{ background: m.color }} />
                <span style={{ flex: 1, fontWeight: 600 }}>{m.name}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>→</span>
              </div>
            ))}
          </div>
        )}

        <div className="card" style={{ margin: '0 0 14px' }}>
          <div className="card-title">Or join as new</div>
          <form onSubmit={addAndSelect}>
            <div className="form-group">
              <input className="form-input" placeholder="Your name" value={newName}
                onChange={e => setNewName(e.target.value)} maxLength={30}
                autoFocus={members?.length === 0} />
            </div>
            {error && <div className="error" style={{ margin: '0 0 10px' }}>{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={adding || !newName.trim()}>
              {adding ? 'Joining...' : `Join as ${newName.trim() || '...'}`}
            </button>
          </form>
        </div>

        {onBack && (
          <button className="btn btn-ghost" onClick={onBack} style={{ width: '100%', marginTop: 4 }}>
            ← Back to Home
          </button>
        )}
      </div>
    </div>
  );
}

export default IdentityPicker;