import { useState, useMemo } from 'react';
import { CATEGORY_MAP } from '@splitdumb/core/categories';
import AddExpense from './AddExpense';
import AddSettlement from './AddSettlement';
import IdentityPicker from './IdentityPicker';

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
}) {
  const [tab, setTab] = useState('expenses');
  const [newMember, setNewMember] = useState('');
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [showAddSettlement, setShowAddSettlement] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState(null);
  const [activeFilters, setActiveFilters] = useState({ mine: false, recent30: false });
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [showActorPicker, setShowActorPicker] = useState(false);

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
    if (!confirm(`Remove ${name}? This will delete their expenses and splits.`)) return;
    try {
      await adapter.removeMember(id, name);
      if (onRefresh) onRefresh();
    } catch (err) { setError(err.message); }
  };

  const deleteExpense = async (id) => {
    if (!confirm('Delete this expense?')) return;
    try {
      await adapter.deleteExpense(id);
      if (onRefresh) onRefresh();
    } catch (err) { setError(err.message); }
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

  const totalSpent = expenses?.reduce((sum, e) => sum + e.amount, 0) || 0;
  const allSettled = (transactions || []).length === 0;
  const pendingSettlements = settlements?.filter(s => s.status === 'pending') || [];

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="group-name">{group?.name}</div>
        </div>
        {features.admin && isAdmin && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
            <span className="badge badge-primary">Admin</span>
            <button className="btn btn-sm" style={{ background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.2)', width: 'auto', padding: '4px 10px', fontSize: '0.8rem' }}
              onClick={async () => {
                if (!confirm('Delete this entire group? This cannot be undone.')) return;
                try { await adapter.deleteGroup(); if (onLeave) onLeave(); }
                catch (err) { setError(err.message); }
              }} title="Delete group">🗑 Delete</button>
          </div>
        )}
        {onLeave && (
          <button className="btn btn-sm" style={{ width: 'auto', padding: '4px 10px', fontSize: '0.8rem' }} onClick={onLeave}>← Home</button>
        )}
      </div>
      <div className="group-code">
        <code>{group?.code}</code>
        <button className="copy-btn" onClick={copyCode}>{copied ? '✓ Copied' : '🔗 Share'}</button>
      </div>
      {extraHeader}
      <div className="actor-badge">
        <div className="actor-row" style={{ alignItems: 'center' }}>
          <div className="actor-label" style={{ marginBottom: 0 }}>You are</div>
          <div style={{ flex: 1 }} />
          {onSwitchIdentity && (
            <button className="btn btn-ghost btn-xs" onClick={onSwitchIdentity} style={{ flexShrink: 0, padding: '2px 8px', fontSize: '0.72rem' }}>⇄ Switch</button>
          )}
        </div>
        <div className="actor-row">
          <span className="member-dot" style={{ background: actor.color || members?.find(m => m.id === actor.id)?.color || '#666' }} />
          <span className="actor-name">{actor.name}</span>
        </div>
      </div>
    </div>
  );

  const MembersCard = () => (
    <div className="card">
      <div className="card-title">Members · {members?.length || 0}</div>
      <div className="member-chips">
        {members?.map(m => (
          <span key={m.id} className="member-chip" style={{ background: m.color + '18', borderColor: m.color + '40' }}>
            <span className="member-dot" style={{ background: m.color }} />{m.name}
            {features.admin && isAdmin && adapter.removeMember && <button className="action-btn" onClick={() => removeMember(m.id, m.name)} style={{ padding: '0 4px', marginLeft: 2 }}>✕</button>}
          </span>
        ))}
      </div>
      {showAddMember ? (
        <div className="add-member-row" style={{ flexDirection: 'column', gap: 8 }}>
          <input className="form-input" style={{ width: '100%', padding: '10px 12px' }} placeholder="Name" value={newMember} onChange={e => setNewMember(e.target.value)} maxLength={30}
            onKeyDown={e => e.key === 'Enter' && addMember()} autoFocus />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" style={{ flex: 1, width: 'auto' }} onClick={addMember}>Add</button>
            <button className="btn btn-secondary btn-sm" style={{ flex: 1, width: 'auto' }} onClick={() => { setShowAddMember(false); setNewMember(''); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setShowAddMember(true)}>+ Add member</button>
      )}
    </div>
  );

  const SummaryCard = () => (
    <div className="card">
      <div className="card-title">Summary</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ color: 'var(--text-dim)', fontSize: '0.88rem' }}>Total spent</span>
        <span style={{ fontWeight: 800, fontSize: '1.35rem', letterSpacing: '-0.02em' }}>${totalSpent.toFixed(2)}</span>
      </div>
      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {members?.map(m => {
          const bal = balances?.[m.id]?.balance || 0;
          return (
            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', fontSize: '0.88rem', gap: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span className="member-dot" style={{ background: m.color }} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
              </span>
              <span style={{ fontWeight: 600, flexShrink: 0 }} className={bal > 0.005 ? 'balance-positive' : bal < -0.005 ? 'balance-negative' : 'balance-zero'}>
                {bal > 0.005 ? '+' : ''}{bal.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  const Sidebar = () => (
    <>
      <Header />
      <MembersCard />
      <SummaryCard />
    </>
  );

  const editingExpense = editingExpenseId ? expenses?.find(e => e.id === editingExpenseId) : null;

  return (
    <div className="page">
      <div className="group-layout">
        <div className="group-sidebar">
          <Sidebar />
        </div>

        <div className="group-main">
          <div className="tabs">
            <button className={`tab ${tab === 'expenses' ? 'active' : ''}`} onClick={() => setTab('expenses')}>Expenses</button>
            <button className={`tab ${tab === 'debts' ? 'active' : ''}`} onClick={() => setTab('debts')}>Settle Up</button>
            {features.auditLog && (
              <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>History</button>
            )}
          </div>

          {error && <div className="error" style={{ margin: '10px 16px' }}>{error}</div>}

          {tab === 'expenses' && (
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
                  {filteredExpenses.map(e => (
                    <div key={e.id} className="expense-item">
                      <div className="expense-left">
                        <div className="expense-desc">{e.description}</div>
                        {e.category && (
                          <span style={{
                            display: 'inline-block',
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            color: CATEGORY_MAP[e.category]?.color || 'var(--text-muted)',
                            background: (CATEGORY_MAP[e.category]?.color || 'var(--text-muted)') + '18',
                            padding: '1px 8px',
                            borderRadius: 'var(--radius-full)',
                            marginTop: 3,
                          }}>
                            {CATEGORY_MAP[e.category]?.label || e.category}
                          </span>
                        )}
                        {e.notes && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>
                            {e.notes}
                          </div>
                        )}
                        <div className="expense-meta">
                          {getExpensePayerIsMulti(e) ? <span>Paid by: {e.payer_name}</span> : getExpensePayerName(e)} · {{ equal: 'Equal', shares: 'Shares', nights: 'Per Day', exact: 'Exact', percentage: '%' }[getExpenseSplitType(e)] || getExpenseSplitType(e)} · {e.date}
                          {getExpenseSplitType(e) === 'nights' && getExpenseDateRange(e) && ` · ${new Date(getExpenseDateRange(e) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}→${new Date(getExpenseDateRangeEnd(e) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                        </div>
                      </div>
                      <div className="expense-actions">
                        <div className="expense-amount">${e.amount.toFixed(2)}</div>
                        <button className="action-btn" onClick={() => { setEditingExpenseId(e.id); setShowAddExpense(true); }} title="Edit">✏️</button>
                        <button className="action-btn" onClick={() => deleteExpense(e.id)} title="Delete">🗑</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ padding: '10px 16px' }}>
                <button className="btn btn-primary" onClick={() => { setEditingExpenseId(null); setShowAddExpense(true); }}>+ Add expense</button>
              </div>
            </>
          )}

          {tab === 'debts' && (
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
                      {(transactions || []).map((d, i) => (
                        <div key={i} className="debt-row">
                          <div className="debt-who"><strong>{d.from.name}</strong> owes <strong>{d.to.name}</strong></div>
                          <div className="debt-amount balance-negative">${d.amount.toFixed(2)}</div>
                        </div>
                      ))}
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
                            {adapter.confirmSettlement && (
                              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                <button className="btn btn-primary btn-xs" onClick={() => confirmSettlement(s.id)} title="Confirm">✓</button>
                                <button className="btn btn-secondary btn-xs" onClick={() => disputeSettlement(s.id)} title="Dispute">✗</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {settlements?.filter(s => s.status === 'confirmed').length > 0 && (
                    <div className="card">
                      <div className="card-title">Confirmed</div>
                      {settlements.filter(s => s.status === 'confirmed').map(s => {
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
                  )}
                </>
              )}
              {!allSettled && (transactions || []).length > 0 && (
                <div style={{ padding: '8px 16px' }}>
                  <button className="btn btn-primary" onClick={() => setShowAddSettlement(true)}>Record settlement</button>
                </div>
              )}
            </>
          )}

          {tab === 'history' && features.auditLog && (
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
          )}
        </div>
      </div>

      {showAddExpense && (
        <AddExpense
          key={editingExpenseId || 'new'}
          members={members}
          expense={editingExpense}
          adapter={adapter}
          features={features}
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
          onClose={() => setShowAddSettlement(false)}
          onSaved={() => { setShowAddSettlement(false); if (onRefresh) onRefresh(); }}
        />
      )}
    </div>
  );
}

export default GroupPage;