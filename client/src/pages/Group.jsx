import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, getSelectedMember, setSelectedMember, clearSelectedMember, removeRecentGroup } from '../api';
import { GroupPage } from '@splitdumb/ui';
import AttachmentManager from '../components/AttachmentManager';

function Group() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actor, setActor] = useState(null);
  const [actorChecked, setActorChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [auditLog, setAuditLog] = useState([]);
  const [info, setInfo] = useState(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState('');

  const fetchGroup = useCallback(async () => {
    try { const data = await api.getGroup(code); setGroup(data); setError(''); }
    catch (err) {
      if (err.message === 'Group not found') {
        removeRecentGroup(code);
      }
      setError(err.message);
    }
    finally { setLoading(false); }
  }, [code]);

  // Lightweight group-info read (stay / travel plans / lists / counts).
  // Guarded: only when the adapter endpoint exists on this client build.
  const fetchInfo = useCallback(async () => {
    if (typeof api.getGroupInfo !== 'function') return;
    setInfoLoading(true);
    try { setInfo(await api.getGroupInfo(code)); setInfoError(''); }
    catch (err) { setInfoError(err.message || 'Failed to load group info'); }
    finally { setInfoLoading(false); }
  }, [code]);

  const fetchAuditLog = useCallback(async () => {
    try { setAuditLog(await api.getAuditLog(code, 50)); }
    catch (err) { console.warn('Failed to load audit log:', err?.message || err); }
  }, [code]);

  // Deferred to a microtask so the fetch effects don't synchronously
  // cascade renders (react-hooks/set-state-in-effect).
  useEffect(() => { queueMicrotask(fetchGroup); }, [fetchGroup]);
  useEffect(() => { if (group) queueMicrotask(() => { fetchAuditLog(); }); }, [group, fetchAuditLog]);
  // Info loads alongside the group (guarded inside fetchInfo)
  useEffect(() => { queueMicrotask(fetchInfo); }, [fetchInfo]);

  useEffect(() => {
    api.me().then(user => {
      setIsAdmin(user?.role === 'admin');
    }).catch(() => {
      setIsAdmin(false);
    });
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      const saved = getSelectedMember(code);
      if (saved?.id) {
        // Re-attach color from group members if not stored
        if (group && !saved.color) {
          const m = group.members?.find(m => m.id === saved.id);
          if (m) saved.color = m.color;
        }
        setActor(saved);
      }
      setActorChecked(true);
    });
  }, [code, group]);

  useEffect(() => {
    if (group) {
      const saved = JSON.parse(localStorage.getItem('splitdumb_groups') || '[]');
      if (!saved.find(g => g.code === group.code)) {
        saved.push({ code: group.code, name: group.name });
        localStorage.setItem('splitdumb_groups', JSON.stringify(saved));
      }
    }
  }, [group]);

  const adapter = useMemo(() => ({
    addExpense: async (data) => api.addExpense(code, data),
    editExpense: async (id, data) => api.editExpense(code, id, data),
    deleteExpense: async (id) => api.deleteExpense(code, id),
    addMember: async (name) => api.addMember(code, name),
    editMember: async (id, data) => api.editMember(code, id, data),
    addSettlement: async (data) => api.addSettlement(code, data),
    confirmSettlement: async (id) => api.confirmSettlement(code, id, 'confirmed'),
    disputeSettlement: async (id) => api.confirmSettlement(code, id, 'disputed'),
    cancelSettlement: async (id) => api.cancelSettlement(code, id),
    removeMember: async (id) => api.removeMember(code, id, true),
    addNote: async (data) => api.addNote(code, data),
    editNote: async (id, data) => api.editNote(code, id, data),
    deleteNote: async (id) => api.deleteNote(code, id),
    // Group info utilities (Release 1-3)
    saveStay: async (data) => api.saveStay(code, data),
    deleteStay: async () => api.deleteStay(code),
    saveTravelPlan: async (memberId, data) => api.saveTravelPlan(code, memberId, data),
    deleteTravelPlan: async (memberId) => api.deleteTravelPlan(code, memberId),
    addList: async (data) => api.addList(code, data),
    updateList: async (id, data) => api.updateList(code, id, data),
    deleteList: async (id) => api.deleteList(code, id),
    addItem: async (listId, data) => api.addItem(code, listId, data),
    updateItem: async (itemId, data) => api.updateItem(code, itemId, data),
    deleteItem: async (itemId) => api.deleteItem(code, itemId),
    deleteGroup: async () => api.deleteGroup(code),
    uploadAttachment: async (expenseId, file) => api.uploadAttachment(code, expenseId, file),
    selectMember: (member) => {
      setSelectedMember(code, { id: member.id, name: member.name, color: member.color });
      setActor({ id: member.id, name: member.name, color: member.color });
    },
  }), [code]);

  const handleSwitchActor = () => {
    clearSelectedMember(code);
    setActor(null);
  };

  const handleLeave = () => {
    navigate('/splitdumb/');
  };

  if (!actorChecked) return <div className="loading"><div className="spinner" /><p>Loading...</p></div>;
  if (loading) return <div className="loading"><div className="spinner" /><p>Loading group...</p></div>;
  if (!group) return <div className="error">{error || 'Group not found'}</div>;

  // Normalize data for shared component
  const normalizedGroup = { name: group.name, code: group.code };
  const normalizedMembers = group.members || [];
  const normalizedExpenses = (group.expenses || []).map(e => ({
    ...e,
    payer_name: e.payer_name,
  }));
  const normalizedSettlements = group.settlements || [];
  const normalizedNotes = group.notes || [];
  const normalizedBalances = group.balances || {};
  const normalizedTransactions = group.simplifiedDebts || [];

  return (
    <GroupPage
      group={normalizedGroup}
      members={normalizedMembers}
      expenses={normalizedExpenses}
      settlements={normalizedSettlements}
      notes={normalizedNotes}
      balances={normalizedBalances}
      transactions={normalizedTransactions}
      actor={actor}
      adapter={adapter}
      features={{ admin: isAdmin, searchFilter: true, auditLog: true, multiPayer: true, attachments: true }}
      onLeave={handleLeave}
      onSwitchIdentity={handleSwitchActor}
      isAdmin={isAdmin}
      auditEntries={auditLog}
      info={info}
      infoLoading={infoLoading}
      infoError={infoError}
      onRefresh={() => { fetchGroup(); fetchAuditLog(); fetchInfo(); }}
      onRefreshInfo={fetchInfo}
      AttachmentManager={AttachmentManager}
      attachmentProps={{ code }}
    />
  );
}

export default Group;