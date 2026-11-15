/**
 * TravelPlansView — manual arrivals & departures board (Release 2).
 * One optional plan per member (PUT .../travel-plans/:memberId, create-or-update).
 *
 * Chronological arrival list (plans without a time last, never falsely sorted
 * as midnight), pickup flags and manually reported status; members without a
 * plan appear under 'Not shared yet' with an Add action. Datetimes are LOCAL
 * wall-clock 'YYYY-MM-DDTHH:mm' or date-only strings, displayed as typed.
 * A 409 shows an inline notice with Load latest (notes pattern).
 *
 * Props:
 *   - info: { travel_plans, ... }, members, adapter, onInfoPatch, onRefreshInfo, askConfirm
 *     adapter: { saveTravelPlan(memberId, data), deleteTravelPlan(memberId) }
 */
import { useState } from 'react';
import { fmtWallDateTime, fmtNoteDate } from './dateFormat';

const STATUS_LABELS = { planned: 'Planned', on_the_way: 'On the way', arrived: 'Arrived' };

const formOfPlan = (plan) => ({
  arrival_at: plan?.arrival_at || '',
  arrival_place: plan?.arrival_place || '',
  arrival_detail: plan?.arrival_detail || '',
  departure_at: plan?.departure_at || '',
  departure_place: plan?.departure_place || '',
  pickup_requested: Boolean(plan?.pickup_requested),
  pickup_by: plan?.pickup_by || '',
  status: plan?.status || '',
  notes: plan?.notes || '',
});

const nullifyEmpties = (form) => {
  const out = {};
  for (const [k, v] of Object.entries(form)) {
    if (v === '') out[k] = null;
    else if (v === undefined) out[k] = null;
    else out[k] = v;
  }
  return out;
};

/** Sort by arrival time string (lexicographic works for local ISO-ish forms); untimed last. */
function byArrival(a, b) {
  const av = a.arrival_at || '';
  const bv = b.arrival_at || '';
  if (!av && !bv) return String(a.member_id) < String(b.member_id) ? -1 : 1;
  if (!av) return 1;
  if (!bv) return -1;
  return av < bv ? -1 : av > bv ? 1 : 0;
}

function StatusBadge({ status }) {
  const cls = status === 'arrived' ? 'arrived' : status === 'on_the_way' ? 'moving' : 'planned';
  return <span className={`ns-status ns-status-${cls}`}>{STATUS_LABELS[status] || status}</span>;
}

function PlanForm({ form, setForm, members, saving, error, conflict, onSave, onLoadLatest, onCancel, onDelete, isExisting }) {
  const set = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.value }));
  return (
    <div className="ns-edit-form">
      {conflict && (
        <div className="ns-conflict" role="alert">
          This plan was updated by someone else since you started.
          <div className="ns-conflict-actions">
            <button type="button" className="btn btn-ghost btn-xs" onClick={onLoadLatest}>Load latest</button>
          </div>
        </div>
      )}
      {error && <div className="error" role="alert">{error}</div>}
      <div className="ns-form-grid">
        <div>
          <label className="ns-field-label" htmlFor="ns-plan-arrival">Arrival</label>
          <input id="ns-plan-arrival" className="form-input" type="datetime-local" value={form.arrival_at} onChange={set('arrival_at')} />
        </div>
        <div>
          <label className="ns-field-label" htmlFor="ns-plan-departure">Departure</label>
          <input id="ns-plan-departure" className="form-input" type="datetime-local" value={form.departure_at} onChange={set('departure_at')} />
        </div>
      </div>
      <label className="ns-field-label" htmlFor="ns-plan-arrival-place">Arrival place</label>
      <input id="ns-plan-arrival-place" className="form-input" type="text" maxLength={200}
        placeholder="e.g. Airport (JFK), Terminal 4" value={form.arrival_place} onChange={set('arrival_place')} />
      <label className="ns-field-label" htmlFor="ns-plan-arrival-detail">Arrival details</label>
      <input id="ns-plan-arrival-detail" className="form-input" type="text" maxLength={300}
        placeholder="Flight number, transport…" value={form.arrival_detail} onChange={set('arrival_detail')} />
      <label className="ns-field-label" htmlFor="ns-plan-departure-place">Departure place</label>
      <input id="ns-plan-departure-place" className="form-input" type="text" maxLength={200}
        placeholder="e.g. Airport (JFK)" value={form.departure_place} onChange={set('departure_place')} />
      <label className="ns-check">
        <input type="checkbox" checked={form.pickup_requested}
          onChange={e => setForm(prev => ({ ...prev, pickup_requested: e.target.checked }))} />
        Needs pickup
      </label>
      <div className="ns-form-grid">
        <div>
          <label className="ns-field-label" htmlFor="ns-plan-pickup-by">Pickup by</label>
          <select id="ns-plan-pickup-by" className="form-input" value={form.pickup_by} onChange={set('pickup_by')}>
            <option value="">—</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label className="ns-field-label" htmlFor="ns-plan-status">Status</label>
          <select id="ns-plan-status" className="form-input" value={form.status} onChange={set('status')}>
            <option value="">— not shared —</option>
            <option value="planned">Planned</option>
            <option value="on_the_way">On the way</option>
            <option value="arrived">Arrived</option>
          </select>
        </div>
      </div>
      <label className="ns-field-label" htmlFor="ns-plan-notes">Notes</label>
      <textarea id="ns-plan-notes" className="form-input ns-body-input" maxLength={2000} rows={2}
        placeholder="Anything else about the trip…" value={form.notes} onChange={set('notes')} />
      <div className="ns-sticky-actions">
        <span className="ns-sticky-status" aria-live="polite">{saving ? 'Saving…' : ''}</span>
        <button type="button" className="btn btn-ghost btn-xs" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary btn-xs" disabled={saving} onClick={onSave}>
          {saving ? 'Saving…' : 'Save plan'}
        </button>
      </div>
      {isExisting && (
        <div className="ns-form-danger">
          <button type="button" className="btn btn-danger-outline btn-xs" onClick={onDelete}>🗑 Delete plan</button>
        </div>
      )}
    </div>
  );
}

function TravelPlansView({ info, members = [], adapter, onInfoPatch, onRefreshInfo, askConfirm }) {
  const plans = info?.travel_plans || [];
  const [editingId, setEditingId] = useState(null); // member id being edited
  const [form, setForm] = useState(null);
  const [base, setBase] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(null); // server plan from a 409

  const planByMember = (mid) => plans.find(p => String(p.member_id) === String(mid)) || null;
  const memberById = (mid) => members.find(m => String(m.id) === String(mid)) || null;

  const startEdit = (memberId) => {
    const plan = planByMember(memberId);
    setEditingId(String(memberId));
    setForm(formOfPlan(plan));
    setBase(formOfPlan(plan));
    setError('');
    setConflict(null);
  };
  const exitEdit = () => { setEditingId(null); setForm(null); setBase(null); setError(''); setConflict(null); };

  const isDirty = form && base && Object.keys(base).some(k => form[k] !== base[k]);

  const cancelEdit = () => {
    if (isDirty) {
      askConfirm('Discard changes?', 'Your unsaved plan edits will be lost.', () => exitEdit(), 'Discard');
      return;
    }
    exitEdit();
  };

  const save = async () => {
    if (!adapter?.saveTravelPlan || editingId == null) return;
    setSaving(true);
    setError('');
    try {
      const plan = planByMember(editingId);
      const saved = await adapter.saveTravelPlan(editingId, {
        ...nullifyEmpties(form),
        expected_revision: plan?.revision ?? null,
      });
      onInfoPatch(prev => {
        const list = (prev?.travel_plans || []).slice();
        const i = list.findIndex(p => String(p.member_id) === String(saved.member_id));
        if (i >= 0) list[i] = saved; else list.push(saved);
        return { ...(prev || {}), travel_plans: list };
      });
      exitEdit();
      onRefreshInfo?.();
    } catch (err) {
      if (err?.status === 409 && err.body?.plan) {
        setConflict(err.body.plan);
      } else {
        setError(err?.message || 'Save failed');
      }
    } finally {
      setSaving(false);
    }
  };

  const loadLatest = () => {
    if (!conflict) return;
    const next = formOfPlan(conflict);
    setForm(next);
    setBase(next);
    onInfoPatch(prev => {
      const list = (prev?.travel_plans || []).map(p => String(p.member_id) === String(conflict.member_id) ? conflict : p);
      return { ...(prev || {}), travel_plans: list };
    });
    setConflict(null);
    setError('');
  };

  const askDeletePlan = () => {
    const member = memberById(editingId);
    askConfirm(
      'Delete travel plan',
      `Delete ${member?.name || 'this member'}'s travel plan? This cannot be undone.`,
      async () => {
        if (!adapter?.deleteTravelPlan || editingId == null) return;
        try {
          await adapter.deleteTravelPlan(editingId);
          onInfoPatch(prev => ({
            ...(prev || {}),
            travel_plans: (prev?.travel_plans || []).filter(p => String(p.member_id) !== String(editingId)),
          }));
          exitEdit();
          onRefreshInfo?.();
        } catch (err) {
          setError(err?.message || 'Delete failed');
        }
      },
      '🗑 Delete plan',
    );
  };

  const sorted = plans.slice().sort(byArrival);
  const planMemberIds = new Set(plans.map(p => String(p.member_id)));
  const missing = (Array.isArray(members) ? members : []).filter(m => !planMemberIds.has(String(m.id)));

  if (editingId != null && form) {
    const member = memberById(editingId);
    return (
      <div className="ns-travel">
        <div className="ns-travel-editing-label">
          Travel plan for <strong>{member?.name || plans.find(p => String(p.member_id) === editingId)?.member_name || 'member'}</strong>
        </div>
        <PlanForm
          form={form} setForm={setForm} members={members}
          saving={saving} error={error} conflict={conflict}
          onSave={save} onLoadLatest={loadLatest} onCancel={cancelEdit}
          onDelete={askDeletePlan} isExisting={Boolean(planByMember(editingId))} />
      </div>
    );
  }

  return (
    <div className="ns-travel">
      {error && <div className="error" role="alert">{error}</div>}
      {sorted.length === 0 ? (
        <div className="empty-state">
          <span className="icon" style={{ color: 'var(--text-muted)' }}>🛬</span>
          <p>No travel plans shared yet</p>
          <p style={{ fontSize: '0.82rem' }}>Add arrival and departure times so the group can coordinate pickups</p>
        </div>
      ) : (
        <>
          <div className="ns-section-label">Arrivals &amp; departures</div>
          {sorted.map(p => {
            const member = memberById(p.member_id);
            const name = p.member_name || member?.name || '?';
            const color = member?.color || '#999';
            return (
              <div key={p.member_id} className="ns-travel-row">
                <span className="member-dot" style={{ background: color }} aria-hidden="true" />
                <div className="ns-travel-main">
                  <div className="ns-travel-name">{name}</div>
                  {p.arrival_at && (
                    <div className="ns-travel-line">
                      <span className="ns-travel-k">Arrives</span> {fmtWallDateTime(p.arrival_at)}
                      {p.arrival_place && <span> · {p.arrival_place}</span>}
                      {p.arrival_detail && <span className="ns-travel-dim"> ({p.arrival_detail})</span>}
                    </div>
                  )}
                  {p.departure_at && (
                    <div className="ns-travel-line">
                      <span className="ns-travel-k">Departs</span> {fmtWallDateTime(p.departure_at)}
                      {p.departure_place && <span> · {p.departure_place}</span>}
                    </div>
                  )}
                  {!p.arrival_at && !p.departure_at && (
                    <div className="ns-travel-line ns-travel-dim">No times shared yet</div>
                  )}
                  {p.pickup_requested && (
                    <div className="ns-travel-pickup">🚗 Needs pickup{p.pickup_by_name ? ` · ${p.pickup_by_name}` : p.pickup_by ? ` · ${memberById(p.pickup_by)?.name || 'someone'}` : ''}</div>
                  )}
                  <div className="ns-travel-meta">
                    {p.status ? <StatusBadge status={p.status} /> : null}
                    {p.updated_at && <span>Updated {fmtNoteDate(p.updated_at)}</span>}
                  </div>
                </div>
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => startEdit(p.member_id)}>✏️ Edit</button>
              </div>
            );
          })}
        </>
      )}
      {missing.length > 0 && (
        <>
          <div className="ns-section-label">Not shared yet</div>
          {missing.map(m => (
            <div key={m.id} className="ns-travel-row">
              <span className="member-dot" style={{ background: m.color || '#999' }} aria-hidden="true" />
              <div className="ns-travel-main">
                <div className="ns-travel-name">{m.name}</div>
                <div className="ns-travel-line ns-travel-dim">No arrival plan yet</div>
              </div>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => startEdit(m.id)}>＋ Add</button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export default TravelPlansView;