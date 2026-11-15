/**
 * ListsView — shared checklists (Release 3): Bring / Buy / Checkout / custom.
 * Each list is a card; items are independent rows with a real checkbox
 * (optimistic done toggle, reverted on failure), an optional assignee select
 * and a labeled red delete (with the app's styled confirm). No drag-drop,
 * priorities or due dates — completion never creates a financial record.
 *
 * Every mutation reconciles the returned record into the sheet's local info
 * state AND calls onRefreshInfo; a 409 shows an inline Load-latest notice.
 *
 * Props:
 *   - info: { lists: [{ ...list, items }], ... }, members
 *   - adapter: { addList, updateList, deleteList, addItem, updateItem, deleteItem }
 *   - onInfoPatch(updater), onRefreshInfo(), askConfirm(...)
 */
import { useState, useRef } from 'react';

const KIND_LABELS = { bring: 'Bring', buy: 'Buy', checkout: 'Checkout' };

function ListsView({ info, members = [], adapter, onInfoPatch, onRefreshInfo, askConfirm }) {
  const lists = info?.lists || [];
  const [newList, setNewList] = useState(null);      // { title, kind }
  const [editingListId, setEditingListId] = useState(null);
  const [listRevision, setListRevision] = useState(undefined);
  const [listForm, setListForm] = useState(null);    // { title, kind }
  const [addItemText, setAddItemText] = useState({}); // { [listId]: text }
  const [pendingItems, setPendingItems] = useState(() => new Set()); // in-flight item ids
  const [writing, setWriting] = useState(false);
  const writingRef = useRef(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(null);    // { kind: 'list'|'item', record } from a 409

  const patchLists = (fn) => onInfoPatch(prev => ({ ...(prev || {}), lists: fn((prev?.lists || []).slice()) }));

  const setItemText = (listId, text) => setAddItemText(prev => ({ ...prev, [listId]: text }));

  const startNewList = () => { setNewList({ title: '', kind: '' }); setError(''); };
  const startEditList = (l) => { setEditingListId(l.id); setListRevision(l.revision); setListForm({ title: l.title || '', kind: l.kind || '' }); setError(''); };
  const exitListEdit = () => { setEditingListId(null); setListForm(null); };

  const createList = async () => {
    const title = (newList?.title || '').trim();
    if (!title || !adapter?.addList || writingRef.current) return;
    writingRef.current = true;
    setWriting(true);
    setError('');
    try {
      const data = { title };
      if (newList.kind) data.kind = newList.kind;
      const saved = await adapter.addList(data);
      patchLists(ls => [...ls, { ...saved, items: saved.items || [] }]);
      setNewList(null);
      onRefreshInfo?.();
    } catch (err) {
      setError(err?.message || 'Could not create the list');
    } finally {
      writingRef.current = false;
      setWriting(false);
    }
  };

  const saveList = async () => {
    const list = lists.find(l => String(l.id) === String(editingListId));
    const title = (listForm?.title || '').trim();
    if (!list || !title || !adapter?.updateList || writingRef.current) return;
    writingRef.current = true;
    setWriting(true);
    setError('');
    try {
      const saved = await adapter.updateList(list.id, {
        title,
        kind: listForm.kind || null,
        expected_revision: listRevision,
      });
      patchLists(ls => ls.map(l => String(l.id) === String(saved.id) ? { ...saved, items: l.items || [] } : l));
      exitListEdit();
      setConflict(null);
      onRefreshInfo?.();
    } catch (err) {
      if (err?.status === 409 && err.body?.list) setConflict({ kind: 'list', record: err.body.list });
      else setError(err?.message || 'Save failed');
    } finally {
      writingRef.current = false;
      setWriting(false);
    }
  };

  const loadLatestList = () => {
    if (!conflict || conflict.kind !== 'list') return;
    const saved = conflict.record;
    patchLists(ls => ls.map(l => String(l.id) === String(saved.id) ? { ...saved, items: l.items || [] } : l));
    setListForm({ title: saved.title || '', kind: saved.kind || '' });
    setListRevision(saved.revision);
    setConflict(null);
    setError('');
  };

  const askDeleteList = (l) => askConfirm(
    'Delete list',
    `Delete the list "${l.title}" and its ${(l.items || []).length} item${(l.items || []).length === 1 ? '' : 's'}? This cannot be undone.`,
    async () => {
      if (!adapter?.deleteList) return;
      try {
        await adapter.deleteList(l.id);
        patchLists(ls => ls.filter(x => String(x.id) !== String(l.id)));
        onRefreshInfo?.();
      } catch (err) {
        setError(err?.message || 'Delete failed');
      }
    },
    '🗑 Delete list',
  );

  const addItem = async (listId) => {
    const text = (addItemText[listId] || '').trim();
    if (!text || !adapter?.addItem || writingRef.current) return;
    writingRef.current = true;
    setWriting(true);
    setError('');
    try {
      const saved = await adapter.addItem(listId, { text });
      patchLists(ls => ls.map(l => String(l.id) === String(listId)
        ? { ...l, items: [...(l.items || []), saved] }
        : l));
      setItemText(listId, '');
      onRefreshInfo?.();
    } catch (err) {
      setError(err?.message || 'Could not add the item');
    } finally {
      writingRef.current = false;
      setWriting(false);
    }
  };

  // Optimistic done toggle: flip locally, PATCH, revert on failure.
  const toggleDone = async (item, listId) => {
    if (!adapter?.updateItem || pendingItems.has(String(item.id))) return;
    const next = { ...item, done: !item.done };
    patchLists(ls => ls.map(l => String(l.id) === String(listId)
      ? { ...l, items: (l.items || []).map(it => String(it.id) === String(item.id) ? next : it) }
      : l));
    setPendingItems(prev => { const s = new Set(prev); s.add(String(item.id)); return s; });
    setError('');
    try {
      const saved = await adapter.updateItem(item.id, { done: next.done, expected_revision: item.revision });
      patchLists(ls => ls.map(l => String(l.id) === String(listId)
        ? { ...l, items: (l.items || []).map(it => String(it.id) === String(saved.id) ? saved : it) }
        : l));
      onRefreshInfo?.();
    } catch (err) {
      patchLists(ls => ls.map(l => String(l.id) === String(listId)
        ? { ...l, items: (l.items || []).map(it => String(it.id) === String(item.id) ? item : it) }
        : l));
      if (err?.status === 409 && err.body?.item) {
        const serverItem = err.body.item;
        patchLists(ls => ls.map(l => String(l.id) === String(listId)
          ? { ...l, items: (l.items || []).map(it => String(it.id) === String(serverItem.id) ? serverItem : it) }
          : l));
        setError('Item was just changed by someone else — showing the latest version.');
      } else {
        setError(err?.message || 'Could not update the item');
      }
    } finally {
      setPendingItems(prev => { const s = new Set(prev); s.delete(String(item.id)); return s; });
    }
  };

  const setAssignee = async (item, listId, memberId) => {
    if (!adapter?.updateItem) return;
    setError('');
    try {
      const saved = await adapter.updateItem(item.id, {
        assignee_id: memberId || null,
        expected_revision: item.revision,
      });
      patchLists(ls => ls.map(l => String(l.id) === String(listId)
        ? { ...l, items: (l.items || []).map(it => String(it.id) === String(saved.id) ? saved : it) }
        : l));
      onRefreshInfo?.();
    } catch (err) {
      if (err?.status === 409 && err.body?.item) {
        const serverItem = err.body.item;
        patchLists(ls => ls.map(l => String(l.id) === String(listId)
          ? { ...l, items: (l.items || []).map(it => String(it.id) === String(serverItem.id) ? serverItem : it) }
          : l));
        setError('Item was just changed by someone else — showing the latest version.');
      } else {
        setError(err?.message || 'Could not update the item');
      }
    }
  };

  const askDeleteItem = (item, listId) => askConfirm(
    'Delete item',
    `Delete "${item.text}"? This cannot be undone.`,
    async () => {
      if (!adapter?.deleteItem) return;
      try {
        await adapter.deleteItem(item.id);
        patchLists(ls => ls.map(l => String(l.id) === String(listId)
          ? { ...l, items: (l.items || []).filter(it => String(it.id) !== String(item.id)) }
          : l));
        onRefreshInfo?.();
      } catch (err) {
        setError(err?.message || 'Delete failed');
      }
    },
    '🗑 Delete',
  );

  return (
    <fieldset className="ns-lists" disabled={writing} aria-busy={writing} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      {error && <div className="error" role="alert">{error}</div>}
      {lists.length === 0 && !newList && (
        <div className="empty-state">
          <span className="icon" style={{ color: 'var(--text-muted)' }}>✅</span>
          <p>No shared lists yet</p>
          <p style={{ fontSize: '0.82rem' }}>Groceries, who brings what, checkout chores…</p>
        </div>
      )}
      {lists.map(l => {
        const items = l.items || [];
        const editingThis = editingListId != null && String(editingListId) === String(l.id);
        return (
          <div key={l.id} className="ns-list-card">
            <div className="ns-list-head">
              {editingThis ? (
                <div className="ns-list-edit">
                  <label className="ns-field-label" htmlFor={`ns-list-title-${l.id}`}>Title</label>
                  <input id={`ns-list-title-${l.id}`} className="form-input" type="text" maxLength={60}
                    value={listForm.title} onChange={e => setListForm(prev => ({ ...prev, title: e.target.value }))} />
                  <label className="ns-field-label" htmlFor={`ns-list-kind-${l.id}`}>Kind</label>
                  <select id={`ns-list-kind-${l.id}`} className="form-input" value={listForm.kind}
                    onChange={e => setListForm(prev => ({ ...prev, kind: e.target.value }))}>
                    <option value="">Custom</option>
                    <option value="bring">Bring</option>
                    <option value="buy">Buy</option>
                    <option value="checkout">Checkout</option>
                  </select>
                  {conflict?.kind === 'list' && String(conflict.record.id) === String(l.id) && (
                    <div className="ns-conflict" role="alert">
                      Changed by someone else since you started.
                      <div className="ns-conflict-actions">
                        <button type="button" className="btn btn-ghost btn-xs" onClick={loadLatestList}>Load latest</button>
                      </div>
                    </div>
                  )}
                  <div className="ns-list-edit-actions">
                    <button type="button" className="btn btn-ghost btn-xs" onClick={exitListEdit}>Cancel</button>
                    <button type="button" className="btn btn-primary btn-xs"
                      disabled={!(listForm?.title || '').trim()} onClick={saveList}>Save</button>
                  </div>
                </div>
              ) : (
                <>
                  <span className="ns-list-title">{l.title}</span>
                  {l.kind && <span className={`ns-kind ns-kind-${l.kind}`}>{KIND_LABELS[l.kind] || l.kind}</span>}
                  <span className="ns-flex" />
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => startEditList(l)}>✏️ Edit</button>
                  <button type="button" className="btn btn-danger-outline btn-xs" onClick={() => askDeleteList(l)}>🗑 Delete</button>
                </>
              )}
            </div>
            {!editingThis && (
              <>
                {items.length === 0 && <div className="ns-list-empty">No items yet — add one below</div>}
                {items.map(it => {
                  const pending = pendingItems.has(String(it.id));
                  return (
                    <div key={it.id} className={`ns-item${it.done ? ' done' : ''}`}>
                      <input
                        id={`ns-item-${it.id}`}
                        type="checkbox"
                        checked={Boolean(it.done)}
                        disabled={pending}
                        onChange={() => toggleDone(it, l.id)}
                      />
                      <label htmlFor={`ns-item-${it.id}`} className="ns-item-text">{it.text}</label>
                      <select
                        className="form-input ns-item-assignee"
                        aria-label={`Assignee for "${it.text}"`}
                        value={it.assignee_id || ''}
                        onChange={e => setAssignee(it, l.id, e.target.value)}
                      >
                        <option value="">—</option>
                        {(Array.isArray(members) ? members : []).map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                      <button type="button" className="btn btn-danger-outline btn-xs"
                        onClick={() => askDeleteItem(it, l.id)}>🗑 Delete</button>
                    </div>
                  );
                })}
                <div className="ns-item-add">
                  <input
                    className="form-input"
                    type="text"
                    maxLength={200}
                    placeholder="Add an item…"
                    value={addItemText[l.id] || ''}
                    onChange={e => setItemText(l.id, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(l.id); } }}
                  />
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => addItem(l.id)}>＋ Add</button>
                </div>
              </>
            )}
          </div>
        );
      })}
      {newList ? (
        <div className="ns-list-card ns-list-new">
          <label className="ns-field-label" htmlFor="ns-new-list-title">Title</label>
          <input id="ns-new-list-title" className="form-input" type="text" maxLength={60}
            placeholder="e.g. Groceries, Bring, Checkout…"
            value={newList.title} onChange={e => setNewList(prev => ({ ...prev, title: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createList(); } }} />
          <label className="ns-field-label" htmlFor="ns-new-list-kind">Kind</label>
          <select id="ns-new-list-kind" className="form-input" value={newList.kind}
            onChange={e => setNewList(prev => ({ ...prev, kind: e.target.value }))}>
            <option value="">Custom</option>
            <option value="bring">Bring</option>
            <option value="buy">Buy</option>
            <option value="checkout">Checkout</option>
          </select>
          <div className="ns-list-edit-actions">
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setNewList(null)}>Cancel</button>
            <button type="button" className="btn btn-primary btn-xs" disabled={!(newList.title || '').trim()} onClick={createList}>
              Create list
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="ns-add-btn" onClick={startNewList}>＋ New list</button>
      )}
      <p className="ns-lists-hint">{writing ? 'Saving…' : 'Checking something off never creates an expense.'}</p>
    </fieldset>
  );
}

export default ListsView;