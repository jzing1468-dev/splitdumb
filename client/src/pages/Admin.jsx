import { useState, useEffect } from 'react';
import { api } from '../api';

function Admin() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Fetch all groups via admin endpoint
    // We need a new endpoint for this — for now, use the groups stored locally + verify with API
    loadGroups();
  }, []);

  const loadGroups = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.adminGroups();
      setGroups(data);
    } catch (err) {
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

  if (loading) return <div className="loading"><div className="spinner"></div><p>Loading groups...</p></div>;

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px', marginBottom: 16 }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 700 }}>🛡️ Admin Panel</h2>
        <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={loadGroups}>↻ Refresh</button>
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
                  {' · '}{g.member_count || '?'} members
                  {' · '}{g.expense_count || '?'} expenses
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