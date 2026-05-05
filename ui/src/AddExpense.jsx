import { useState, useMemo, useEffect } from 'react';
import { CATEGORY_MAP } from '@splitdumb/core/categories';
import NumberInput from './NumberInput';

/**
 * Shared AddExpense — pure React, receives data and callbacks as props.
 *
 * Props:
 *   - members: array of { id, name, color }
 *   - expense: null for new, or expense object for editing
 *   - adapter: { addExpense: async (data) => expense, editExpense: async (id, data) => expense }
 *   - features: { attachments: bool, multiPayer: bool }
 *   - onClose: () => void
 *   - onSaved: () => void
 *   - AttachmentManager: React component (optional, for server app only)
 *   - attachmentProps: object (optional, passed to AttachmentManager)
 */
function AddExpense({ members, expense, adapter, features = {}, onClose, onSaved, AttachmentManager, attachmentProps }) {
  const isEditing = !!expense;
  const [description, setDescription] = useState(expense?.description || '');
  const [amount, setAmount] = useState(expense?.amount?.toString() || '');
  const [payerId, setPayerId] = useState(expense?.payer_id || expense?.payerId || members?.[0]?.id || '');
  const [splitType, setSplitType] = useState(expense?.split_type || expense?.splitType || 'equal');
  const [includePayer, setIncludePayer] = useState(() => {
    if (!expense) return true;
    const payerInSplits = expense.splits?.some(s => (s.member_id || s.memberId) === (expense.payer_id || expense.payerId));
    return payerInSplits !== false;
  });
  const [splitAmong, setSplitAmong] = useState(
    expense ? (expense.splits?.map(s => s.member_id || s.memberId) || []) : (members?.map(m => m.id) || [])
  );
  const [exactAmounts, setExactAmounts] = useState(
    expense && (expense.split_type === 'exact' || expense.splitType === 'exact')
      ? Object.fromEntries(expense.splits?.map(s => [s.member_id || s.memberId, s.share.toString()])) || {}
      : {}
  );
  const [percentages, setPercentages] = useState(
    expense && (expense.split_type === 'percentage' || expense.splitType === 'percentage')
      ? Object.fromEntries(expense.splits?.map(s => [s.member_id || s.memberId, ((s.share / expense.amount) * 100).toFixed(1)])) || {}
      : {}
  );
  const [sharesInput, setSharesInput] = useState(() => {
    if (expense && (expense.split_type === 'shares' || expense.splitType === 'shares')) {
      if (expense.shares_data) {
        try {
          const parsed = typeof expense.shares_data === 'string' ? JSON.parse(expense.shares_data) : expense.shares_data;
          return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)]));
        } catch {}
      }
      if (expense.sharesData) {
        return Object.fromEntries(Object.entries(expense.sharesData).map(([k, v]) => [k, String(v)]));
      }
      const shareAmounts = expense.splits?.map(s => s.share) || [];
      if (shareAmounts.length > 0) {
        const amounts = shareAmounts.map(a => Math.round(a * 100));
        const calcGcd = amounts.reduce((g, v) => {
          while (v) { [g, v] = [v, g % v]; }
          return g;
        });
        return Object.fromEntries(expense.splits.map((s, i) => [s.member_id || s.memberId, String(Math.round(amounts[i] / calcGcd))]));
      }
      return Object.fromEntries(expense.splits?.map(s => [s.member_id || s.memberId, '1']) || {});
    }
    return Object.fromEntries(members?.map(m => [m.id, '1']) || []);
  });

  // Nights state
  const storedMode = useMemo(() => {
    if (!expense || (expense.split_type !== 'nights' && expense.splitType !== 'nights')) return 'dates';
    if (expense.date_range_start || expense.dateRangeStart) return 'dates';
    const nd = expense.nights_data || expense.nightsData;
    if (nd) {
      try {
        const parsed = typeof nd === 'string' ? JSON.parse(nd) : nd;
        if (parsed._mode === 'count') return 'count';
      } catch {}
    }
    return 'dates';
  }, [expense]);

  const storedCalcMethod = useMemo(() => {
    if (!expense || (expense.split_type !== 'nights' && expense.splitType !== 'nights')) return 'proportional';
    const nd = expense.nights_data || expense.nightsData;
    if (nd) {
      try {
        const parsed = typeof nd === 'string' ? JSON.parse(nd) : nd;
        if (parsed._calc === 'daily') return 'daily';
      } catch {}
    }
    return 'proportional';
  }, [expense]);

  const [nightsMode, setNightsMode] = useState(storedMode);
  const [calcMethod, setCalcMethod] = useState(storedCalcMethod);
  const [dateRangeStart, setDateRangeStart] = useState(expense?.date_range_start || expense?.dateRangeStart || '');
  const [dateRangeEnd, setDateRangeEnd] = useState(expense?.date_range_end || expense?.dateRangeEnd || '');
  const [numNights, setNumNights] = useState(() => {
    if (!expense || (expense.split_type !== 'nights' && expense.splitType !== 'nights')) return '';
    if (expense.date_range_start || expense.dateRangeStart) return '';
    const nd = expense.nights_data || expense.nightsData;
    if (nd) {
      const parsed = typeof nd === 'string' ? JSON.parse(nd) : nd;
      return parsed._num_nights || '';
    }
    return '';
  });
  const [daysInput, setDaysInput] = useState(() => {
    if (expense && (expense.split_type === 'nights' || expense.splitType === 'nights')) {
      const nd = expense.nights_data || expense.nightsData;
      if (nd) {
        const parsed = typeof nd === 'string' ? JSON.parse(nd) : nd;
        const { _num_nights, _mode, _calc, ...clean } = parsed;
        return clean;
      }
    }
    return {};
  });
  const [date, setDate] = useState(expense?.date || new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState(expense?.category || '');
  const [notes, setNotes] = useState(expense?.notes || '');

  // Multi-payer state
  const [payers, setPayers] = useState(() => {
    if (expense && expense.payers_data) {
      try { return JSON.parse(expense.payers_data); } catch { return []; }
    }
    if (expense && expense.payersData) {
      return Array.isArray(expense.payersData) ? expense.payersData : [];
    }
    return [];
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploadingReceipts, setUploadingReceipts] = useState(false);

  // Track which expense ID we've synced to; only re-sync when it changes
  const [syncedExpenseId, setSyncedExpenseId] = useState(null);

  useEffect(() => {
    const currentId = expense?.id || null;
    if (currentId === syncedExpenseId) return;
    setSyncedExpenseId(currentId);

    if (!expense) {
      setDescription('');
      setAmount('');
      setPayerId(members?.[0]?.id || '');
      setSplitType('equal');
      setIncludePayer(true);
      setSplitAmong(members?.map(m => m.id) || []);
      setExactAmounts({});
      setPercentages({});
      setSharesInput(Object.fromEntries(members?.map(m => [m.id, '1']) || []));
      setNightsMode('dates');
      setCalcMethod('proportional');
      setDateRangeStart('');
      setDateRangeEnd('');
      setNumNights('');
      setDaysInput({});
      setDate(new Date().toISOString().split('T')[0]);
      setCategory('');
      setNotes('');
      setPayers([]);
      setPendingFiles([]);
      return;
    }

    // Editing: reset state from expense
    setDescription(expense.description || '');
    setAmount(expense.amount?.toString() || '');
    setPayerId(expense.payer_id || expense.payerId || members?.[0]?.id || '');
    setSplitType(expense.split_type || expense.splitType || 'equal');
    const payerInSplits = expense.splits?.some(s => (s.member_id || s.memberId) === (expense.payer_id || expense.payerId));
    setIncludePayer(payerInSplits !== false);
    setSplitAmong(expense.splits?.map(s => s.member_id || s.memberId) || []);

    const st = expense.split_type || expense.splitType;
    if (st === 'exact') {
      setExactAmounts(Object.fromEntries(expense.splits?.map(s => [s.member_id || s.memberId, s.share.toString()]) || []));
    } else {
      setExactAmounts({});
    }

    if (st === 'percentage') {
      setPercentages(Object.fromEntries(expense.splits?.map(s => [s.member_id || s.memberId, ((s.share / expense.amount) * 100).toFixed(1)]) || []));
    } else {
      setPercentages({});
    }

    if (st === 'shares') {
      if (expense.shares_data) {
        try {
          const parsed = typeof expense.shares_data === 'string' ? JSON.parse(expense.shares_data) : expense.shares_data;
          setSharesInput(Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)])));
        } catch {
          setSharesInput(Object.fromEntries(expense.splits?.map(s => [s.member_id || s.memberId, '1']) || []));
        }
      } else if (expense.sharesData) {
        setSharesInput(Object.fromEntries(Object.entries(expense.sharesData).map(([k, v]) => [k, String(v)])));
      } else {
        const shareAmounts = expense.splits?.map(s => s.share) || [];
        if (shareAmounts.length > 0) {
          const amounts = shareAmounts.map(a => Math.round(a * 100));
          const calcGcd = amounts.reduce((g, v) => {
            while (v) { [g, v] = [v, g % v]; }
            return g;
          });
          setSharesInput(Object.fromEntries(expense.splits.map((s, i) => [s.member_id || s.memberId, String(Math.round(amounts[i] / calcGcd))])));
        } else {
          setSharesInput(Object.fromEntries(expense.splits?.map(s => [s.member_id || s.memberId, '1']) || []));
        }
      }
    } else {
      setSharesInput(Object.fromEntries(members?.map(m => [m.id, '1']) || []));
    }

    if (st === 'nights') {
      const nd = expense.nights_data || expense.nightsData;
      if (nd) {
        try {
          const parsed = typeof nd === 'string' ? JSON.parse(nd) : nd;
          setNightsMode(parsed._mode === 'count' ? 'count' : 'dates');
          setCalcMethod(parsed._calc === 'daily' ? 'daily' : 'proportional');
          const { _num_nights, _mode, _calc, ...clean } = parsed;
          setDaysInput(clean);
          if (parsed._mode === 'count') {
            setNumNights(parsed._num_nights || '');
            setDateRangeStart('');
            setDateRangeEnd('');
          } else {
            setDateRangeStart(expense.date_range_start || expense.dateRangeStart || '');
            setDateRangeEnd(expense.date_range_end || expense.dateRangeEnd || '');
            setNumNights('');
          }
        } catch {
          setNightsMode('dates');
          setCalcMethod('proportional');
          setDaysInput({});
          setDateRangeStart(expense.date_range_start || expense.dateRangeStart || '');
          setDateRangeEnd(expense.date_range_end || expense.dateRangeEnd || '');
          setNumNights('');
        }
      } else {
        setNightsMode('dates');
        setCalcMethod('proportional');
        setDaysInput({});
        setDateRangeStart(expense.date_range_start || expense.dateRangeStart || '');
        setDateRangeEnd(expense.date_range_end || expense.dateRangeEnd || '');
        setNumNights('');
      }
    } else {
      setNightsMode('dates');
      setCalcMethod('proportional');
      setDaysInput({});
      setDateRangeStart('');
      setDateRangeEnd('');
      setNumNights('');
    }

    setDate(expense.date || new Date().toISOString().split('T')[0]);
    setCategory(expense.category || '');
    setNotes(expense.notes || '');
    if (expense.payers_data) {
      try { setPayers(JSON.parse(expense.payers_data)); } catch { setPayers([]); }
    } else if (expense.payersData) {
      setPayers(Array.isArray(expense.payersData) ? expense.payersData : []);
    } else {
      setPayers([]);
    }
    setPendingFiles([]);
  }, [expense?.id, members]);

  const effectiveSplitAmong = useMemo(() => {
    if (!includePayer && payerId) return splitAmong.filter(id => id !== payerId);
    return splitAmong;
  }, [splitAmong, includePayer, payerId]);

  const toggleMember = (id) => {
    setSplitAmong(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  };

  const dayLabels = useMemo(() => {
    if (nightsMode === 'count') {
      const n = parseInt(numNights) || 0;
      if (n <= 0) return [];
      return Array.from({ length: n }, (_, i) => `Night ${i + 1}`);
    }
    if (!dateRangeStart || !dateRangeEnd) return [];
    const start = new Date(dateRangeStart);
    const end = new Date(dateRangeEnd);
    const days = [];
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      days.push(d.toISOString().split('T')[0]);
    }
    return days;
  }, [nightsMode, numNights, dateRangeStart, dateRangeEnd]);

  const toggleDay = (member_id, day) => {
    setDaysInput(prev => {
      const current = prev[member_id] || [];
      const updated = current.includes(day) ? current.filter(n => n !== day) : [...current, day];
      return { ...prev, [member_id]: updated };
    });
  };

  const fmtDayLabel = (label) => {
    if (label.startsWith('Night ')) return label;
    const dt = new Date(label + 'T12:00:00');
    return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
  };

  const previewAndBreakdown = useMemo(() => {
    const numAmount = payers.length > 0
      ? payers.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
      : (parseFloat(amount) || 0);
    if (numAmount <= 0 || effectiveSplitAmong.length === 0) return { preview: {}, breakdown: null };

    if (splitType === 'equal') {
      const perPerson = Math.round((numAmount / effectiveSplitAmong.length) * 100) / 100;
      const total = Math.round(perPerson * effectiveSplitAmong.length * 100) / 100;
      const remainder = Math.round((numAmount - total) * 100) / 100;
      const result = {};
      effectiveSplitAmong.forEach((id, i) => {
        result[id] = perPerson + (i < Math.round(remainder * 100) ? 0.01 : 0);
      });
      return { preview: result, breakdown: null };
    }
    if (splitType === 'shares') {
      const totalShares = effectiveSplitAmong.reduce((sum, id) => sum + (parseFloat(sharesInput[id]) || 0), 0);
      if (totalShares <= 0) return { preview: {}, breakdown: null };
      const result = {};
      effectiveSplitAmong.forEach(id => {
        result[id] = Math.round((parseFloat(sharesInput[id]) / totalShares) * numAmount * 100) / 100;
      });
      return { preview: result, breakdown: null };
    }
    if (splitType === 'nights' && dayLabels.length > 0) {
      const occupiedDays = dayLabels.filter(day =>
        effectiveSplitAmong.some(id => (daysInput[id] || []).includes(day))
      ).length;
      if (occupiedDays === 0) return { preview: {}, breakdown: null };

      if (calcMethod === 'daily') {
        const perDayCost = numAmount / occupiedDays;
        const result = {};
        const dayDetail = [];
        dayLabels.forEach(day => {
          const present = effectiveSplitAmong.filter(id => (daysInput[id] || []).includes(day));
          if (present.length === 0) return;
          const sharePerPerson = perDayCost / present.length;
          const names = present.map(id => members?.find(m => m.id === id)?.name || id);
          dayDetail.push({ day, names, count: present.length, perDayCost, sharePerPerson });
          present.forEach(id => { result[id] = (result[id] || 0) + sharePerPerson; });
        });
        Object.keys(result).forEach(id => { result[id] = Math.round(result[id] * 100) / 100; });
        let allocated = Object.values(result).reduce((s, v) => s + v, 0);
        let rem = Math.round((numAmount - allocated) * 100);
        let roundingNote = null;
        if (rem !== 0) {
          const sorted = Object.entries(result).sort((a, b) => b[1] - a[1]);
          const dir = rem > 0 ? 1 : -1;
          roundingNote = { amount: rem * 0.01, direction: dir > 0 ? 'added to' : 'subtracted from', recipient: members?.find(m => m.id === sorted[0][0])?.name || 'unknown' };
          for (let i = 0; i < Math.abs(rem) && i < sorted.length; i++) result[sorted[i][0]] = Math.round((result[sorted[i][0]] + dir * 0.01) * 100) / 100;
        }
        return { preview: result, breakdown: { method: 'daily', occupiedDayCount: occupiedDays, totalDays: dayLabels.length, perDayCost, dayDetail, roundingNote } };
      }

      // proportional
      const totalOccupiedPersonDays = dayLabels.reduce((sum, day) => {
        return sum + effectiveSplitAmong.filter(id => (daysInput[id] || []).includes(day)).length;
      }, 0);
      if (totalOccupiedPersonDays === 0) return { preview: {}, breakdown: null };
      const perOccupiedDay = numAmount / totalOccupiedPersonDays;
      const result = {};
      const personDetail = [];
      effectiveSplitAmong.forEach(id => {
        const personDays = (daysInput[id] || []).filter(d => dayLabels.includes(d)).length;
        const raw = personDays * perOccupiedDay;
        const rounded = Math.round(raw * 100) / 100;
        result[id] = rounded;
        personDetail.push({ id, name: members?.find(m => m.id === id)?.name || id, days: personDays, rate: perOccupiedDay, rounded });
      });
      let allocated = Object.values(result).reduce((s, v) => s + v, 0);
      let rem = Math.round((numAmount - allocated) * 100);
      let roundingNote = null;
      if (rem !== 0) {
        const sorted = effectiveSplitAmong.map(id => [id, (daysInput[id] || []).length]).sort((a, b) => b[1] - a[1]);
        const dir = rem > 0 ? 1 : -1;
        roundingNote = { amount: rem * 0.01, direction: dir > 0 ? 'added to' : 'subtracted from', recipient: members?.find(m => m.id === sorted[0][0])?.name || 'unknown' };
        for (let i = 0; i < Math.abs(rem) && i < sorted.length; i++) result[sorted[i][0]] = Math.round((result[sorted[i][0]] + dir * 0.01) * 100) / 100;
      }
      return { preview: result, breakdown: { method: 'proportional', totalPersonDays: totalOccupiedPersonDays, perOccupiedDay, personDetail, roundingNote } };
    }
    if (splitType === 'exact') {
      const result = {};
      effectiveSplitAmong.forEach(id => { result[id] = parseFloat(exactAmounts[id]) || 0; });
      return { preview: result, breakdown: null };
    }
    if (splitType === 'percentage') {
      const result = {};
      effectiveSplitAmong.forEach(id => {
        result[id] = Math.round(numAmount * (parseFloat(percentages[id]) || 0) / 100 * 100) / 100;
      });
      return { preview: result, breakdown: null };
    }

    return { preview: {}, breakdown: null };
  }, [amount, splitType, effectiveSplitAmong, sharesInput, exactAmounts, percentages, daysInput, dayLabels, calcMethod, members, payers]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    let numAmount = parseFloat(amount);
    if (payers.length > 0) {
      numAmount = payers.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    }
    if (!numAmount || numAmount <= 0) { setError('Amount must be greater than $0'); return; }
    if (!description.trim()) { setError('Description is required'); return; }
    if (!payerId) { setError('Select who paid'); return; }
    if (effectiveSplitAmong.length === 0) { setError('At least one person must be in the split'); return; }
    if (splitType === 'exact') {
      const total = effectiveSplitAmong.reduce((sum, id) => sum + (parseFloat(exactAmounts[id]) || 0), 0);
      if (Math.abs(total - numAmount) > 0.01) { setError(`Amounts must equal total ($${numAmount.toFixed(2)}). Current: $${total.toFixed(2)}`); return; }
    }
    if (splitType === 'percentage') {
      const total = effectiveSplitAmong.reduce((sum, id) => sum + (parseFloat(percentages[id]) || 0), 0);
      if (Math.abs(total - 100) > 0.01) { setError(`Percentages must total 100%. Current: ${total.toFixed(1)}%`); return; }
    }
    if (splitType === 'shares') {
      if (effectiveSplitAmong.reduce((sum, id) => sum + (parseFloat(sharesInput[id]) || 0), 0) <= 0) { setError('Total shares must be > 0'); return; }
    }
    if (splitType === 'nights') {
      if (nightsMode === 'dates' && (!dateRangeStart || !dateRangeEnd)) { setError('Select a date range'); return; }
      if (nightsMode === 'count' && (!numNights || parseInt(numNights) <= 0)) { setError('Enter number of nights'); return; }
      if (!effectiveSplitAmong.some(id => (daysInput[id] || []).length > 0)) { setError('Select which days each person was present'); return; }
    }
    if (payers.length > 0) {
      const payerTotal = payers.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
      if (Math.abs(payerTotal - numAmount) > 0.01) { setError(`Payer amounts must sum to $${numAmount.toFixed(2)}. Current total: $${payerTotal.toFixed(2)}`); return; }
      if (payers.some(p => !p.amount || parseFloat(p.amount) <= 0)) { setError('Each payer must have an amount > $0'); return; }
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
    if (splitType === 'shares') payload.shares = Object.fromEntries(effectiveSplitAmong.map(id => [id, parseFloat(sharesInput[id]) || 1]));
    if (splitType === 'nights') {
      payload.nights = daysInput;
      payload.nights_mode = nightsMode;
      payload.calc_method = calcMethod;
      if (nightsMode === 'dates') { payload.date_range_start = dateRangeStart; payload.date_range_end = dateRangeEnd; }
      if (nightsMode === 'count') { payload.num_nights = parseInt(numNights) || 0; }
    }
    if (category !== undefined && category !== '') payload.category = category;
    if (notes.trim() !== '') payload.notes = notes.trim();
    if (payers.length > 0) payload.payers = payers;

    setLoading(true);
    try {
      if (isEditing) {
        await adapter.editExpense(expense.id, payload);
        onSaved();
      } else {
        const newExpense = await adapter.addExpense(payload);
        // Deferred upload of pending files (server app only)
        if (features.attachments && pendingFiles.length > 0 && newExpense?.id && adapter.uploadAttachment) {
          setUploadingReceipts(true);
          for (const file of pendingFiles) {
            try { await adapter.uploadAttachment(newExpense.id, file); }
            catch (uerr) { console.error('Attachment upload failed:', uerr); }
          }
          setUploadingReceipts(false);
        }
        onSaved();
      }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const toggleAll = () => {
    setSplitAmong(splitAmong.length === members.length ? [] : members.map(m => m.id));
  };

  const splitTypes = [
    { key: 'equal', label: 'Equal' },
    { key: 'shares', label: 'Shares' },
    { key: 'nights', label: 'Per Day' },
    { key: 'exact', label: 'Exact' },
    { key: 'percentage', label: '%' },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{isEditing ? 'Edit Expense' : 'Add Expense'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {error && <div className="error" style={{ margin: '0 0 14px' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Description</label>
            <input className="form-input" placeholder="e.g. Airbnb, dinner, gas" value={description}
              onChange={e => setDescription(e.target.value)} maxLength={100} autoFocus />
          </div>

          <div className="form-group">
            <label className="form-label">Amount{payers.length > 0 ? ' (sum of payers)' : ''}</label>
            {payers.length > 0 ? (
              <div className="form-input" style={{ opacity: 0.7, cursor: 'default' }}>
                ${(payers.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)).toFixed(2)}
              </div>
            ) : (
              <NumberInput step="0.01" min="0.01" placeholder="0.00"
                value={amount} onChange={e => setAmount(e.target.value)} />
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Who paid?</label>
            {payers.length === 0 ? (
              <select className="form-input" value={payerId} onChange={e => setPayerId(e.target.value)}>
                <option value="">Select...</option>
                {members?.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            ) : (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Single payer hidden — split payment active</div>
            )}
          </div>

          {features.multiPayer && (
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="splitPayer" checked={payers.length > 0} onChange={e => {
                if (e.target.checked) {
                  setPayers([{ member_id: payerId || members?.[0]?.id, amount: amount || '' }]);
                } else {
                  setPayers([]);
                }
              }} />
              <label htmlFor="splitPayer" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>Split payment (multiple payers)</label>
            </div>
          )}

          {features.multiPayer && payers.length > 0 && (
            <div className="form-group">
              <label className="form-label">Payers</label>
              {payers.map((p, idx) => {
                const m = members?.find(m => m.id === p.member_id);
                return (
                  <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <span className="member-dot" style={{ background: m?.color }} />
                    <select className="form-input" value={p.member_id} style={{ flex: 1 }}
                      onChange={e => setPayers(prev => prev.map((pp, i) => i === idx ? { ...pp, member_id: e.target.value } : pp))}>
                      {members?.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                    <NumberInput step="0.01" min="0.01" style={{ width: 100 }}
                      value={p.amount?.toString() || ''}
                      onChange={e => setPayers(prev => prev.map((pp, i) => i === idx ? { ...pp, amount: e.target.value } : pp))} />
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => setPayers(prev => prev.filter((_, i) => i !== idx))} title="Remove">✕</button>
                  </div>
                );
              })}
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setPayers(prev => [...prev, { member_id: members?.[0]?.id, amount: '' }])}>
                + Add payer
              </button>
              {payers.length > 0 && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 6 }}>
                  Paid total: ${payers.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0).toFixed(2)}
                </div>
              )}
            </div>
          )}

          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="includePayer" checked={includePayer} onChange={e => setIncludePayer(e.target.checked)} />
            <label htmlFor="includePayer" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>Include payer in split</label>
          </div>

          <div className="form-group">
            <label className="form-label">Split type</label>
            <div className="split-type-toggle">
              {splitTypes.map(st => (
                <button key={st.key} type="button" className={`split-type-btn ${splitType === st.key ? 'active' : ''}`}
                  onClick={() => setSplitType(st.key)}>{st.label}</button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <label className="form-label" style={{ marginBottom: 0 }}>Split among</label>
              <button type="button" className="btn btn-ghost btn-xs" onClick={toggleAll}>
                {splitAmong.length === members.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div className="member-chips">
              {members?.map(m => {
                const excluded = !includePayer && m.id === payerId;
                return (
                  <span key={m.id} className={`member-chip ${splitAmong.includes(m.id) ? 'selected' : ''}`}
                    style={{
                      background: splitAmong.includes(m.id) && !excluded ? m.color + '20' : 'var(--surface2)',
                      borderColor: splitAmong.includes(m.id) && !excluded ? m.color : 'transparent',
                      opacity: excluded ? 0.35 : 1,
                      cursor: excluded ? 'not-allowed' : 'pointer',
                    }}
                    onClick={() => !excluded && toggleMember(m.id)}>
                    <span className="member-dot" style={{ background: m.color }} />
                    {m.name}{!includePayer && m.id === payerId && <span style={{ fontSize: '0.65rem', opacity: 0.5, marginLeft: 2 }}>(payer)</span>}
                  </span>
                );
              })}
            </div>
          </div>

          {splitType === 'shares' && effectiveSplitAmong.map(id => {
            const m = members?.find(m => m.id === id);
            return (
              <div key={id} className="share-section">
                <span className="member-dot" style={{ background: m?.color }} />
                <span style={{ flex: 1, fontWeight: 500 }}>{m?.name}</span>
                <NumberInput step="1" min="1" style={{ width: 120 }}
                  value={sharesInput[id] || '1'}
                  onChange={e => setSharesInput(prev => ({ ...prev, [id]: e.target.value }))} />
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>share{parseFloat(sharesInput[id]) !== 1 ? 's' : ''}</span>
              </div>
            );
          })}

          {splitType === 'nights' && (
            <>
              <div className="form-group">
                <label className="form-label">Mode</label>
                <div className="split-type-toggle">
                  <button type="button" className={`split-type-btn ${nightsMode === 'dates' ? 'active' : ''}`}
                    onClick={() => setNightsMode('dates')}>📅 Date range</button>
                  <button type="button" className={`split-type-btn ${nightsMode === 'count' ? 'active' : ''}`}
                    onClick={() => setNightsMode('count')}>🔢 Count</button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Calculation</label>
                <div className="split-type-toggle">
                  <button type="button" className={`split-type-btn ${calcMethod === 'proportional' ? 'active' : ''}`}
                    onClick={() => setCalcMethod('proportional')}>Proportional</button>
                  <button type="button" className={`split-type-btn ${calcMethod === 'daily' ? 'active' : ''}`}
                    onClick={() => setCalcMethod('daily')}>Daily Split</button>
                </div>
              </div>

              {nightsMode === 'dates' && (
                <div className="form-group">
                  <label className="form-label">Date range</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="form-input" type="date" value={dateRangeStart} onChange={e => setDateRangeStart(e.target.value)} />
                    <span style={{ alignSelf: 'center', color: 'var(--text-muted)' }}>→</span>
                    <input className="form-input" type="date" value={dateRangeEnd} onChange={e => setDateRangeEnd(e.target.value)} />
                  </div>
                </div>
              )}

              {nightsMode === 'count' && (
                <div className="form-group">
                  <label className="form-label">Number of nights</label>
                  <NumberInput step="1" min="1" max="90" placeholder="e.g. 5" value={numNights} onChange={e => setNumNights(e.target.value)} />
                </div>
              )}

              {dayLabels.length > 0 && (
                <div className="form-group">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>Who was there each day?</label>
                    <button type="button" className="btn btn-ghost btn-xs"
                      onClick={() => setDaysInput(Object.fromEntries(effectiveSplitAmong.map(id => [id, [...dayLabels]])))}>Fill all</button>
                    <button type="button" className="btn btn-ghost btn-xs"
                      onClick={() => setDaysInput({})}>Clear</button>
                  </div>
                  <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border)' }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.76rem' }}>
                      <thead>
                        <tr style={{ background: 'var(--surface2)' }}>
                          <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600 }} />
                          {dayLabels.map(d => (
                            <th key={d} style={{ padding: '4px 3px', textAlign: 'center', fontSize: '0.6rem', writingMode: 'vertical-rl', fontWeight: 500, color: 'var(--text-dim)', width: 26 }}>
                              {fmtDayLabel(d)}
                            </th>
                          ))}
                          <th style={{ padding: '4px 8px', textAlign: 'center', fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-dim)' }}>Days</th>
                        </tr>
                      </thead>
                      <tbody>
                        {effectiveSplitAmong.map(id => {
                          const m = members?.find(m => m.id === id);
                          const present = daysInput[id] || [];
                          const count = present.filter(d => dayLabels.includes(d)).length;
                          return (
                            <tr key={id} style={{ borderTop: '1px solid var(--border)' }}>
                              <td style={{ padding: '4px 10px', whiteSpace: 'nowrap', fontWeight: 500 }}>
                                <span className="member-dot" style={{ background: m?.color, display: 'inline-block', marginRight: 6 }} />{m?.name}
                              </td>
                              {dayLabels.map(d => (
                                <td key={d} style={{ padding: '2px', textAlign: 'center' }}>
                                  <input type="checkbox" checked={present.includes(d)} onChange={() => toggleDay(id, d)}
                                    style={{ width: 15, height: 15, accentColor: m?.color, cursor: 'pointer' }} />
                                </td>
                              ))}
                              <td style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 700, fontSize: '0.78rem', color: count > 0 ? m?.color : 'var(--text-muted)' }}>
                                {count}
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

          {splitType === 'exact' && effectiveSplitAmong.map(id => {
            const m = members?.find(m => m.id === id);
            return (
              <div key={id} className="share-section">
                <span className="member-dot" style={{ background: m?.color }} />
                <span style={{ flex: 1, fontWeight: 500 }}>{m?.name}</span>
                <NumberInput step="0.01" min="0" placeholder="0.00" style={{ width: 130 }}
                  value={exactAmounts[id] || ''}
                  onChange={e => setExactAmounts(prev => ({ ...prev, [id]: parseFloat(e.target.value) || 0 }))} />
              </div>
            );
          })}

          {splitType === 'percentage' && effectiveSplitAmong.map(id => {
            const m = members?.find(m => m.id === id);
            return (
              <div key={id} className="share-section">
                <span className="member-dot" style={{ background: m?.color }} />
                <span style={{ flex: 1, fontWeight: 500 }}>{m?.name}</span>
                <NumberInput step="0.1" min="0" max="100" placeholder="0" style={{ width: 120 }}
                  value={percentages[id] || ''}
                  onChange={e => setPercentages(prev => ({ ...prev, [id]: parseFloat(e.target.value) || 0 }))} />
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginLeft: 4 }}>%</span>
              </div>
            );
          })}

          {Object.keys(previewAndBreakdown.preview).length > 0 && (
            <>
              <div className="form-group" style={{ background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', padding: 12, marginTop: 4 }}>
                <label className="form-label" style={{ fontSize: '0.72rem', marginBottom: 4 }}>Split preview</label>
                {effectiveSplitAmong.map(id => {
                  const m = members?.find(m => m.id === id);
                  const share = previewAndBreakdown.preview[id];
                  if (share === undefined) return null;
                  const pDays = splitType === 'nights' ? (daysInput[id] || []).filter(d => dayLabels.includes(d)).length : null;
                  return (
                    <div key={id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', padding: '2px 0' }}>
                      <span>
                        <span className="member-dot" style={{ background: m?.color }} /> {m?.name}
                        {pDays != null && pDays > 0 && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 4 }}>({pDays}d)</span>}
                      </span>
                      <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>${share.toFixed(2)}</span>
                    </div>
                  );
                })}
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '0.84rem' }}>
                  <span>Total</span>
                  <span>${Object.values(previewAndBreakdown.preview).reduce((s, v) => s + v, 0).toFixed(2)}</span>
                </div>
              </div>

              {previewAndBreakdown.breakdown && (
                <div className="breakdown">
                  <div className="breakdown-title">
                    {previewAndBreakdown.breakdown.method === 'daily' ? '🧮 Daily Split' : '🧮 Proportional'}
                  </div>
                  {previewAndBreakdown.breakdown.method === 'daily' && (() => {
                    const b = previewAndBreakdown.breakdown;
                    return <>
                      <div className="breakdown-summary">
                        {b.occupiedDayCount} occupied day{b.occupiedDayCount !== 1 ? 's' : ''} of {b.totalDays}
                        {' · '}<strong style={{ color: 'var(--text)' }}>${parseFloat(amount).toFixed(2)} ÷ {b.occupiedDayCount} = ${b.perDayCost.toFixed(2)}/day</strong>
                      </div>
                      {b.dayDetail.map(dd => (
                        <div key={dd.day} className="breakdown-line">
                          <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{fmtDayLabel(dd.day)}</strong>: {dd.names.join(', ')}
                          {' — '}<span style={{ color: 'var(--text)' }}>${dd.perDayCost.toFixed(2)} ÷ {dd.count} = ${dd.sharePerPerson.toFixed(2)} each</span>
                        </div>
                      ))}
                      {b.roundingNote && <div className="breakdown-note">⚡ ${Math.abs(b.roundingNote.amount).toFixed(2)} {b.roundingNote.direction} {b.roundingNote.recipient} (rounding)</div>}
                    </>;
                  })()}
                  {previewAndBreakdown.breakdown.method === 'proportional' && (() => {
                    const b = previewAndBreakdown.breakdown;
                    return <>
                      <div className="breakdown-summary">
                        {b.totalPersonDays} person-days
                        {' · '}<strong style={{ color: 'var(--text)' }}>${parseFloat(amount).toFixed(2)} ÷ {b.totalPersonDays} = ${b.perOccupiedDay.toFixed(2)}/day</strong>
                      </div>
                      {b.personDetail.map(pd => (
                        <div key={pd.id} className="breakdown-line">
                          <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{pd.name}</strong>: {pd.days}d × ${pd.rate.toFixed(2)} = <strong style={{ color: 'var(--text)' }}>${pd.rounded.toFixed(2)}</strong>
                        </div>
                      ))}
                      {b.roundingNote && <div className="breakdown-note">⚡ ${Math.abs(b.roundingNote.amount).toFixed(2)} {b.roundingNote.direction} {b.roundingNote.recipient} (rounding)</div>}
                    </>;
                  })()}
                </div>
              )}
            </>
          )}

          <div className="form-group">
            <label className="form-label">Category <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
            <div className="member-chips">
              {Object.entries(CATEGORY_MAP).map(([key, cat]) => (
                <span key={key}
                  className={`member-chip ${category === key ? 'selected' : ''}`}
                  style={{
                    background: category === key ? cat.color + '22' : 'var(--surface2)',
                    borderColor: category === key ? cat.color + '60' : 'transparent',
                    cursor: 'pointer',
                    opacity: category && category !== key ? 0.5 : 1,
                  }}
                  onClick={() => setCategory(category === key ? '' : key)}>
                  {cat.label}
                </span>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Notes <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
            <textarea className="form-input" placeholder="e.g. included tip, bought at Costco" value={notes}
              onChange={e => setNotes(e.target.value)} maxLength={500} rows={2}
              style={{ resize: 'vertical', minHeight: 44 }} />
          </div>

          {/* Attachments — server app only */}
          {features.attachments && AttachmentManager && isEditing && (
            <div className="form-group">
              <label className="form-label">Attachments</label>
              <AttachmentManager {...attachmentProps} />
            </div>
          )}

          {features.attachments && !isEditing && (
            <div className="form-group">
              <label className="form-label">Attachments <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
              {pendingFiles.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  {pendingFiles.map((file, i) => (
                    <div key={i} style={{ position: 'relative', width: 72, height: 72 }}>
                      {file.type.startsWith('image/') ? (
                        <img src={URL.createObjectURL(file)} alt={file.name}
                          style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }} />
                      ) : (
                        <div style={{ width: 72, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                          fontSize: '1.5rem', color: 'var(--text-muted)' }}>
                          📄
                        </div>
                      )}
                      <button type="button" onClick={() => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))}
                        style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: '50%',
                          background: 'var(--red)', color: '#fff', border: 'none', fontSize: '0.65rem',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Remove">✕</button>
                      <div style={{ fontSize: '0.55rem', textAlign: 'center', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file.name}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <label style={{ cursor: 'pointer', display: 'inline-block' }}>
                <span className="btn btn-ghost btn-xs">{uploadingReceipts ? 'Uploading...' : '+ Attach files'}</span>
                <input type="file" accept="image/*,.pdf" onChange={e => {
                  const file = e.target.files[0];
                  if (file) setPendingFiles(prev => [...prev, file]);
                  e.target.value = '';
                }} style={{ display: 'none' }} disabled={uploadingReceipts} />
              </label>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Date</label>
            <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
            {loading ? 'Saving...' : isEditing ? 'Update Expense' : 'Add Expense'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AddExpense;