import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';

export default function Session() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [cashoutModal, setCashoutModal] = useState(null);
  const [cashoutAmount, setCashoutAmount] = useState('');
  const [rebuyModal, setRebuyModal] = useState(null);
  const [rebuyAmount, setRebuyAmount] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Unified edit modal state
  const [editModal, setEditModal] = useState(null); // player object or null
  const [editData, setEditData] = useState({
    name: '', total_buy_in: '', cash_out: '', venmo_link: '', zelle_handle: ''
  });
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    loadSession();
  }, [id]);

  async function loadSession() {
    try {
      const data = await api.getSession(id);
      setSession(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddPlayer(e) {
    e.preventDefault();
    if (!playerName.trim()) return;
    try {
      await api.addPlayer(id, playerName.trim());
      setPlayerName('');
      loadSession();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRebuy(player) {
    const amount = Number(rebuyAmount) || session.buy_in_amount;
    try {
      await api.buyin(id, player.id, amount);
      setRebuyModal(null);
      setRebuyAmount('');
      loadSession();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCashout(player) {
    const amount = Number(cashoutAmount);
    if (isNaN(amount) || amount < 0) {
      setError('Enter a valid amount');
      return;
    }
    try {
      await api.cashout(id, player.id, amount);
      setCashoutModal(null);
      setCashoutAmount('');
      loadSession();
    } catch (err) {
      setError(err.message);
    }
  }

  function openEditModal(player) {
    setEditModal(player);
    setEditData({
      name: player.name || '',
      total_buy_in: String(player.total_buy_in ?? ''),
      cash_out: player.cash_out != null ? String(player.cash_out) : '',
      venmo_link: player.venmo_link || '',
      zelle_handle: player.zelle_handle || '',
    });
  }

  async function handleEditSave(player) {
    setEditSaving(true);
    try {
      const promises = [];

      // Profile fields (name, venmo, zelle)
      const profileData = {};
      if (editData.name.trim() !== player.name) profileData.name = editData.name.trim();
      if (editData.venmo_link !== (player.venmo_link || '')) profileData.venmo_link = editData.venmo_link.trim() || null;
      if (editData.zelle_handle !== (player.zelle_handle || '')) profileData.zelle_handle = editData.zelle_handle.trim() || null;
      if (Object.keys(profileData).length > 0) {
        promises.push(api.editPlayer(id, player.id, profileData));
      }

      // Buy-in
      const newBuyin = Number(editData.total_buy_in);
      if (!isNaN(newBuyin) && newBuyin > 0 && newBuyin !== player.total_buy_in) {
        promises.push(api.editBuyin(id, player.id, newBuyin));
      }

      // Cash-out (only if player already cashed out)
      if (player.cash_out != null) {
        const newCashout = Number(editData.cash_out);
        if (!isNaN(newCashout) && newCashout >= 0 && newCashout !== player.cash_out) {
          promises.push(api.editCashout(id, player.id, newCashout));
        }
      }

      await Promise.all(promises);
      setEditModal(null);
      loadSession();
    } catch (err) {
      setError(err.message);
    } finally {
      setEditSaving(false);
    }
  }

  async function handleRemovePlayer(player) {
    if (!confirm(`Remove ${player.name} from this session?`)) return;
    try {
      await api.removePlayer(id, player.id);
      loadSession();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteSession() {
    const adminToken = localStorage.getItem(`pokerwise_admin_${id}`);
    try {
      await api.deleteSession(id, adminToken);
      navigate('/pokerwise/');
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) {
    return <div className="loading"><div className="spinner" /><p>Loading session…</p></div>;
  }

  if (!session) {
    return (
      <div className="page">
        {error && <div className="error">{error}</div>}
        <Link to="/pokerwise/" className="btn btn-secondary">← Back</Link>
      </div>
    );
  }

  const totalPot = session.players.reduce((sum, p) => sum + (p.total_buy_in || 0), 0);

  return (
    <div className="page">
      {error && <div className="error" onClick={() => setError('')} style={{ cursor: 'pointer' }}>{error}</div>}

      {/* Session header */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.03em' }}>
              {session.location || 'Poker Night'}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginTop: 2 }}>
              {session.date ? new Date(session.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—'}
              {' · '}Buy-in ${session.buy_in_amount}
            </div>
          </div>
          <span className={`badge badge-${session.status}`}>{session.status}</span>
        </div>
        <div style={{
          marginTop: 14,
          padding: '12px 16px',
          background: 'var(--surface2)',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 600 }}>Total Pot</span>
          <span style={{ fontSize: '1.3rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            ${totalPot.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Add player */}
      <div className="card">
        <form onSubmit={handleAddPlayer} style={{ display: 'flex', gap: 8 }}>
          <input
            className="form-input"
            type="text"
            placeholder="Player name…"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn btn-primary" style={{ width: 'auto', padding: '0 20px' }}>Add</button>
        </form>
      </div>

      {/* Player list */}
      {session.players.length === 0 ? (
        <div className="empty-state">
          <span className="icon">👤</span>
          <p>No players yet.</p>
          <p>Add someone to get started!</p>
        </div>
      ) : (
        <div className="card">
          <div className="section-label" style={{ padding: '0 0 10px' }}>Players ({session.players.length})</div>
          {session.players.map(player => {
            const net = player.cash_out != null ? player.cash_out - player.total_buy_in : null;
            return (
              <div
                key={player.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 0',
                  borderBottom: '1px solid var(--border)',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  <span className="member-dot" style={{ background: player.color }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {player.name}
                      {(player.venmo_link || player.zelle_handle) ? (
                        <span style={{ fontSize: '0.7rem' }} title="Has payment info">💳</span>
                      ) : null}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                      Buy-in: ${player.total_buy_in.toFixed(0)}
                      {player.cash_out != null ? (
                        <> · Cash-out: ${player.cash_out.toFixed(0)}
                          {' '}
                          <span className={net >= 0 ? 'balance-positive' : 'balance-negative'}>
                            ({net >= 0 ? '+' : ''}{net.toFixed(0)})
                          </span>
                        </>
                      ) : (
                        <> · <span style={{ color: 'var(--amber)' }}>still playing</span></>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {player.cash_out == null ? (
                    <>
                      <button
                        className="btn btn-secondary btn-xs"
                        onClick={() => { setRebuyModal(player); setRebuyAmount(String(session.buy_in_amount)); }}
                      >
                        + Rebuy
                      </button>
                      <button
                        className="btn btn-primary btn-xs"
                        onClick={() => { setCashoutModal(player); setCashoutAmount(''); }}
                      >
                        Cash Out
                      </button>
                    </>
                  ) : null}
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() => openEditModal(player)}
                    style={{ color: 'var(--text-muted)', padding: '4px 8px' }}
                    title="Edit player"
                  >✎</button>
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() => handleRemovePlayer(player)}
                    style={{ color: 'var(--text-muted)', padding: '4px 8px' }}
                  >✕</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Actions */}
      <div className="card">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Link to={`/pokerwise/session/${id}/summary`} className="btn btn-primary">
            📊 View Summary
          </Link>
          <button className="btn btn-ghost" onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}>
            Delete session
          </button>
          {showDeleteConfirm && (
            <div style={{ marginTop: 8 }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: 8 }}>
                Are you sure? This will permanently delete the session and all data.
              </p>
              <button className="btn btn-danger btn-sm" onClick={handleDeleteSession}>
                Yes, delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Rebuy modal */}
      {rebuyModal && (
        <div className="modal-backdrop" onClick={() => setRebuyModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Rebuy — {rebuyModal.name}</div>
              <button className="modal-close" onClick={() => setRebuyModal(null)}>✕</button>
            </div>
            <div className="form-group">
              <label className="form-label">Rebuy Amount ($)</label>
              <input
                className="form-input"
                type="number"
                min="1"
                step="1"
                value={rebuyAmount}
                onChange={e => setRebuyAmount(e.target.value)}
                autoFocus
              />
            </div>
            <button className="btn btn-primary" onClick={() => handleRebuy(rebuyModal)}>
              Confirm Rebuy
            </button>
          </div>
        </div>
      )}

      {/* Cash-out modal */}
      {cashoutModal && (
        <div className="modal-backdrop" onClick={() => setCashoutModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Cash Out — {cashoutModal.name}</div>
              <button className="modal-close" onClick={() => setCashoutModal(null)}>✕</button>
            </div>
            <div className="form-group">
              <label className="form-label">Cash-out Amount ($)</label>
              <input
                className="form-input"
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 35"
                value={cashoutAmount}
                onChange={e => setCashoutAmount(e.target.value)}
                autoFocus
              />
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                Total buy-in: ${cashoutModal.total_buy_in.toFixed(0)}
              </div>
            </div>
            <button className="btn btn-primary" onClick={() => handleCashout(cashoutModal)}>
              Confirm Cash Out
            </button>
          </div>
        </div>
      )}

      {/* Unified Edit modal */}
      {editModal && (
        <div className="modal-backdrop" onClick={() => setEditModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Edit — {editModal.name}</div>
              <button className="modal-close" onClick={() => setEditModal(null)}>✕</button>
            </div>

            <div className="form-group">
              <label className="form-label">Name</label>
              <input
                className="form-input"
                type="text"
                value={editData.name}
                onChange={e => setEditData(d => ({ ...d, name: e.target.value }))}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">Total Buy-In ($)</label>
              <input
                className="form-input"
                type="number"
                min="1"
                step="1"
                value={editData.total_buy_in}
                onChange={e => setEditData(d => ({ ...d, total_buy_in: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Cash-Out ($)</label>
              <input
                className="form-input"
                type="number"
                min="0"
                step="1"
                placeholder={editModal.cash_out == null ? 'Not cashed out yet' : ''}
                value={editData.cash_out}
                onChange={e => setEditData(d => ({ ...d, cash_out: e.target.value }))}
                disabled={editModal.cash_out == null}
                style={editModal.cash_out == null ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
              />
              {editModal.cash_out == null && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  Cash out first to edit this amount
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Venmo</label>
              <input
                className="form-input"
                type="text"
                placeholder="@handle or venmo.com/yourname"
                value={editData.venmo_link}
                onChange={e => setEditData(d => ({ ...d, venmo_link: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Zelle</label>
              <input
                className="form-input"
                type="text"
                placeholder="email or phone"
                value={editData.zelle_handle}
                onChange={e => setEditData(d => ({ ...d, zelle_handle: e.target.value }))}
              />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-primary"
                onClick={() => handleEditSave(editModal)}
                disabled={editSaving}
              >
                {editSaving ? 'Saving…' : 'Save'}
              </button>
              <button className="btn btn-secondary" onClick={() => setEditModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}