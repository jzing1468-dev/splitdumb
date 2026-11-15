/**
 * StayView — the group's stay/accommodation quick reference (Release 1).
 * Read card with Copy address / Open map / safe listing link, plus a labeled
 * edit form (create-or-update singleton via PUT .../stay with expected_revision).
 *
 * Datetimes are LOCAL wall-clock 'YYYY-MM-DDTHH:mm' or date-only strings and are
 * displayed exactly as typed (see ui/src/dateFormat.js fmtWallDateTime) — the app
 * never converts them between timezones. A 409 shows an inline notice with
 * Load latest (same pattern as notes); other save failures keep the form.
 *
 * Props:
 *   - info: { stay, ... } (GroupInfoSheet local state)
 *   - adapter: { saveStay(data), deleteStay() }
 *   - onInfoPatch(updater): functional update of the sheet's local info state
 *   - onRefreshInfo: () => void (refetch after mutations)
 *   - askConfirm(title, message, action, confirmLabel): styled destructive confirm
 */
import { useState } from 'react';
import { fmtWallDateTime, fmtNoteDate } from './dateFormat';

const BLANK_FORM = {
  title: '', address: '', listing_url: '', checkin_at: '', checkout_at: '',
  timezone: '', instructions: '', parking: '', wifi: '', contact_name: '', contact_phone: '',
};

// Common timezones first in the select; the rest follow platform order.
const COMMON_TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Anchorage', 'Pacific/Honolulu', 'Europe/London', 'Europe/Paris',
  'Europe/Berlin', 'Europe/Madrid', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata',
  'Australia/Sydney', 'UTC',
];
function timezoneOptions() {
  let all = [];
  try {
    all = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  } catch (err) { all = []; }
  if (!Array.isArray(all) || all.length === 0) return COMMON_TIMEZONES.slice();
  const rest = all.filter(tz => !COMMON_TIMEZONES.includes(tz)).sort();
  return [...COMMON_TIMEZONES.filter(tz => all.includes(tz)), ...rest];
}

const formOfStay = (stay) => stay
  ? {
      title: stay.title || '', address: stay.address || '', listing_url: stay.listing_url || '',
      checkin_at: stay.checkin_at || '', checkout_at: stay.checkout_at || '',
      timezone: stay.timezone || '', instructions: stay.instructions || '',
      parking: stay.parking || '', wifi: stay.wifi || '',
      contact_name: stay.contact_name || '', contact_phone: stay.contact_phone || '',
    }
  : { ...BLANK_FORM };

// '' means "unset" — send null so validators see an explicit missing value.
const nullifyEmpties = (form) => {
  const out = {};
  for (const [k, v] of Object.entries(form)) out[k] = typeof v === 'string' && v.trim() === '' ? null : v;
  return out;
};

function StayView({ info, adapter, onInfoPatch, onRefreshInfo, askConfirm }) {
  const stay = info?.stay ?? null;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [base, setBase] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(null); // server stay from a 409
  const [copied, setCopied] = useState(false);

  const startEdit = () => {
    setForm(formOfStay(stay));
    setBase(formOfStay(stay));
    setEditing(true);
    setError('');
    setConflict(null);
  };
  const exitEdit = () => { setEditing(false); setForm(null); setBase(null); setError(''); setConflict(null); };

  const isDirty = form && base && Object.keys(base).some(k => form[k] !== base[k]);

  const cancelEdit = () => {
    if (isDirty) {
      askConfirm('Discard changes?', 'Your unsaved stay edits will be lost.', () => exitEdit(), 'Discard');
      return;
    }
    exitEdit();
  };

  const save = async () => {
    if (!adapter?.saveStay) return;
    setSaving(true);
    setError('');
    try {
      const saved = await adapter.saveStay({ ...nullifyEmpties(form), expected_revision: stay?.revision ?? null });
      onInfoPatch(prev => ({ ...(prev || {}), stay: saved }));
      exitEdit();
      onRefreshInfo?.();
    } catch (err) {
      if (err?.status === 409 && err.body?.stay) {
        setConflict(err.body.stay);
      } else {
        setError(err?.message || 'Save failed');
      }
    } finally {
      setSaving(false);
    }
  };

  const loadLatest = () => {
    if (!conflict) return;
    const next = formOfStay(conflict);
    setForm(next);
    setBase(next);
    onInfoPatch(prev => ({ ...(prev || {}), stay: conflict }));
    setConflict(null);
    setError('');
  };

  const askDelete = () => askConfirm(
    'Clear stay details',
    'Remove the stay details for this group? Lists, notes and expenses are not affected. This cannot be undone.',
    async () => {
      if (!adapter?.deleteStay) return;
      try {
        await adapter.deleteStay();
        onInfoPatch(prev => ({ ...(prev || {}), stay: null }));
        exitEdit();
        onRefreshInfo?.();
      } catch (err) {
        setError(err?.message || 'Delete failed');
      }
    },
    '🗑 Clear stay',
  );

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(stay.address || '');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      setError('Copy failed — select the text and copy manually.');
    }
  };

  const set = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.value }));

  if (editing && form) {
    const timezones = timezoneOptions();
    return (
      <div className="ns-stay-form">
        <div className="ns-conflict-wrap">
          {conflict && (
            <div className="ns-conflict" role="alert">
              Stay was updated by someone else since you started.
              <div className="ns-conflict-actions">
                <button type="button" className="btn btn-ghost btn-xs" onClick={loadLatest}>Load latest</button>
              </div>
            </div>
          )}
          {error && <div className="error" role="alert">{error}</div>}
        </div>
        <label className="ns-field-label" htmlFor="ns-stay-title">Title</label>
        <input id="ns-stay-title" className="form-input" type="text" maxLength={100}
          placeholder="e.g. Lake house" value={form.title} onChange={set('title')} />
        <label className="ns-field-label" htmlFor="ns-stay-address">Address</label>
        <input id="ns-stay-address" className="form-input" type="text" maxLength={300}
          placeholder="Street address" value={form.address} onChange={set('address')} />
        <label className="ns-field-label" htmlFor="ns-stay-listing">Listing URL</label>
        <input id="ns-stay-listing" className="form-input" type="url" maxLength={500}
          placeholder="https://…" value={form.listing_url} onChange={set('listing_url')} />
        <div className="ns-form-grid">
          <div>
            <label className="ns-field-label" htmlFor="ns-stay-checkin">Check-in</label>
            <input id="ns-stay-checkin" className="form-input" type="datetime-local"
              value={form.checkin_at} onChange={set('checkin_at')} />
          </div>
          <div>
            <label className="ns-field-label" htmlFor="ns-stay-checkout">Check-out</label>
            <input id="ns-stay-checkout" className="form-input" type="datetime-local"
              value={form.checkout_at} onChange={set('checkout_at')} />
          </div>
        </div>
        <label className="ns-field-label" htmlFor="ns-stay-tz">Timezone</label>
        <select id="ns-stay-tz" className="form-input" value={form.timezone} onChange={set('timezone')}>
          <option value="">— not set —</option>
          {timezones.map(tz => <option key={tz} value={tz}>{tz}</option>)}
        </select>
        <label className="ns-field-label" htmlFor="ns-stay-instructions">Instructions</label>
        <textarea id="ns-stay-instructions" className="form-input ns-body-input" maxLength={4000} rows={3}
          placeholder="Door codes, keyless entry, check-in steps…" value={form.instructions} onChange={set('instructions')} />
        <label className="ns-field-label" htmlFor="ns-stay-parking">Parking</label>
        <input id="ns-stay-parking" className="form-input" type="text" maxLength={500}
          placeholder="Where to park, permits…" value={form.parking} onChange={set('parking')} />
        <label className="ns-field-label" htmlFor="ns-stay-wifi">Wi-Fi</label>
        <input id="ns-stay-wifi" className="form-input" type="text" maxLength={200}
          placeholder="Network / password" value={form.wifi} onChange={set('wifi')} />
        <div className="ns-form-grid">
          <div>
            <label className="ns-field-label" htmlFor="ns-stay-contact-name">Contact name</label>
            <input id="ns-stay-contact-name" className="form-input" type="text" maxLength={100}
              value={form.contact_name} onChange={set('contact_name')} />
          </div>
          <div>
            <label className="ns-field-label" htmlFor="ns-stay-contact-phone">Contact phone</label>
            <input id="ns-stay-contact-phone" className="form-input" type="text" maxLength={50}
              value={form.contact_phone} onChange={set('contact_phone')} />
          </div>
        </div>
        <div className="ns-sticky-actions">
          <span className="ns-sticky-status" aria-live="polite">
            {saving ? 'Saving…' : error ? 'Save failed — Retry' : isDirty ? 'Unsaved changes' : ''}
          </span>
          <button type="button" className="btn btn-ghost btn-xs" onClick={cancelEdit}>Cancel</button>
          <button type="button" className="btn btn-primary btn-xs" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save stay'}
          </button>
        </div>
      </div>
    );
  }

  if (!stay) {
    return (
      <div className="empty-state">
        <span className="icon" style={{ color: 'var(--text-muted)' }}>🏠</span>
        <p>No stay details yet</p>
        <p style={{ fontSize: '0.82rem' }}>Share the address, check-in time and access instructions</p>
        <button type="button" className="btn btn-primary btn-xs" style={{ marginTop: 10 }} onClick={startEdit}>Add stay details</button>
      </div>
    );
  }

  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stay.address || '')}`;
  const listingUrl = String(stay.listing_url || '');
  const isSafeUrl = /^https?:\/\//i.test(listingUrl);

  return (
    <div className="ns-stay">
      {error && <div className="error" role="alert">{error}</div>}
      <div className="ns-stay-card">
        <div className="ns-stay-head">
          <h3 className="ns-stay-title">{stay.title || 'Stay'}</h3>
          {stay.timezone && <span className="ns-stay-tz">{stay.timezone}</span>}
        </div>
        {stay.address && (
          <div className="ns-stay-row">
            <span className="ns-stay-label">Address</span>
            <span className="ns-stay-value">{stay.address}</span>
            <span className="ns-stay-row-actions">
              <button type="button" className="btn btn-ghost btn-xs" onClick={copyAddress}>{copied ? '✓ Copied' : '📋 Copy address'}</button>
              <a className="btn btn-ghost btn-xs" href={mapUrl} target="_blank" rel="noopener noreferrer">🗺 Open map</a>
            </span>
          </div>
        )}
        {isSafeUrl && (
          <div className="ns-stay-row">
            <span className="ns-stay-label">Listing</span>
            <a className="ns-stay-value ns-stay-link" href={listingUrl} target="_blank" rel="noopener noreferrer">{listingUrl}</a>
          </div>
        )}
        {(stay.checkin_at || stay.checkout_at) && (
          <div className="ns-form-grid ns-stay-times">
            <div className="ns-stay-time">
              <span className="ns-stay-label">Check-in</span>
              <span className="ns-stay-value">{fmtWallDateTime(stay.checkin_at) || '—'}</span>
            </div>
            <div className="ns-stay-time">
              <span className="ns-stay-label">Check-out</span>
              <span className="ns-stay-value">{fmtWallDateTime(stay.checkout_at) || '—'}</span>
            </div>
          </div>
        )}
        {stay.instructions && (
          <div className="ns-stay-block">
            <span className="ns-stay-label">Instructions</span>
            <div className="ns-stay-pre">{stay.instructions}</div>
          </div>
        )}
        {stay.parking && (
          <div className="ns-stay-block">
            <span className="ns-stay-label">Parking</span>
            <div className="ns-stay-pre">{stay.parking}</div>
          </div>
        )}
        {stay.wifi && (
          <div className="ns-stay-block">
            <span className="ns-stay-label">Wi-Fi</span>
            <div className="ns-stay-pre">{stay.wifi}</div>
          </div>
        )}
        {(stay.contact_name || stay.contact_phone) && (
          <div className="ns-stay-row">
            <span className="ns-stay-label">Contact</span>
            <span className="ns-stay-value">{[stay.contact_name, stay.contact_phone].filter(Boolean).join(' · ')}</span>
          </div>
        )}
        <div className="ns-stay-meta">
          Updated {fmtNoteDate(stay.updated_at || stay.created_at)}
        </div>
        <div className="ns-sticky-actions">
          <span className="ns-flex" />
          <button type="button" className="btn btn-ghost btn-xs" onClick={startEdit}>✏️ Edit</button>
          <button type="button" className="btn btn-danger-outline btn-xs" onClick={askDelete}>🗑 Clear stay</button>
        </div>
      </div>
    </div>
  );
}

export default StayView;