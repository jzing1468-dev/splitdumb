import { useState } from 'react';
import { api } from '../api';

function AddSettlement({ group, code, onClose, onSaved }) {
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const debts = group.simplifiedDebts || [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const numAmount = parseFloat(amount);
    if (!fromId || !toId) {
      setError('Select who paid and who received');
      return;
    }
    if (fromId === toId) {
      setError('Cannot settle with yourself');
      return;
    }
    if (!numAmount || numAmount <= 0) {
      setError('Amount must be greater than $0');
      return;
    }

    setLoading(true);
    try {
      await api.addSettlement(code, {
        from_id: fromId,
        to_id: toId,
        amount: numAmount
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fillFromDebt = (debt) => {
    setFromId(debt.from.id);
    setToId(debt.to.id);
    setAmount(debt.amount.toString());
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
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Record Settlement</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
        </div>

        {error && <div className="error" style={{ margin: '0 0 16px' }}>{error}</div>}

        {debts.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div className="card-title">Quick Fill</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {debts.map((d, i) => (
                <button key={i} className="btn btn-secondary btn-sm" style={{ width: 'auto', fontSize: '0.8rem' }}
                  onClick={() => fillFromDebt(d)}>
                  {d.from.name} → {d.to.name}: ${d.amount.toFixed(2)}
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Who paid?</label>
            <select className="form-input" value={fromId} onChange={e => setFromId(e.target.value)}>
              <option value="">Select...</option>
              {group.members?.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Paid to?</label>
            <select className="form-input" value={toId} onChange={e => setToId(e.target.value)}>
              <option value="">Select...</option>
              {group.members?.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Amount</label>
            <input className="form-input" type="number" step="0.01" min="0.01" placeholder="0.00"
              value={amount} onChange={e => setAmount(e.target.value)} />
          </div>

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? 'Saving...' : 'Record Settlement'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AddSettlement;