import { useState, useMemo } from 'react';
import { CATEGORY_MAP } from '@splitdumb/core/categories';
import AddExpense from './AddExpense';
import AddSettlement from './AddSettlement';
import IdentityPicker from './IdentityPicker';
import ProfileEdit from './ProfileEdit';
import ConfirmDialog from './ConfirmDialog';
import NotesSheet from './NotesSheet';

/**
 * Shared GroupPage — pure React, receives data and callbacks as props.
 *
 * Props:
 *   - group: { name, code }
 *   - members: array of { id, name, color, ... }
 *   - expenses: array of expense objects
 *   - settlements: array of settlement objects
 *   - balances: object { [id]: { balance } }
 *   - transactions: array of { from: { id, name }, to: { id, name }, amount }
 *   - actor: { id, name, color } or null
 *   - adapter: { addMember, addExpense, editExpense, deleteExpense, addSettlement, confirmSettlement?, disputeSettlement?, removeMember?, deleteGroup? }
 *   - features: { admin: bool, searchFilter: bool, auditLog: bool, multiPayer: bool, attachments: bool }
 *   - onLeave: () => void (optional)
 *   - onSwitchIdentity: () => void (optional)
 *   - extraHeader: React node (optional, for connection status etc.)
 *   - AttachmentManager: React component (optional, server app only)
 *   - isAdmin: bool (optional)
 *   - auditEntries: array (optional, for audit log tab)
 *   - onRefresh: () => void (optional, called after mutations to refetch data)
 */
function GroupPage({
  group,
  members,
  expenses,
  settlements,
  notes,
  balances,
  transactions,
  actor,
  adapter,
  features = {},
  onLeave,
  onSwitchIdentity,
  extraHeader,
  AttachmentManager,
  attachmentProps,
  isAdmin,
  auditEntries,
  onRefresh,
  loading = false,
}) {
  const [tab, setTab] = useState('expenses');
  const [newMember, setNewMember] = useState('');
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [showAddSettlement, setShowAddSettlement] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState(null);
  const [activeFilters, setActiveFilters] = useState({ mine: false, recent30: false });
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [showActorPicker, setShowActorPicker] = useState(false);
  const [expandedExpenseId, setExpandedExpenseId] = useState(null);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [copiedPay, setCopiedPay] = useState(null);
  const [showConfirmed, setShowConfirmed] = useState(false);
  // Styled replacement for native confirm(): { title, message, confirmLabel, action }
  const [confirmDialog, setConfirmDialog] = useState(null);
  const askConfirm = (title, message, action, confirmLabel = 'Confirm') =>
    setConfirmDialog({ title, message, action, confirmLabel });

  // Hooks must be called unconditionally (before any early return)
  const filteredExpenses = useMemo(() => {
    let exps = expenses || [];
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      exps = exps.filter(e =>
        e.description.toLowerCase().includes(q) ||
        (e.payer_name || e.payerName)?.toLowerCase().includes(q) ||
        e.notes?.toLowerCase().includes(q)
      );
    }
    if (filterCategory) {
      exps = exps.filter(e => e.category === filterCategory);
    }
    if (activeFilters.mine && actor) {
      exps = exps.filter(e => (e.payer_id || e.payerId) === actor.id || e.splits?.some(s => (s.member_id || s.memberId) === actor.id));
    }
    if (activeFilters.recent30) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      exps = exps.filter(e => new Date(e.date + 'T12:00:00') >= cutoff);
    }
    return exps;
  }, [expenses, searchQuery, filterCategory, activeFilters, actor]);

  // ── Skeleton components ──

  const SkeletonHeader = () => (
    <div className="skeleton-header">
      <div className="skeleton skeleton-line w-60" style={{ height: 24, marginBottom: 10 }} />
      <div className="skeleton skeleton-line w-30" style={{ height: 14 }} />
    </div>
  );

  const SkeletonMembers = () => (
    <div className="skeleton-members">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="skeleton" style={{ width: 70 + (i % 2) * 20 }} />
      ))}
    </div>
  );

  const SkeletonBalanceBar = () => (
    <div className="skeleton-balance-bar">
      <div className="skeleton skeleton-balance-total" />
      {[0, 1, 2].map(i => (
        <div key={i} className="skeleton skeleton-balance-chip" style={{ width: 80 + i * 15 }} />
      ))}
    </div>
  );

  const SkeletonExpenseList = () => (
    <div className="skeleton-card">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="skeleton-expense-row">
          <div className="skeleton-expense-left">
            <div className="skeleton skeleton-line w-60" />
            <div className="skeleton skeleton-line w-40" style={{ height: 10 }} />
          </div>
          <div className="skeleton-expense-right">
            <div className="skeleton skeleton-line w-30" style={{ width: 50 }} />
          </div>
        </div>
      ))}
    </div>
  );

  const SkeletonGroupPage = () => (
    <div className="page">
      <SkeletonHeader />
      <SkeletonMembers />
      <SkeletonBalanceBar />
      <div className="group-content">
        <div className="tabs">
          <div className="skeleton" style={{ flex: 1, height: 44, margin: '0 4px' }} />
          <div className="skeleton" style={{ flex: 1, height: 44, margin: '0 4px' }} />
        </div>
        <SkeletonExpenseList />
      </div>
    </div>
  );

  // If no actor, show identity picker
  if (!actor) {
    return (
      <IdentityPicker
        members={members}
        title={group?.name || 'Group'}
        onReady={(member) => {
          if (adapter.selectMember) adapter.selectMember(member);
          setShowActorPicker(false);
          if (onRefresh) onRefresh();
        }}
        onAddMember={adapter.addMember}
        onBack={onLeave}
      />
    );
  }

  // Loading state: show skeletons
  if (loading) {
    return <SkeletonGroupPage />;
  }

  const shareUrl = `${window.location.origin}${window.location.pathname}?group=${encodeURIComponent(group.code)}`;
  const copyCode = () => { navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const addMember = async () => {
    if (!newMember.trim()) return;
    try {
      await adapter.addMember(newMember.trim());
      setNewMember('');
      setShowAddMember(false);
      if (onRefresh) onRefresh();
    } catch (err) { setError(err.message); }
  };

  const removeMember = async (id, name) => {
    if (!isAdmin) return;
    askConfirm('Remove member', `Remove ${name}? This will delete their expenses and splits.`, async () => {
      try {
        await adapter.removeMember(id, name);
        if (onRefresh) onRefresh();
      } catch (err) { setError(err.message); }
    }, '🗑 Remove');
  };

  const deleteExpense = async (id) => {
    askConfirm('Delete expense', 'Delete this expense? This cannot be undone.', async () => {
      try {
        await adapter.deleteExpense(id);
        if (onRefresh) onRefresh();
      } catch (err) { setError(err.message); }
    }, '🗑 Delete');
  };

  const confirmSettlement = async (id) => {
    try {
      await adapter.confirmSettlement(id);
      if (onRefresh) onRefresh();
    } catch (err) { setError(err.message); }
  };

  const disputeSettlement = async (id) => {
    try {
      await adapter.disputeSettlement(id);
      if (onRefresh) onRefresh();
    } catch (err) { setError(err.message); }
  };

  const cancelSettlement = async (id) => {
    askConfirm('Cancel settlement', 'Cancel this settlement record? It will be removed.', async () => {
      try {
        await adapter.cancelSettlement(id);
        if (onRefresh) onRefresh();
      } catch (err) { setError(err.message); }
    }, '🗑 Cancel');
  };

  // Pending (unconfirmed) payments keyed by "fromId|toId" — shown inline on debt rows
  const pendingByPair = {};
  (settlements || []).filter(s => s.status === 'pending').forEach(s => {
    const key = `${s.from_id || s.fromId}|${s.to_id || s.toId}`;
    pendingByPair[key] = (pendingByPair[key] || 0) + s.amount;
  });

  const totalSpent = expenses?.reduce((sum, e) => sum + e.amount, 0) || 0;
  const allSettled = (transactions || []).length === 0;
  const pendingSettlements = settlements?.filter(s => s.status === 'pending') || [];

  // ── Hero metrics (004 redesign) ──
  const actorBal = balances?.[actor.id]?.balance || 0;
  const outstandingTotal = Object.values(balances || {})
    .reduce((s, b) => s + (b.balance < 0 ? -b.balance : 0), 0);
  const confirmedPaid = (settlements || [])
    .filter(s => s.status === 'confirmed')
    .reduce((s, x) => s + x.amount, 0);
  // Share of all money that ever needed to move that has moved
  const progressPct = (confirmedPaid + outstandingTotal) > 0
    ? confirmedPaid / (confirmedPaid + outstandingTotal)
    : 1;
  const initialsOf = (name) =>
    (name || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  const fmtSigned = (v) => (v < -0.005 ? '−' : v > 0.005 ? '+' : '') + Math.abs(v).toFixed(2);

  const getExpensePayerName = (e) => {
    if (e.payer_name) return e.payer_name;
    const payer = members?.find(m => m.id === (e.payer_id || e.payerId));
    return payer?.name || 'Unknown';
  };

  const getExpensePayerIsMulti = (e) => {
    return e.payer_is_multi || (e.payers_data && JSON.parse(e.payers_data).length > 1) || false;
  };

  const getExpenseSplitType = (e) => e.split_type || e.splitType || 'equal';
  const getExpenseDateRange = (e) => e.date_range_start || e.dateRangeStart;
  const getExpenseDateRangeEnd = (e) => e.date_range_end || e.dateRangeEnd;

  const Header = () => (
    <div className="group-header">
      <div className="group-header-row">
        <div className="group-header-left">
          <h1 className="group-name">{group?.name}</h1>
          <div className="group-header-sub">
            <code>{group?.code}</code>
            <button className="copy-btn" onClick={copyCode}>{copied ? '✓' : '🔗'}</button>
          </div>
        </div>
        <div className="group-header-actions">
          {features.admin && isAdmin && (
            <button className="btn btn-sm btn-danger-outline" onClick={() => {
              askConfirm('Delete group', `Delete the entire group "${group?.name}"? All expenses, splits and settlements will be removed. This cannot be undone.`, async () => {
                try { await adapter.deleteGroup(); if (onLeave) onLeave(); }
                catch (err) { setError(err.message); }
              }, '🗑 Delete group');
            }} title="Delete group">🗑 Delete</button>
          )}
          {onLeave && (
            <button className="btn btn-sm btn-ghost" onClick={onLeave}>← Home</button>
          )}
        </div>
      </div>
      {Array.isArray(notes) && adapter.addNote && (() => {
        const pinnedPreview = (notes || []).filter(n => n.pinned)
          .map(n => {
            const firstLine = (n.body || '').split('\n')[0];
            return n.title && firstLine ? `${n.title}: ${firstLine}` : (n.title || firstLine);
          })
          .join(' · ');
        return (
          <div className="notes-strip" onClick={() => setShowNotes(true)}>
            <span className="notes-pill">
              📝 Notes{(notes || []).length > 0 && <span className="notes-pill-count">{notes.length}</span>}
            </span>
            {pinnedPreview ? (
              <>
                <span className="notes-preview-pin">📌</span>
                <span className="notes-preview-txt">{pinnedPreview}</span>
              </>
            ) : (
              <span className="notes-preview-txt notes-preview-hint">
                {(notes || []).length === 0 ? 'Airbnb details, schedule, packing list…' : 'No pinned notes'}
              </span>
            )}
            <span className="notes-preview-more">→</span>
          </div>
        );
      })()}
      {extraHeader}
      <div className="actor-badge">
        <span className="member-dot" style={{ background: actor.color || members?.find(m => m.id === actor.id)?.color || '#666' }} />
        <span className="actor-name">{actor.name}</span>
        {adapter.editMember && (
          <button className="btn btn-ghost btn-xs" onClick={() => setShowProfileEdit(true)} style={{ marginLeft: 4, padding: '2px 8px', fontSize: '0.72rem' }}>Edit Profile</button>
        )}
        {onSwitchIdentity && (
          <button className="btn btn-ghost btn-xs" onClick={onSwitchIdentity} style={{ marginLeft: 4, padding: '2px 8px', fontSize: '0.72rem' }}>Switch</button>
        )}
      </div>
    </div>
  );

  // ── Hero balance card (004 redesign) ──
  const HeroCard = () => {
    const isOwed = actorBal > 0.005;
    const owes = actorBal < -0.005;
    return (
      <div className="hero-card">
        <div className="hero-label">{isOwed ? 'You are owed' : owes ? 'You owe' : 'All square'}</div>
        <div className={`hero-amt ${isOwed ? 'hero-pos' : owes ? 'hero-neg' : 'hero-zero'}`}>
          {fmtSigned(actorBal)}
        </div>
        <div className="hero-sub">of ${totalSpent.toFixed(2)} total · {members?.length || 0} members</div>
        <div className="hero-progress">
          <div className="hero-progress-labels">
            <span>{Math.round(progressPct * 100)}% settled</span>
            <span>${outstandingTotal.toFixed(2)} outstanding</span>
          </div>
          <div className="hero-bar"><div className="hero-bar-fill" style={{ width: `${Math.round(progressPct * 100)}%` }} /></div>
        </div>
        <div className="hero-cta">
          <button className="hero-btn-settle" onClick={() => setTab('debts')}>Settle up →</button>
          <button className="hero-btn-add" onClick={() => { setEditingExpenseId(null); setShowAddExpense(true); }}>+ Expense</button>
        </div>
      </div>
    );
  };

  // ── People grid (004 redesign — replaces member chips + balance chips) ──
  const PeopleGrid = () => (
    <div className="people-grid">
      {members?.map(m => {
        const bal = balances?.[m.id]?.balance || 0;
        const isActor = m.id === actor?.id;
        return (
          <span key={m.id} className={`pcard ${isActor ? 'pcard-mine' : ''}`}>
            <span className="pcard-avatar" style={{ background: m.color || '#999' }}>{initialsOf(m.name)}</span>
            <span className="pcard-main">
              <span className="pcard-name">{m.name}{isActor ? ' (you)' : ''}</span>
              <span className={`pcard-bal ${bal > 0.005 ? 'balance-positive' : bal < -0.005 ? 'balance-negative' : 'balance-zero'}`}>
                {fmtSigned(bal)}
              </span>
            </span>
            {features.admin && isAdmin && adapter.removeMember && (
              <button className="action-btn pcard-remove" onClick={() => removeMember(m.id, m.name)} title={`Remove ${m.name}`}>✕</button>
            )}
          </span>
        );
      })}
      {showAddMember ? (
        <span className="pcard pcard-add-form">
          <input className="form-input" style={{ padding: '4px 8px', fontSize: '0.8rem' }} placeholder="Name" value={newMember} onChange={e => setNewMember(e.target.value)} maxLength={30}
            onKeyDown={e => e.key === 'Enter' && addMember()} autoFocus />
          <button className="btn btn-primary btn-xs" onClick={addMember}>✓</button>
          <button className="btn btn-ghost btn-xs" onClick={() => { setShowAddMember(false); setNewMember(''); }}>✗</button>
        </span>
      ) : (
        <button className="pcard pcard-add" onClick={() => setShowAddMember(true)}>+ Add member</button>
      )}
    </div>
  );



  const editingExpense = editingExpenseId ? expenses?.find(e => e.id === editingExpenseId) : null;

  return (
    <div className="page">
      <Header />

      <div className="group-body">
        <aside className="group-side">
          <HeroCard />
          <PeopleGrid />
        </aside>

      <div className="group-content">
          <div className="tabs">
            <button className={`tab ${tab === 'expenses' ? 'active' : ''}`} onClick={() => setTab('expenses')}>Expenses</button>
            <button className={`tab ${tab === 'debts' ? 'active' : ''}`} onClick={() => setTab('debts')}>
              Settle Up{pendingSettlements.length > 0 && (
                <span className="tab-badge">{pendingSettlements.length}</span>
              )}
            </button>
            {features.auditLog && (
              <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>History</button>
            )}
          </div>

          {error && <div className="error" style={{ margin: '10px 16px' }}>{error}</div>}

          {tab === 'expenses' && (
            <div className="tab-panel" key="expenses-panel">
            <>
              {features.searchFilter && (expenses || []).length > 0 && (
                <div style={{ padding: '10px 16px 0' }}>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 12, top: 10, color: 'var(--text-muted)', fontSize: '0.85rem' }}>🔍</span>
                    <input className="form-input" placeholder="Search expenses..." value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      style={{ paddingLeft: 34, fontSize: '0.88rem' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    <button className={`btn btn-xs ${activeFilters.mine ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setActiveFilters(f => ({ ...f, mine: !f.mine }))}
                      style={{ padding: '3px 10px', fontSize: '0.72rem', borderRadius: 'var(--radius-full)' }}>
                      {activeFilters.mine ? '✓ My expenses' : 'My expenses'}
                    </button>
                    <button className={`btn btn-xs ${activeFilters.recent30 ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setActiveFilters(f => ({ ...f, recent30: !f.recent30 }))}
                      style={{ padding: '3px 10px', fontSize: '0.72rem', borderRadius: 'var(--radius-full)' }}>
                      {activeFilters.recent30 ? '✓ Last 30 days' : 'Last 30 days'}
                    </button>
                    {Object.entries(CATEGORY_MAP).map(([key, cat]) => {
                      const catExps = (expenses || []).filter(e => e.category === key);
                      if (catExps.length === 0) return null;
                      const isActive = filterCategory === key;
                      return (
                        <button key={key} className={`btn btn-xs ${isActive ? 'btn-primary' : 'btn-ghost'}`}
                          onClick={() => setFilterCategory(isActive ? null : key)}
                          style={{ padding: '3px 10px', fontSize: '0.72rem', borderRadius: 'var(--radius-full)' }}>
                          {cat.label} ({catExps.length})
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 8, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {filteredExpenses.length} of {(expenses || []).length} expenses
                    {(searchQuery || filterCategory || activeFilters.mine || activeFilters.recent30) && (
                      <button className="btn btn-ghost btn-xs" style={{ marginLeft: 8, padding: '1px 6px', fontSize: '0.65rem' }}
                        onClick={() => { setSearchQuery(''); setFilterCategory(null); setActiveFilters({ mine: false, recent30: false }); }}>
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              )}

              {filteredExpenses.length === 0 ? (
                <div className="empty-state" style={{ marginTop: 16 }}>
                  <span className="icon" style={{ color: 'var(--text-muted)' }}>💸</span>
                  <p>{(expenses || []).length === 0 ? 'No expenses yet' : 'No matching expenses'}</p>
                  {(expenses || []).length === 0 && <p style={{ fontSize: '0.82rem' }}>Tap below to add one</p>}
                </div>
              ) : (
                <div className="card" style={{ padding: '6px 16px', marginTop: 8 }}>
                  {filteredExpenses.map(e => {
                    const isExpanded = expandedExpenseId === e.id;
                    const splitTypeLabel = { equal: 'Equal', shares: 'Shares', nights: 'Per Day', exact: 'Exact', percentage: '%' }[getExpenseSplitType(e)] || getExpenseSplitType(e);
                    let payersData = null;
                    if (getExpensePayerIsMulti(e) && e.payers_data) {
                      try { payersData = typeof e.payers_data === 'string' ? JSON.parse(e.payers_data) : e.payers_data; } catch (_) { payersData = null; }
                    }
                    return (
                    <div key={e.id}>
                      <div
                        className={`expense-item ${isExpanded ? 'expanded' : ''}`}
                        onClick={() => setExpandedExpenseId(prev => prev === e.id ? null : e.id)}
                      >
                        <div className="expense-left">
                          <div className="expense-desc">{e.description}</div>
                          <div className="expense-meta">
                            {getExpensePayerIsMulti(e) ? <span>Paid by: {e.payer_name}</span> : getExpensePayerName(e)} · {splitTypeLabel} · {e.date}
                            {getExpenseSplitType(e) === 'nights' && getExpenseDateRange(e) && ` · ${new Date(getExpenseDateRange(e) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}→${new Date(getExpenseDateRangeEnd(e) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                          </div>
                        </div>
                        <div className="expense-right">
                          <div className="expense-amount">${e.amount.toFixed(2)}</div>
                          <span className="expense-chevron">{isExpanded ? '▾' : '▸'}</span>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="expense-expanded">
                          {e.category && (
                            <div className="expense-detail-row">
                              <span className="expense-detail-label">Category</span>
                              <span style={{
                                display: 'inline-block',
                                fontSize: '0.68rem',
                                fontWeight: 600,
                                color: CATEGORY_MAP[e.category]?.color || 'var(--text-muted)',
                                background: (CATEGORY_MAP[e.category]?.color || 'var(--text-muted)') + '18',
                                padding: '1px 8px',
                                borderRadius: 'var(--radius-full)',
                              }}>
                                {CATEGORY_MAP[e.category]?.label || e.category}
                              </span>
                            </div>
                          )}
                          {e.splits && e.splits.length > 0 && (
                            <div className="expense-detail-section">
                              <div className="expense-detail-label">Split breakdown</div>
                              {e.splits.map((s, si) => {
                                const member = members?.find(m => m.id === (s.member_id || s.memberId));
                                const memberColor = member?.color || '#999';
                                const memberName = s.member_name || s.memberName || member?.name || '?';
                                return (
                                  <div key={si} className="expense-detail-row">
                                    <span className="expense-detail-name">
                                      <span className="member-dot" style={{ background: memberColor }} />
                                      {memberName}
                                    </span>
                                    <span className="expense-detail-share">${(s.share ?? 0).toFixed(2)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {getExpenseSplitType(e) === 'shares' && e.shares_data && (() => {
                            try {
                              const sd = typeof e.shares_data === 'string' ? JSON.parse(e.shares_data) : e.shares_data;
                              const entries = Object.entries(sd || {}).filter(([k]) => !k.startsWith('_'));
                              if (entries.length === 0) return null;
                              return (
                                <div className="expense-detail-section">
                                  <div className="expense-detail-label">Share weights</div>
                                  {entries.map(([mid, w]) => {
                                    const member = members?.find(m => m.id === mid);
                                    return (
                                      <div key={mid} className="expense-detail-row">
                                        <span className="expense-detail-name">
                                          <span className="member-dot" style={{ background: member?.color || '#999' }} />
                                          {member?.name || 'Unknown'}
                                        </span>
                                        <span className="expense-detail-share">×{String(w)}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            } catch (_) { return null; }
                          })()}
                          {payersData && Array.isArray(payersData) && payersData.length > 1 && (
                            <div className="expense-detail-section">
                              <div className="expense-detail-label">Payer breakdown</div>
                              {payersData.map((p, pi) => {
                                const member = members?.find(m => m.id === (p.member_id || p.memberId || p.id));
                                const memberColor = member?.color || '#999';
                                const memberName = p.name || member?.name || '?';
                                return (
                                  <div key={pi} className="expense-detail-row">
                                    <span className="expense-detail-name">
                                      <span className="member-dot" style={{ background: memberColor }} />
                                      {memberName}
                                    </span>
                                    <span className="expense-detail-share">${(p.amount ?? 0).toFixed(2)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {getExpenseSplitType(e) === 'nights' && e.nights_data && (
                            <div className="expense-detail-section">
                              <div className="expense-detail-label">Nights detail</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                                {(() => {
                                  try {
                                    const nd = typeof e.nights_data === 'string' ? JSON.parse(e.nights_data) : e.nights_data;
                                    if (Array.isArray(nd)) {
                                      // Legacy {date, count} rows
                                      return nd.map((n, ni) => (
                                        <div key={ni} className="expense-detail-row">
                                          <span className="expense-detail-name">{n.date || n.night}</span>
                                          <span className="expense-detail-share">{n.count || 1} {(n.count || 1) > 1 ? 'nights' : 'night'}</span>
                                        </div>
                                      ));
                                    }
                                    // Stored shape: { [memberId]: [night labels], _num_nights, _mode, _calc }
                                    const numNights = nd._num_nights || 0;
                                    const calc = nd._calc || 'proportional';
                                    return (
                                      <div>
                                        <div style={{ marginBottom: 6 }}>
                                          {numNights > 0 && `${numNights} ${numNights > 1 ? 'nights' : 'night'} · `}
                                          {calc === 'daily' ? 'split per day' : 'split by person-nights'}
                                        </div>
                                        {Object.entries(nd).filter(([k]) => !k.startsWith('_')).map(([mid, labels]) => {
                                          const member = members?.find(m => m.id === mid);
                                          const list = Array.isArray(labels) ? labels : [];
                                          return (
                                            <div key={mid} className="expense-detail-row">
                                              <span className="expense-detail-name">
                                                <span className="member-dot" style={{ background: member?.color || '#999' }} />
                                                {member?.name || 'Unknown'}
                                              </span>
                                              <span className="expense-detail-share">
                                                {list.length > 0 ? `${list.length} ${list.length > 1 ? 'nights' : 'night'} (${list.join(', ')})` : '—'}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    );
                                  } catch (_) { return null; }
                                })()}
                              </div>
                            </div>
                          )}
                          {e.notes && (
                            <div className="expense-detail-section">
                              <div className="expense-detail-label">Notes</div>
                              <div className="expense-detail-notes">{e.notes}</div>
                            </div>
                          )}
                          {e.attachment_count > 0 && (
                            <div className="expense-detail-row">
                              <span className="expense-detail-label">Attachments</span>
                              <span className="expense-detail-share">📎 {e.attachment_count}</span>
                            </div>
                          )}
                          <div className="expense-actions-expanded">
                            <button className="action-btn" onClick={(ev) => { ev.stopPropagation(); setEditingExpenseId(e.id); setShowAddExpense(true); }} title="Edit">✏️ Edit</button>
                            <button className="action-btn" onClick={(ev) => { ev.stopPropagation(); deleteExpense(e.id); }} title="Delete">🗑 Delete</button>
                          </div>
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
              <div style={{ padding: '10px 16px' }}>
                <button className="btn btn-primary" onClick={() => { setEditingExpenseId(null); setShowAddExpense(true); }}>+ Add expense</button>
              </div>
            </>
          </div>
          )}

          {tab === 'debts' && (
            <div className="tab-panel" key="debts-panel">
            <>
              {allSettled && pendingSettlements.length === 0 ? (
                <div className="all-settled">
                  <span className="icon">🎉</span>
                  <h3>All settled!</h3>
                  <p>Everyone is even</p>
                </div>
              ) : (
                <>
                  {(transactions || []).length > 0 && (
                    <div className="card">
                      <div className="card-title">Who owes whom</div>
                      {(transactions || []).map((d, i) => {
                        const fromMember = members?.find(m => m.id === d.from.id);
                        const toMember = members?.find(m => m.id === d.to.id);
                        const pendingForPair = pendingByPair[`${d.from.id}|${d.to.id}`] || 0;
                        return (
                          <div key={i} className="debt-row">
                            <div className="debt-info">
                              <div className="debt-who">
                                <strong>{d.from.name}</strong> owes <strong>{d.to.name}</strong>
                                {pendingForPair > 0 && (
                                  <span style={{ marginLeft: 8, fontSize: '0.72rem', color: 'var(--amber)', fontWeight: 600 }}>
                                    ${pendingForPair.toFixed(2)} pending
                                  </span>
                                )}
                              </div>
                              <div className="debt-amount balance-negative">−{d.amount.toFixed(2)}</div>
                            </div>
                            <div className="debt-pay">
                              {toMember?.venmo_link && (() => {
                                const v = toMember.venmo_link;
                                const url = v.startsWith('http') ? v : `https://${v}`;
                                return (
                                  <a
                                    className="pay-link pay-venmo"
                                    title="Open in Venmo"
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    Venmo
                                  </a>
                                );
                              })()}
                              {toMember?.zelle_handle && (
                                <button
                                  className="pay-link pay-zelle"
                                  title="Tap to copy Zelle info"
                                  onClick={() => {
                                    navigator.clipboard.writeText(toMember.zelle_handle);
                                    setCopiedPay(`zelle-${i}`);
                                    setTimeout(() => setCopiedPay(null), 2000);
                                  }}
                                >
                                  {copiedPay === `zelle-${i}` ? '✓ Copied' : `Zelle: ${toMember.zelle_handle}`}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {pendingSettlements.length > 0 && (
                    <div className="card">
                      <div className="card-title">Pending</div>
                      {pendingSettlements.map(s => {
                        const fromName = s.from_name || members?.find(m => m.id === (s.from_id || s.fromId))?.name || '?';
                        const toName = s.to_name || members?.find(m => m.id === (s.to_id || s.toId))?.name || '?';
                        return (
                          <div key={s.id} className="settlement-item">
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{fromName} paid {toName}</div>
                              <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>${s.amount.toFixed(2)}</div>
                            </div>
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                              {adapter.confirmSettlement && (
                                <>
                                  <button className="btn btn-primary btn-xs" onClick={() => confirmSettlement(s.id)} title="Confirm">✓</button>
                                  <button className="btn btn-secondary btn-xs" onClick={() => disputeSettlement(s.id)} title="Dispute">✗</button>
                                </>
                              )}
                              {adapter.cancelSettlement && (
                                <button className="btn btn-danger-outline btn-xs" onClick={() => cancelSettlement(s.id)} title="Cancel this record">🗑 Cancel</button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {(() => {
                    const confirmedList = settlements?.filter(s => s.status === 'confirmed') || [];
                    if (confirmedList.length === 0) return null;
                    return (
                      <div className="card">
                        <div className="card-title" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowConfirmed(v => !v)}>
                          <span>Confirmed ({confirmedList.length}) {showConfirmed ? '▾' : '▸'}</span>
                        </div>
                        {showConfirmed && confirmedList.map(s => {
                          const fromName = s.from_name || members?.find(m => m.id === (s.from_id || s.fromId))?.name || '?';
                          const toName = s.to_name || members?.find(m => m.id === (s.to_id || s.toId))?.name || '?';
                          return (
                            <div key={s.id} className="settlement-item">
                              <div>
                                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{fromName} → {toName}</div>
                                <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>${s.amount.toFixed(2)}</div>
                              </div>
                              <span className="settlement-status confirmed">✓</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </>
              )}
              {!allSettled && (transactions || []).length > 0 && (
                <div style={{ padding: '8px 16px' }}>
                  <button className="btn btn-primary" onClick={() => setShowAddSettlement(true)}>Record settlement</button>
                </div>
              )}
            </>
          </div>
          )}

          {tab === 'history' && features.auditLog && (
            <div className="tab-panel" key="history-panel">
            <div className="card" style={{ padding: 0 }}>
              {(!auditEntries || auditEntries.length === 0) ? (
                <div className="empty-state"><p>No activity yet</p></div>
              ) : (
                auditEntries.map(entry => {
                  const formatAuditTime = (ts) => {
                    const d = new Date(ts + 'Z');
                    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
                  };
                  const auditActionLabel = (action) => ({ create: 'created', update: 'updated', delete: 'deleted', confirmed: 'confirmed', disputed: 'disputed' })[action] || action;
                  const auditEntityDesc = (entry) => {
                    const c = entry.changes;
                    if (!c) return entry.entity_type;
                    if (c.description) return `${entry.entity_type} "${c.description}"`;
                    if (c.name) return `${entry.entity_type} "${c.name}"`;
                    if (c.from) return `${entry.entity_type}: ${c.from} → ${c.to} $${c.amount?.toFixed(2)}`;
                    return entry.entity_type;
                  };
                  return (
                    <div key={entry.id} className="audit-entry">
                      <span className={`audit-badge ${entry.action}`}>{auditActionLabel(entry.action)}</span>
                      <div style={{ flex: 1, fontSize: '0.83rem', lineHeight: 1.4 }}>
                        <div><strong>{entry.member_name || 'someone'}</strong> {auditActionLabel(entry.action)} {auditEntityDesc(entry)}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>{formatAuditTime(entry.created_at)}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          )}
        </div>
      </div>

      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          onConfirm={async () => {
            const action = confirmDialog.action;
            setConfirmDialog(null);
            await action();
          }}
          onClose={() => setConfirmDialog(null)}
        />
      )}
      {showProfileEdit && (
        <ProfileEdit
          member={members?.find(m => m.id === actor.id) || actor}
          adapter={adapter}
          onClose={() => setShowProfileEdit(false)}
          onSaved={() => { setShowProfileEdit(false); if (onRefresh) onRefresh(); }}
        />
      )}
      {showAddExpense && (
        <AddExpense
          key={editingExpenseId || 'new'}
          members={members}
          expense={editingExpense}
          adapter={adapter}
          features={features}
          actor={actor}
          onClose={() => { setShowAddExpense(false); setEditingExpenseId(null); }}
          onSaved={() => { setShowAddExpense(false); setEditingExpenseId(null); if (onRefresh) onRefresh(); }}
          AttachmentManager={AttachmentManager}
          attachmentProps={{ ...attachmentProps, ...(editingExpense ? { expenseId: editingExpenseId } : {}) }}
        />
      )}
      {showAddSettlement && (
        <AddSettlement
          members={members}
          debts={transactions || []}
          adapter={adapter}
          actor={actor}
          onClose={() => setShowAddSettlement(false)}
          onSaved={() => { setShowAddSettlement(false); if (onRefresh) onRefresh(); }}
        />
      )}
      {showNotes && Array.isArray(notes) && adapter.addNote && (
        <NotesSheet
          open={showNotes}
          onClose={() => setShowNotes(false)}
          notes={notes || []}
          members={members || []}
          actor={actor}
          adapter={adapter}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}

export default GroupPage;