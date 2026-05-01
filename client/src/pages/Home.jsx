import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

function Home() {
  const [groupName, setGroupName] = useState('');
  const [groupCode, setGroupCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [savedGroups, setSavedGroups] = useState([]);
  const [authUser, setAuthUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const groups = JSON.parse(localStorage.getItem('splitdumb_groups') || '[]');
    setSavedGroups(groups);
    const auth = JSON.parse(localStorage.getItem('splitdumb_auth') || 'null');
    setAuthUser(auth);
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!groupName.trim()) return;
    setError('');
    setLoading(true);
    try {
      const group = await api.createGroup(groupName.trim());
      const saved = JSON.parse(localStorage.getItem('splitdumb_groups') || '[]');
      if (!saved.find(g => g.code === group.code)) {
        saved.push({ code: group.code, name: group.name });
        localStorage.setItem('splitdumb_groups', JSON.stringify(saved));
      }
      navigate(`/group/${group.code}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    const code = groupCode.trim().toUpperCase();
    if (!code) return;
    setError('');
    setLoading(true);
    try {
      await api.getGroup(code);
      const saved = JSON.parse(localStorage.getItem('splitdumb_groups') || '[]');
      if (!saved.find(g => g.code === code)) {
        const group = await api.getGroup(code);
        saved.push({ code: group.code, name: group.name });
        localStorage.setItem('splitdumb_groups', JSON.stringify(saved));
      }
      navigate(`/group/${code}`);
    } catch (err) {
      setError('Group not found — check the code');
    } finally {
      setLoading(false);
    }
  };

  const removeSavedGroup = (code) => {
    const saved = JSON.parse(localStorage.getItem('splitdumb_groups') || '[]');
    const filtered = saved.filter(g => g.code !== code);
    localStorage.setItem('splitdumb_groups', JSON.stringify(filtered));
    setSavedGroups(filtered);
  };

  return (
    <div className="page">
      <div style={{ padding: '48px 20px 24px', textAlign: 'center' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: 8 }}>Split expenses,<br />not friendships.</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.95rem' }}>No sign-up needed. Create a group, share the code, start splitting.</p>
        {authUser && (
          <div style={{ marginTop: 12 }}>
            <a href="/splitdumb/admin" style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.9rem' }}>🛡️ Admin Panel</a>
            <span style={{ marginLeft: 16, fontSize: '0.85rem', color: 'var(--text-dim)' }}>Logged in as {authUser.username}</span>
          </div>
        )}
        {!authUser && (
          <div style={{ marginTop: 12 }}>
            <a href="/splitdumb/login" style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>🔐 Admin Login</a>
          </div>
        )}
      </div>

      <div className="card">
        <form onSubmit={handleCreate}>
          <div className="form-group">
            <label className="form-label">Create a new group</label>
            <input
              className="form-input"
              placeholder="Weekend in Miami"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              maxLength={50}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading || !groupName.trim()}>
            {loading ? 'Creating...' : 'Create Group'}
          </button>
        </form>
      </div>

      <div className="card">
        <form onSubmit={handleJoin}>
          <div className="form-group">
            <label className="form-label">Join an existing group</label>
            <input
              className="form-input"
              placeholder="ABC123"
              value={groupCode}
              onChange={e => setGroupCode(e.target.value.toUpperCase())}
              maxLength={6}
              style={{ letterSpacing: '2px', textTransform: 'uppercase' }}
            />
          </div>
          <button className="btn btn-secondary" type="submit" disabled={loading || !groupCode.trim()}>
            {loading ? 'Joining...' : 'Join Group'}
          </button>
        </form>
      </div>

      {error && <div className="error">{error}</div>}

      {savedGroups.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">Your Groups</div>
          {savedGroups.map(g => (
            <div key={g.code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div
                style={{ cursor: 'pointer', flex: 1 }}
                onClick={() => navigate(`/group/${g.code}`)}
              >
                <div style={{ fontWeight: 600 }}>{g.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{g.code}</div>
              </div>
              <button
                className="delete-btn"
                onClick={(e) => { e.stopPropagation(); removeSavedGroup(g.code); }}
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Home;