import { useState, useEffect } from 'react';
import { api } from '../api';

const AUTH_SERVICE = 'https://auth.johnzhong.win';

function Admin() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [authUser, setAuthUser] = useState(null);

  useEffect(() => {
    // Check auth first
    api.me().then(user => {
      setAuthUser(user);
      loadGroups();
    }).catch(() => {
      // Not authenticated — redirect to shared auth
      window.location.href = `${AUTH_SERVICE}/login?from=${encodeURIComponent(window.location.origin + '/splitdumb/admin')}`;
    });
  }, []);

  const loadGroups = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.adminGroups();
      setGroups(data);
    } catch (err) {
      if (err.message && err.message.includes('401')) {
        window.location.href = `${AUTH_SERVICE}/login?from=${encodeURIComponent(window.location.origin + '/splitdumb/admin')}`;
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteGroup = async (code) => {
    if (!confirm(`Delete group ${code}? This cannot be undone.`)) return;
    try {
      await api.deleteGroup(code);
      setGroups(prev => prev.filter(g => g.code !== code));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${AUTH_SERVICE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch (e) {}
    window.location.href = '/splitdumb/';
  };

  if (loading) return <div className="loading"><div className="spinner"></div><p>Loading...</p></div>;

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px', marginBottom: 16 }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 700 }}>🛡️ Admin Panel</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {authUser && <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{authUser.username}</span>}
          <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={loadGroups}>↻ Refresh</button>
          <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={handleLogout}>Logout</button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {groups.length === 0 ? (
        <div className="empty-state">
          <p>No groups found</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {groups.map(g => (
            <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{g.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                  Code: <code style={{ background: 'var(--surface2)', padding: '1px 6px', borderRadius: 3, fontFamily: 'monospace' }}>{g.code}</code>
                  {' · '}{g.member_count ?? 0} members
                  {' · '}{g.expense_count ?? 0} expenses
                  {' · '}Created {g.created_at ? new Date(g.created_at + 'Z').toLocaleDateString() : 'unknown'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <a href={`/splitdumb/group/${g.code}`} className="btn btn-secondary btn-sm" style={{ width: 'auto', textDecoration: 'none', fontSize: '0.75rem' }}>View</a>
                <button className="btn btn-danger btn-sm" style={{ width: 'auto', fontSize: '0.75rem' }} onClick={() => deleteGroup(g.code)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Admin;