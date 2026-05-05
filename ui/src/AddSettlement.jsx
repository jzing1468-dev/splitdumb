import { useState, useMemo } from 'react';
import NumberInput from './NumberInput';

/**
 * Shared AddSettlement — pure React, receives data and callbacks as props.
 *
 * Props:
 *   - members: array of { id, name, color }
 *   - debts: array of { from: { id, name }, to: { id, name }, amount }
 *   - adapter: { addSettlement: async (data) => settlement }
 *   - onClose: () => void
 *   - onSaved: () => void
 */
function AddSettlement({ members, debts, adapter, onClose, onSaved }) {
  const [fromId, setFromId] = useState(debts[0]?.from?.id || '');
  const [toId, setToId] = useState(debts[0]?.to?.id || '');
  const [amount, setAmount] = useState(debts[0]?.amount?.toString() || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const maxAmount = useMemo(() => {
    if (!fromId || !toId) return 0;
    return debts.filter(d => d.from.id === fromId && d.to.id === toId)
      .reduce((sum, d) => sum + d.amount, 0);
  }, [fromId, toId, debts]);

  const handleFromChange = (fid) => {
    setFromId(fid);
    const owed = debts.filter(d => d.from.id === fid);
    if (owed.length > 0) { setToId(owed[0].to.id); setAmount(owed[0].amount.toString()); }
    else { setToId(''); setAmount(''); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!fromId || !toId) { setError('Select both parties'); return; }
    if (!amt || amt <= 0) { setError('Amount must be > $0'); return; }
    if (amt > maxAmount + 0.01) { setError(`Can't exceed $${maxAmount.toFixed(2)}`); return; }
    setSaving(true);
    try {
      await adapter.addSettlement({ from_id: fromId, to_id: toId, amount: amt });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const getMember = (id) => members?.find(m => m.id === id);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Record settlement</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {error && <div className="error" style={{ margin: '0 0 14px' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">From</label>
            <select className="form-input" value={fromId} onChange={e => handleFromChange(e.target.value)}>
              <option value="">Who paid?</option>
              {members?.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">To</label>
            <select className="form-input" value={toId} onChange={e => setToId(e.target.value)}>
              <option value="">Who received it?</option>
              {members?.filter(m => m.id !== fromId).map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Amount</label>
            <NumberInput step="0.01" min="0.01" placeholder="0.00"
              value={amount} onChange={e => setAmount(e.target.value)} />
            {maxAmount > 0 && (
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                Max: ${maxAmount.toFixed(2)}
              </div>
            )}
          </div>

          {fromId && toId && amount && (
            <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', padding: 12, marginBottom: 14 }}>
              <label className="form-label" style={{ fontSize: '0.72rem', marginBottom: 4 }}>Preview</label>
              <div style={{ fontSize: '0.85rem' }}>
                <strong>{getMember(fromId)?.name}</strong> paid <strong>{getMember(toId)?.name}</strong>{' '}
                <span style={{ fontWeight: 700 }}>${parseFloat(amount || 0).toFixed(2)}</span>
              </div>
            </div>
          )}

          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Record settlement'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AddSettlement;