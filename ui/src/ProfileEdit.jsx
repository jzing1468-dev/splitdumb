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

  // Normalize any Venmo input to venmo.com/<path>
  const normalizeVenmo = (input) => {
    if (!input) return '';
    let v = input.trim();
    // Strip protocol
    v = v.replace(/^https?:\/\/(www\.)?/i, '');
    // Strip @ prefix
    if (v.startsWith('@')) v = v.slice(1);
    // If it already starts with venmo.com/, keep as-is (covers username AND code links)
    if (v.match(/^venmo\.com\//i)) return v;
    // Otherwise treat the whole thing as a username
    return `venmo.com/${v}`;
  };

  const venmoUsername = (link) => {
    const normalized = normalizeVenmo(link);
    const match = normalized.match(/venmo\.com\/(.+)/);
    return match ? match[1] : '';
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
                Saved as: {normalizeVenmo(venmoLink).startsWith('venmo.com/code?') ? 'Venmo code link' : normalizeVenmo(venmoLink)} · Opens Venmo app on tap
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