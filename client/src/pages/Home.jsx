import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, removeRecentGroup, AUTH_SERVICE } from '../api';

function Home() {
  const [groupName, setGroupName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('splitdumb_groups') || '[]').slice(0, 6);
    if (saved.length === 0) { setRecent([]); return; }
    // Validate each recent group still exists on the server
    Promise.all(saved.map(g =>
      api.getGroup(g.code)
        .then(data => ({ code: g.code, name: data.name, valid: true }))
        .catch(() => {
          removeRecentGroup(g.code);
          return { code: g.code, valid: false };
        })
    )).then(results => {
      setRecent(results.filter(r => r.valid));
    });
  }, []);

  useEffect(() => {
    api.me().then(user => {
      setIsAdmin(user?.role === 'admin');
    }).catch(() => {
      setIsAdmin(false);
    }).finally(() => setAuthChecked(true));
  }, []);

  const createGroup = async (e) => {
    e.preventDefault();
    if (!groupName.trim()) return;
    setCreating(true);
    setError('');
    try {
      const group = await api.createGroup(groupName.trim());
      navigate(`/splitdumb/group/${group.code}`);
    } catch (err) { setError(err.message); }
    finally { setCreating(false); }
  };

  const joinGroup = (e) => {
    e.preventDefault();
    const clean = joinCode.trim().toUpperCase();
    if (!clean || clean.length < 4) return;
    navigate(`/splitdumb/group/${clean}`);
  };

  return (
    <div style={{ padding: 0 }}>
      <div className="hero">
        <span className="hero-icon">💸</span>
        <h1 className="hero-title">SplitDumb</h1>
        <p className="hero-sub">Split expenses, not friendships</p>
      </div>

      {isAdmin && (
        <div className="card">
          <div className="card-title">Create a group</div>
          <form onSubmit={createGroup}>
            <div className="form-group">
              <input className="form-input" placeholder="e.g. Miami trip, dinner club"
                value={groupName} onChange={e => setGroupName(e.target.value)} maxLength={50} autoFocus />
            </div>
            {error && <div className="error" style={{ margin: '0 0 12px' }}>{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={creating || !groupName.trim()}>
              {creating ? 'Creating...' : 'Create group'}
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <div className="card-title">Join a group</div>
        <form onSubmit={joinGroup}>
          <div className="form-group">
            <input className="form-input" placeholder="Enter 6-letter code"
              value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} maxLength={6}
              style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase' }} />
          </div>
          <button className="btn btn-secondary" type="submit" disabled={!joinCode.trim()}>
            Join group
          </button>
        </form>
      </div>

      {recent.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: 8 }}>Recent groups</div>
          <div className="recent-groups">
            {recent.map(g => (
              <Link key={g.code} to={`/splitdumb/group/${g.code}`} className="recent-group-chip">
                {g.name} <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>{g.code}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {!isAdmin && authChecked && (
        <div style={{ textAlign: 'center', padding: '28px 24px' }}>
          <a href={`${AUTH_SERVICE}/login?from=${encodeURIComponent(window.location.origin + '/splitdumb/')}`}
            style={{ color: 'var(--text-dim)', fontSize: '0.78rem', textDecoration: 'none' }}>
            🔐 Admin login
          </a>
        </div>
      )}
    </div>
  );
}

export default Home;