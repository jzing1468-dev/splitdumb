import { useState } from 'react';
import { api } from '../api';

function AddExpense({ group, code, onClose, onSaved }) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [payerId, setPayerId] = useState(group.members?.[0]?.id || '');
  const [splitType, setSplitType] = useState('equal');
  const [splitAmong, setSplitAmong] = useState(group.members?.map(m => m.id) || []);
  const [exactAmounts, setExactAmounts] = useState({});
  const [percentages, setPercentages] = useState({});
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const toggleMember = (id) => {
    setSplitAmong(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

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
    if (splitAmong.length === 0) {
      setError('At least one person must be in the split');
      return;
    }

    const payload = {
      description: description.trim(),
      amount: numAmount,
      payer_id: payerId,
      split_type: splitType,
      split_among: splitAmong,
      date,
    };

    if (splitType === 'exact') {
      payload.exact_amounts = exactAmounts;
    } else if (splitType === 'percentage') {
      payload.percentages = percentages;
    }

    setLoading(true);
    try {
      await api.addExpense(code, payload);
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
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Add Expense</h2>
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

          <div className="form-group">
            <label className="form-label">Split type</label>
            <div className="split-type-toggle">
              <button type="button" className={`split-type-btn ${splitType === 'equal' ? 'active' : ''}`}
                onClick={() => setSplitType('equal')}>Equal</button>
              <button type="button" className={`split-type-btn ${splitType === 'exact' ? 'active' : ''}`}
                onClick={() => setSplitType('exact')}>Exact</button>
              <button type="button" className={`split-type-btn ${splitType === 'percentage' ? 'active' : ''}`}
                onClick={() => setSplitType('percentage')}>%</button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              Split among
              <button type="button" className="btn btn-secondary btn-sm" onClick={toggleAll}
                style={{ marginLeft: 8, width: 'auto', padding: '2px 8px', fontSize: '0.7rem' }}>
                {splitAmong.length === group.members.length ? 'None' : 'All'}
              </button>
            </label>
            <div className="member-chips">
              {group.members?.map(m => (
                <span
                  key={m.id}
                  className={`member-chip ${splitAmong.includes(m.id) ? 'selected' : ''}`}
                  style={{ background: splitAmong.includes(m.id) ? m.color + '22' : 'var(--surface2)',
                    borderColor: splitAmong.includes(m.id) ? m.color : 'transparent' }}
                  onClick={() => toggleMember(m.id)}
                >
                  <span className="member-dot" style={{ background: m.color }}></span>
                  {m.name}
                </span>
              ))}
            </div>
          </div>

          {splitType === 'exact' && splitAmong.map(id => {
            const m = group.members.find(m => m.id === id);
            return (
              <div key={id} className="share-section">
                <span className="member-dot" style={{ background: m.color }}></span>
                <span style={{ flex: 1 }}>{m.name}</span>
                <input className="form-input" type="number" step="0.01" min="0" placeholder="0.00"
                  value={exactAmounts[id] || ''}
                  onChange={e => setExactAmounts(prev => ({ ...prev, [id]: parseFloat(e.target.value) || 0 }))} />
              </div>
            );
          })}

          {splitType === 'percentage' && splitAmong.map(id => {
            const m = group.members.find(m => m.id === id);
            return (
              <div key={id} className="share-section">
                <span className="member-dot" style={{ background: m.color }}></span>
                <span style={{ flex: 1 }}>{m.name}</span>
                <input className="form-input" type="number" step="0.1" min="0" max="100" placeholder="0"
                  value={percentages[id] || ''}
                  onChange={e => setPercentages(prev => ({ ...prev, [id]: parseFloat(e.target.value) || 0 }))} />
                <span>%</span>
              </div>
            );
          })}

          <div className="form-group">
            <label className="form-label">Date</label>
            <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? 'Saving...' : 'Add Expense'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AddExpense;