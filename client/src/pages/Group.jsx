import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import AddExpense from './AddExpense';
import AddSettlement from './AddSettlement';

function Group() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('expenses');
  const [newMember, setNewMember] = useState('');
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showAddSettlement, setShowAddSettlement] = useState(false);
  const [copied, setCopied] = useState(false);

  // Admin state
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminToken, setAdminToken] = useState('');

  const fetchGroup = useCallback(async () => {
    try {
      const data = await api.getGroup(code);
      setGroup(data);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => { fetchGroup(); }, [fetchGroup]);

  // Check admin status
  useEffect(() => {
    const auth = JSON.parse(localStorage.getItem('splitdumb_auth') || 'null');
    if (auth?.role === 'admin') setIsAdmin(true);
    // Check URL for admin_token (from share link)
    const params = new URLSearchParams(window.location.search);
    const token = params.get('admin');
    if (token) setAdminToken(token);
  }, []);

  const hasAdmin = isAdmin || adminToken;
  const adminHeaders = adminToken ? { 'X-Admin-Token': adminToken } : {};

  // Save group to localStorage
  useEffect(() => {
    if (group) {
      const saved = JSON.parse(localStorage.getItem('splitdumb_groups') || '[]');
      if (!saved.find(g => g.code === group.code)) {
        saved.push({ code: group.code, name: group.name });
        localStorage.setItem('splitdumb_groups', JSON.stringify(saved));
      }
    }
  }, [group]);

  const addMember = async () => {
    if (!newMember.trim()) return;
    try {
      await api.addMember(code, newMember.trim());
      setNewMember('');
      setShowAddMember(false);
      fetchGroup();
    } catch (err) {
      setError(err.message);
    }
  };

  const removeMember = async (id, name) => {
    if (!hasAdmin) return;
    if (!confirm(`Remove ${name}? This will delete their expenses and splits.`)) return;
    try {
      await api.removeMember(code, id, adminToken || undefined, true);
      fetchGroup();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteExpense = async (id) => {
    if (!hasAdmin) return;
    if (!confirm('Delete this expense?')) return;
    try {
      await api.deleteExpense(code, id, adminToken || undefined);
      fetchGroup();
    } catch (err) {
      setError(err.message);
    }
  };

  const confirmSettlement = async (id) => {
    try {
      await api.confirmSettlement(code, id, 'confirmed');
      fetchGroup();
    } catch (err) {
      setError(err.message);
    }
  };

  const disputeSettlement = async (id) => {
    try {
      await api.confirmSettlement(code, id, 'disputed');
      fetchGroup();
    } catch (err) {
      setError(err.message);
    }
  };

  const shareUrl = `${window.location.origin}/splitdumb/group/${code}`;
  const copyCode = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <div className="loading"><div className="spinner"></div><p>Loading group...</p></div>;
  if (!group) return <div className="error">{error || 'Group not found'}</div>;

  const totalSpent = group.expenses?.reduce((sum, e) => sum + e.amount, 0) || 0;
  const allSettled = group.simplifiedDebts?.length === 0;
  const pendingSettlements = group.settlements?.filter(s => s.status === 'pending') || [];

  return (
    <div className="page">
      <div className="group-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="group-name">{group.name}</div>
            <div className="group-code">
              Code: <code>{group.code}</code>
              <button className="copy-btn" onClick={copyCode}>
                {copied ? '✓ Copied!' : '🔗 Share'}
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isAdmin && <span style={{ fontSize: '0.7rem', padding: '2px 8px', background: 'var(--primary)', color: 'white', borderRadius: 4 }}>ADMIN</span>}
            {hasAdmin && (
              <button className="btn btn-danger btn-sm" style={{ width: 'auto', fontSize: '0.75rem' }} onClick={async () => {
                if (!confirm('Delete this entire group? This cannot be undone.')) return;
                try {
                  await api.deleteGroup(code, adminToken || undefined);
                  navigate('/splitdumb/');
                } catch (err) { setError(err.message); }
              }}>Delete Group</button>
            )}
          </div>
        </div>
      </div>

      {/* Members */}
      <div className="card">
        <div className="card-title">Members ({group.members?.length || 0})</div>
        <div className="member-chips">
          {group.members?.map(m => (
            <span key={m.id} className="member-chip" style={{ background: m.color + '22', borderColor: m.color }}>
              <span className="member-dot" style={{ background: m.color }}></span>
              {m.name}
              {hasAdmin && <button className="delete-btn" onClick={() => removeMember(m.id, m.name)} style={{ padding: 0, fontSize: '0.7rem' }}>✕</button>}
            </span>
          ))}
        </div>
        {showAddMember ? (
          <div className="add-member-row">
            <input
              className="form-input"
              placeholder="Name"
              value={newMember}
              onChange={e => setNewMember(e.target.value)}
              maxLength={30}
              onKeyDown={e => e.key === 'Enter' && addMember()}
              autoFocus
            />
            <button className="btn btn-primary btn-sm" onClick={addMember}>Add</button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowAddMember(false); setNewMember(''); }}>Cancel</button>
          </div>
        ) : (
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAddMember(true)} style={{ width: 'auto' }}>
            + Add Member
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="card">
        <div className="card-title">Summary</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Total Spent</span>
          <span style={{ fontWeight: 700, fontSize: '1.3rem' }}>${totalSpent.toFixed(2)}</span>
        </div>
        <div style={{ marginTop: 12 }}>
          {group.members?.map(m => {
            const bal = group.balances?.[m.id]?.balance || 0;
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '0.9rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="member-dot" style={{ background: m.color }}></span>
                  {m.name}
                </span>
                <span className={bal > 0.01 ? 'balance-positive' : bal < -0.01 ? 'balance-negative' : 'balance-zero'}>
                  {bal > 0.01 ? '+' : ''}{bal.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${tab === 'expenses' ? 'active' : ''}`} onClick={() => setTab('expenses')}>
          Expenses ({group.expenses?.length || 0})
        </button>
        <button className={`tab ${tab === 'debts' ? 'active' : ''}`} onClick={() => setTab('debts')}>
          Settle Up
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {/* Expenses tab */}
      {tab === 'expenses' && (
        <>
          {group.expenses?.length === 0 ? (
            <div className="empty-state">
              <p>💸 No expenses yet</p>
              <p>Tap + to add one</p>
            </div>
          ) : (
            <div className="card" style={{ padding: '8px 16px' }}>
              {group.expenses.map(e => (
                <div key={e.id} className="expense-item">
                  <div className="expense-left">
                    <div className="expense-desc">{e.description}</div>
                    <div className="expense-meta">
                      {e.payer_name} paid · {e.split_type} · {e.date}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="expense-amount">${e.amount.toFixed(2)}</div>
                    {hasAdmin && <button className="delete-btn" onClick={() => deleteExpense(e.id)}>🗑</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Debts / Settle Up tab */}
      {tab === 'debts' && (
        <>
          {allSettled && pendingSettlements.length === 0 ? (
            <div className="all-settled">
              <h3>🎉 All settled!</h3>
              <p>Everyone is even</p>
            </div>
          ) : (
            <>
              {group.simplifiedDebts?.length > 0 && (
                <div className="card">
                  <div className="card-title">Who owes whom</div>
                  {group.simplifiedDebts.map((d, i) => (
                    <div key={i} className="debt-row">
                      <div className="debt-who">
                        <strong>{d.from.name}</strong> owes <strong>{d.to.name}</strong>
                      </div>
                      <div className="debt-amount balance-negative">${d.amount.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              )}

              {pendingSettlements.length > 0 && (
                <div className="card">
                  <div className="card-title">Pending Settlements</div>
                  {pendingSettlements.map(s => (
                    <div key={s.id} className="settlement-item">
                      <div>
                        <div><strong>{s.from_name}</strong> paid <strong>{s.to_name}</strong></div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>${s.amount.toFixed(2)}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-primary btn-sm" style={{ width: 'auto', fontSize: '0.75rem' }} onClick={() => confirmSettlement(s.id)}>✓ Confirm</button>
                        <button className="btn btn-secondary btn-sm" style={{ width: 'auto', fontSize: '0.75rem' }} onClick={() => disputeSettlement(s.id)}>✗</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {group.settlements?.filter(s => s.status === 'confirmed').length > 0 && (
                <div className="card">
                  <div className="card-title">Confirmed Settlements</div>
                  {group.settlements.filter(s => s.status === 'confirmed').map(s => (
                    <div key={s.id} className="settlement-item">
                      <div>
                        <div><strong>{s.from_name}</strong> paid <strong>{s.to_name}</strong></div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>${s.amount.toFixed(2)}</div>
                      </div>
                      <span className="settlement-status confirmed">✓ confirmed</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {!allSettled && group.simplifiedDebts?.length > 0 && (
            <div style={{ padding: '0 16px' }}>
              <button className="btn btn-primary" onClick={() => setShowAddSettlement(true)}>
                Record a Settlement
              </button>
            </div>
          )}
        </>
      )}

      {/* FAB */}
      <button className="fab" onClick={() => setShowAddExpense(true)}>+</button>

      {/* Modals */}
      {showAddExpense && (
        <AddExpense
          group={group}
          code={code}
          onClose={() => setShowAddExpense(false)}
          onSaved={() => { setShowAddExpense(false); fetchGroup(); }}
        />
      )}

      {showAddSettlement && (
        <AddSettlement
          group={group}
          code={code}
          onClose={() => setShowAddSettlement(false)}
          onSaved={() => { setShowAddSettlement(false); fetchGroup(); }}
        />
      )}
    </div>
  );
}

export default Group;