import { useState } from 'react';

/**
 * Shared ProfileEdit — modal for editing member profile.
 *
 * Props:
 *   - member: { id, name, color, venmo_link, zelle_handle }
 *   - adapter: { editMember: async (id, data) => member }
 *   - onClose: () => void
 *   - onSaved: () => void
 */
function ProfileEdit({ member, adapter, onClose, onSaved }) {
  const [name, setName] = useState(member.name || '');
  const [venmoLink, setVenmoLink] = useState(member.venmo_link || '');
  const [zelleHandle, setZelleHandle] = useState(member.zelle_handle || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name cannot be empty'); return; }
    setSaving(true);
    setError('');
    try {
      await adapter.editMember(member.id, {
        name: name.trim(),
        venmo_link: venmoLink.trim() || null,
        zelle_handle: zelleHandle.trim() || null,
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Helper to extract Venmo username for display
  const venmoUsername = (link) => {
    if (!link) return '';
    if (link.startsWith('@')) return link.slice(1);
    const match = link.match(/venmo\.com\/(.+)/);
    return match ? match[1] : link;
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Edit Profile</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {error && <div className="error" style={{ margin: '0 0 14px' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Display Name</label>
            <input className="form-input" placeholder="Your name"
              value={name} onChange={e => setName(e.target.value)} maxLength={30} autoFocus />
          </div>

          <div className="form-group">
            <label className="form-label">
              Venmo
              <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>(optional)</span>
            </label>
            <input className="form-input" placeholder="venmo.com/username or @username"
              value={venmoLink} onChange={e => setVenmoLink(e.target.value)} />
            {venmoLink && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                Will show as: venmo.com/{venmoUsername(venmoLink)}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">
              Zelle
              <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>(optional)</span>
            </label>
            <input className="form-input" placeholder="phone or email for Zelle"
              value={zelleHandle} onChange={e => setZelleHandle(e.target.value)} />
          </div>

          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ProfileEdit;