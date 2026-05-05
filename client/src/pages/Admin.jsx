import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, authLogout, clearAuthState, AUTH_SERVICE } from '../api';

function Admin() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [authUser, setAuthUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.me().then(user => {
      setAuthUser(user);
      loadGroups();
    }).catch(() => {
      setAuthUser(null);
      setLoading(false);
    });
  }, []);

  const loadGroups = async () => {
    setLoading(true);
    setError('');
    try {
      setGroups(await api.adminGroups());
    } catch (err) {
      if (err.message?.includes('401') || err.message?.includes('403')) {
        setAuthUser(null);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const deleteGroup = async (code) => {
    if (!confirm(`Delete group ${code}? This cannot be undone.`)) return;
    try {
      await api.deleteGroup(code);
      setGroups(prev => prev.filter(g => g.code !== code));
    } catch (err) { setError(err.message); }
  };

  const handleLogout = async () => {
    try {
      await authLogout();
    } catch {}
    clearAuthState();
    setAuthUser(null);
    setGroups([]);
    navigate('/splitdumb/');
  };

  if (!authUser) {
    const authUrl = `${AUTH_SERVICE}/login?from=${encodeURIComponent(window.location.origin + '/splitdumb/admin')}`;
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: '1rem', marginBottom: 20, color: 'var(--text-dim)' }}>
          Admin access requires authentication.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320, margin: '0 auto' }}>
          <a href={authUrl} className="btn btn-primary">🔐 Log in</a>
          <Link to="/splitdumb/" className="btn btn-secondary">← Back to Home</Link>
        </div>
      </div>
    );
  }

  if (loading) return <div className="loading"><div className="spinner" /><p>Loading...</p></div>;

  return (
    <div className="page">
      <div className="group-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="group-name">Admin Panel</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginTop: 2, wordBreak: 'break-word' }}>
            Logged in as <strong style={{ color: 'var(--text)' }}>{authUser.username}</strong>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          <Link to="/splitdumb/" className="btn btn-ghost btn-sm" style={{ whiteSpace: 'nowrap' }}>🏠 Home</Link>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout} style={{ whiteSpace: 'nowrap' }}>🚪 Logout</button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="card" style={{ padding: 0 }}>
        {groups.length === 0 ? (
          <div className="empty-state"><p>No groups exist yet</p></div>
        ) : (
          groups.map(g => (
            <div key={g.id} style={{
              padding: '14px 20px', borderBottom: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
            }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '0.92rem', wordBreak: 'break-word' }}>{g.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', wordBreak: 'break-word', lineHeight: 1.5 }}>
                  <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary-hover)', fontSize: '0.78rem' }}>{g.code}</code>
                  {' · '}{g.member_count || 0} members{' · '}{g.expense_count || 0} expenses
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <a href={`/splitdumb/group/${g.code}`} className="btn btn-ghost btn-xs" target="_blank" rel="noopener noreferrer">🔗</a>
                <button className="btn btn-xs" style={{ background: 'var(--red-dim)', color: 'var(--red)', width: 'auto' }}
                  onClick={() => deleteGroup(g.code)}>🗑</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default Admin;
