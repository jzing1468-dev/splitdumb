import { useState, useMemo } from 'react';
import { api } from '../api';

function AddExpense({ group, code, expense, onClose, onSaved }) {
  const isEditing = !!expense;
  const [description, setDescription] = useState(expense?.description || '');
  const [amount, setAmount] = useState(expense?.amount?.toString() || '');
  const [payerId, setPayerId] = useState(expense?.payer_id || group.members?.[0]?.id || '');
  const [splitType, setSplitType] = useState(expense?.split_type || 'equal');
  const [includePayer, setIncludePayer] = useState(true);
  const [splitAmong, setSplitAmong] = useState(
    expense ? expense.splits?.map(s => s.member_id) || [] : group.members?.map(m => m.id) || []
  );
  const [exactAmounts, setExactAmounts] = useState(
    expense && expense.split_type === 'exact'
      ? Object.fromEntries(expense.splits?.map(s => [s.member_id, s.share.toString()])) || {}
      : {}
  );
  const [percentages, setPercentages] = useState(
    expense && expense.split_type === 'percentage'
      ? Object.fromEntries(expense.splits?.map(s => [s.member_id, ((s.share / expense.amount) * 100).toFixed(1)])) || {}
      : {}
  );
  const [sharesInput, setSharesInput] = useState(() => {
    if (expense && expense.split_type === 'shares') {
      // Reconstruct shares from splits — not stored, so default to 1 each
      return Object.fromEntries(expense.splits?.map(s => [s.member_id, '1'])) || {};
    }
    return Object.fromEntries(group.members?.map(m => [m.id, '1']) || []) ;
  });
  const [dateRangeStart, setDateRangeStart] = useState(expense?.date_range_start || '');
  const [dateRangeEnd, setDateRangeEnd] = useState(expense?.date_range_end || '');
  const [nightsInput, setNightsInput] = useState(() => {
    if (expense && expense.split_type === 'nights' && expense.nights_data) {
      return typeof expense.nights_data === 'string' ? JSON.parse(expense.nights_data) : expense.nights_data;
    }
    return {};
  });
  const [date, setDate] = useState(expense?.date || new Date().toISOString().split('T')[0]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Effective split list — if payer exclusion is off, remove payer from splitAmong
  const effectiveSplitAmong = useMemo(() => {
    if (!includePayer && payerId) {
      return splitAmong.filter(id => id !== payerId);
    }
    return splitAmong;
  }, [splitAmong, includePayer, payerId]);

  const toggleMember = (id) => {
    setSplitAmong(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  // Generate night dates between start and end
  const nightDates = useMemo(() => {
    if (!dateRangeStart || !dateRangeEnd) return [];
    const start = new Date(dateRangeStart);
    const end = new Date(dateRangeEnd);
    const nights = [];
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      nights.push(d.toISOString().split('T')[0]);
    }
    return nights;
  }, [dateRangeStart, dateRangeEnd]);

  const toggleNight = (member_id, night) => {
    setNightsInput(prev => {
      const current = prev[member_id] || [];
      const updated = current.includes(night)
        ? current.filter(n => n !== night)
        : [...current, night];
      return { ...prev, [member_id]: updated };
    });
  };

  const selectAllNights = (member_id) => {
    setNightsInput(prev => ({ ...prev, [member_id]: [...nightDates] }));
  };

  const clearAllNights = (member_id) => {
    setNightsInput(prev => ({ ...prev, [member_id]: [] }));
  };

  // Preview calculation
  const preview = useMemo(() => {
    const numAmount = parseFloat(amount) || 0;
    if (numAmount <= 0 || effectiveSplitAmong.length === 0) return {};

    if (splitType === 'equal') {
      const perPerson = Math.round((numAmount / effectiveSplitAmong.length) * 100) / 100;
      const total = Math.round(perPerson * effectiveSplitAmong.length * 100) / 100;
      const remainder = Math.round((numAmount - total) * 100) / 100;
      const result = {};
      effectiveSplitAmong.forEach((id, i) => {
        result[id] = perPerson + (i < Math.round(remainder * 100) ? 0.01 : 0);
      });
      return result;
    }
    if (splitType === 'shares') {
      const totalShares = effectiveSplitAmong.reduce((sum, id) => sum + (parseFloat(sharesInput[id]) || 0), 0);
      if (totalShares <= 0) return {};
      let totalAllocated = 0;
      const result = {};
      effectiveSplitAmong.forEach(id => {
        const s = parseFloat(sharesInput[id]) || 0;
        result[id] = Math.round((s / totalShares) * numAmount * 100) / 100;
        totalAllocated += result[id];
      });
      return result;
    }
    if (splitType === 'nights' && nightDates.length > 0) {
      const perNightCost = numAmount / nightDates.length;
      const result = {};
      nightDates.forEach(night => {
        const present = effectiveSplitAmong.filter(id => (nightsInput[id] || []).includes(night));
        if (present.length === 0) return;
        const perPerson = perNightCost / present.length;
        present.forEach(id => {
          result[id] = (result[id] || 0) + perPerson;
        });
      });
      // Round
      Object.keys(result).forEach(id => {
        result[id] = Math.round(result[id] * 100) / 100;
      });
      return result;
    }
    if (splitType === 'exact') {
      const result = {};
      effectiveSplitAmong.forEach(id => {
        result[id] = parseFloat(exactAmounts[id]) || 0;
      });
      return result;
    }
    if (splitType === 'percentage') {
      const result = {};
      effectiveSplitAmong.forEach(id => {
        result[id] = Math.round(numAmount * (parseFloat(percentages[id]) || 0) / 100 * 100) / 100;
      });
      return result;
    }
    return {};
  }, [amount, splitType, effectiveSplitAmong, sharesInput, exactAmounts, percentages, nightsInput, nightDates]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      setError('Amount must be greater than $0');
      return;
    }
    if (!description.trim()) {
      setError('Description is required');
      return;
    }
    if (!payerId) {
      setError('Select who paid');
      return;
    }
    if (effectiveSplitAmong.length === 0) {
      setError('At least one person must be in the split');
      return;
    }

    // Validation for specific types
    if (splitType === 'exact') {
      const total = effectiveSplitAmong.reduce((sum, id) => sum + (parseFloat(exactAmounts[id]) || 0), 0);
      if (Math.abs(total - numAmount) > 0.01) {
        setError(`Amounts must equal total ($${numAmount.toFixed(2)}). Current: $${total.toFixed(2)}`);
        return;
      }
    }
    if (splitType === 'percentage') {
      const total = effectiveSplitAmong.reduce((sum, id) => sum + (parseFloat(percentages[id]) || 0), 0);
      if (Math.abs(total - 100) > 0.01) {
        setError(`Percentages must total 100%. Current: ${total.toFixed(1)}%`);
        return;
      }
    }
    if (splitType === 'shares') {
      const totalShares = effectiveSplitAmong.reduce((sum, id) => sum + (parseFloat(sharesInput[id]) || 0), 0);
      if (totalShares <= 0) {
        setError('Total shares must be greater than 0');
        return;
      }
    }
    if (splitType === 'nights') {
      if (!dateRangeStart || !dateRangeEnd) {
        setError('Select a date range for nights split');
        return;
      }
      const hasAnyNight = effectiveSplitAmong.some(id => (nightsInput[id] || []).length > 0);
      if (!hasAnyNight) {
        setError('Select which nights each person was present');
        return;
      }
    }

    const payload = {
      description: description.trim(),
      amount: numAmount,
      payer_id: payerId,
      split_type: splitType,
      split_among: effectiveSplitAmong,
      date,
    };

    if (splitType === 'exact') payload.exact_amounts = exactAmounts;
    if (splitType === 'percentage') payload.percentages = percentages;
    if (splitType === 'shares') payload.shares = Object.fromEntries(
      effectiveSplitAmong.map(id => [id, parseFloat(sharesInput[id]) || 1])
    );
    if (splitType === 'nights') {
      payload.nights = nightsInput;
      payload.date_range_start = dateRangeStart;
      payload.date_range_end = dateRangeEnd;
    }

    setLoading(true);
    try {
      if (isEditing) {
        await api.editExpense(code, expense.id, payload);
      } else {
        await api.addExpense(code, payload);
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleAll = () => {
    if (splitAmong.length === group.members.length) {
      setSplitAmong([]);
    } else {
      setSplitAmong(group.members.map(m => m.id));
    }
  };

  const splitTypes = [
    { key: 'equal', label: 'Equal' },
    { key: 'shares', label: 'Shares' },
    { key: 'nights', label: 'Nights' },
    { key: 'exact', label: 'Exact' },
    { key: 'percentage', label: '%' },
  ];

  const getMemberName = (id) => group.members?.find(m => m.id === id)?.name || id;

  // Format date for display (Mon 5/1)
  const fmtDate = (d) => {
    const dt = new Date(d + 'T12:00:00');
    return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end',
      justifyContent: 'center', zIndex: 200
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg)', width: '100%', maxWidth: 480,
        maxHeight: '90vh', overflowY: 'auto', borderRadius: '16px 16px 0 0',
        padding: 24
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>{isEditing ? 'Edit Expense' : 'Add Expense'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
        </div>

        {error && <div className="error" style={{ margin: '0 0 16px' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Description</label>
            <input className="form-input" placeholder="Dinner at Joe's" value={description}
              onChange={e => setDescription(e.target.value)} maxLength={100} autoFocus />
          </div>

          <div className="form-group">
            <label className="form-label">Amount</label>
            <input className="form-input" type="number" step="0.01" min="0.01" placeholder="0.00"
              value={amount} onChange={e => setAmount(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">Who paid?</label>
            <select className="form-input" value={payerId} onChange={e => setPayerId(e.target.value)}>
              <option value="">Select...</option>
              {group.members?.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* Payer inclusion toggle */}
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="includePayer" checked={includePayer}
              onChange={e => setIncludePayer(e.target.checked)} />
            <label htmlFor="includePayer" className="form-label" style={{ margin: 0 }}>Include payer in split</label>
          </div>

          <div className="form-group">
            <label className="form-label">Split type</label>
            <div className="split-type-toggle" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {splitTypes.map(st => (
                <button key={st.key} type="button"
                  className={`split-type-btn ${splitType === st.key ? 'active' : ''}`}
                  onClick={() => setSplitType(st.key)}>
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* Member selection — shown for all types */}
          <div className="form-group">
            <label className="form-label">
              Split among
              <button type="button" className="btn btn-secondary btn-sm" onClick={toggleAll}
                style={{ marginLeft: 8, width: 'auto', padding: '2px 8px', fontSize: '0.7rem' }}>
                {splitAmong.length === group.members.length ? 'None' : 'All'}
              </button>
            </label>
            <div className="member-chips">
              {group.members?.map(m => {
                const excluded = !includePayer && m.id === payerId;
                return (
                  <span
                    key={m.id}
                    className={`member-chip ${splitAmong.includes(m.id) ? 'selected' : ''}`}
                    style={{
                      background: splitAmong.includes(m.id) && !excluded ? m.color + '22' : 'var(--surface2)',
                      borderColor: splitAmong.includes(m.id) && !excluded ? m.color : 'transparent',
                      opacity: excluded ? 0.4 : 1,
                      cursor: excluded ? 'not-allowed' : 'pointer',
                    }}
                    onClick={() => !excluded && toggleMember(m.id)}
                  >
                    <span className="member-dot" style={{ background: m.color }}></span>
                    {m.name}
                    {!includePayer && m.id === payerId && <span style={{ fontSize: '0.65rem', marginLeft: 4, opacity: 0.6 }}>(payer)</span>}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Shares split — number inputs */}
          {splitType === 'shares' && effectiveSplitAmong.map(id => {
            const m = group.members?.find(m => m.id === id);
            return (
              <div key={id} className="share-section">
                <span className="member-dot" style={{ background: m?.color }}></span>
                <span style={{ flex: 1 }}>{m?.name}</span>
                <input className="form-input" type="number" step="1" min="1" style={{ width: 60 }}
                  value={sharesInput[id] || '1'}
                  onChange={e => setSharesInput(prev => ({ ...prev, [id]: e.target.value }))} />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>share{parseFloat(sharesInput[id]) !== 1 ? 's' : ''}</span>
              </div>
            );
          })}

          {/* Nights split — date range + calendar grid */}
          {splitType === 'nights' && (
            <>
              <div className="form-group">
                <label className="form-label">Date range</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="form-input" type="date" value={dateRangeStart}
                    onChange={e => setDateRangeStart(e.target.value)} />
                  <span style={{ alignSelf: 'center' }}>→</span>
                  <input className="form-input" type="date" value={dateRangeEnd}
                    onChange={e => setDateRangeEnd(e.target.value)} />
                </div>
              </div>

              {nightDates.length > 0 && (
                <div className="form-group">
                  <label className="form-label">
                    Who was there each night?
                    <button type="button" className="btn btn-secondary btn-sm"
                      onClick={() => {
                        const allNights = Object.fromEntries(
                          effectiveSplitAmong.map(id => [id, [...nightDates]])
                        );
                        setNightsInput(allNights);
                      }}
                      style={{ marginLeft: 8, width: 'auto', padding: '2px 8px', fontSize: '0.7rem' }}>
                      All nights
                    </button>
                  </label>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.8rem' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '4px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Person</th>
                          {nightDates.map(d => (
                            <th key={d} style={{ padding: '4px 4px', textAlign: 'center', borderBottom: '1px solid var(--border)', fontSize: '0.65rem', writingMode: 'vertical-rl', maxWidth: 28 }}>
                              {fmtDate(d)}
                            </th>
                          ))}
                          <th style={{ padding: '4px 8px', textAlign: 'center', borderBottom: '1px solid var(--border)', fontSize: '0.7rem' }}>Nights</th>
                        </tr>
                      </thead>
                      <tbody>
                        {effectiveSplitAmong.map(id => {
                          const m = group.members?.find(m => m.id === id);
                          const present = nightsInput[id] || [];
                          return (
                            <tr key={id}>
                              <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                                <span className="member-dot" style={{ background: m?.color, display: 'inline-block' }}></span>{' '}
                                {m?.name}
                              </td>
                              {nightDates.map(d => (
                                <td key={d} style={{ padding: '2px', textAlign: 'center' }}>
                                  <input type="checkbox" checked={present.includes(d)}
                                    onChange={() => toggleNight(id, d)}
                                    style={{ width: 16, height: 16, accentColor: m?.color }} />
                                </td>
                              ))}
                              <td style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 600, fontSize: '0.8rem' }}>
                                {present.length}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Exact split — amount per person */}
          {splitType === 'exact' && effectiveSplitAmong.map(id => {
            const m = group.members?.find(m => m.id === id);
            return (
              <div key={id} className="share-section">
                <span className="member-dot" style={{ background: m?.color }}></span>
                <span style={{ flex: 1 }}>{m?.name}</span>
                <input className="form-input" type="number" step="0.01" min="0" placeholder="0.00"
                  value={exactAmounts[id] || ''}
                  onChange={e => setExactAmounts(prev => ({ ...prev, [id]: parseFloat(e.target.value) || 0 }))} />
              </div>
            );
          })}

          {/* Percentage split — % per person */}
          {splitType === 'percentage' && effectiveSplitAmong.map(id => {
            const m = group.members?.find(m => m.id === id);
            return (
              <div key={id} className="share-section">
                <span className="member-dot" style={{ background: m?.color }}></span>
                <span style={{ flex: 1 }}>{m?.name}</span>
                <input className="form-input" type="number" step="0.1" min="0" max="100" placeholder="0"
                  value={percentages[id] || ''}
                  onChange={e => setPercentages(prev => ({ ...prev, [id]: parseFloat(e.target.value) || 0 }))} />
                <span>%</span>
              </div>
            );
          })}

          {/* Preview */}
          {Object.keys(preview).length > 0 && (
            <div className="form-group" style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12, marginTop: 8 }}>
              <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: 4 }}>Split preview</label>
              {effectiveSplitAmong.map(id => {
                const m = group.members?.find(m => m.id === id);
                const share = preview[id];
                if (share === undefined) return null;
                return (
                  <div key={id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '2px 0' }}>
                    <span><span className="member-dot" style={{ background: m?.color }}></span> {m?.name}</span>
                    <span style={{ fontWeight: 600 }}>${share.toFixed(2)}</span>
                  </div>
                );
              })}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 4, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '0.85rem' }}>
                <span>Total</span>
                <span>${Object.values(preview).reduce((s, v) => s + v, 0).toFixed(2)}</span>
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Date</label>
            <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? 'Saving...' : isEditing ? 'Update Expense' : 'Add Expense'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AddExpense;