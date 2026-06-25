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
  const [refreshing, setRefreshing] = useState(false);

  const fetchGroup = useCallback(async () => {
    try { const data = await api.getGroup(code); setGroup(data); setError(''); }
    catch (err) {
      if (err.message === 'Group not found') {
        removeRecentGroup(code);
      }
      setError(err.message);
    }
    finally { setLoading(false); setRefreshing(false); }
  }, [code]);

  const fetchAuditLog = useCallback(async () => {
    try { setAuditLog(await api.getAuditLog(code, 50)); } catch {}
  }, [code]);

  useEffect(() => { fetchGroup(); }, [fetchGroup]);
  useEffect(() => { if (group) fetchAuditLog(); }, [group, fetchAuditLog]);

  useEffect(() => {
    api.me().then(user => {
      setIsAdmin(user?.role === 'admin');
    }).catch(() => {
      setIsAdmin(false);
    });
  }, []);

  useEffect(() => {
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
    removeMember: async (id, name) => api.removeMember(code, id, true),
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
  const normalizedBalances = group.balances || {};
  const normalizedTransactions = group.simplifiedDebts || [];

  return (
    <GroupPage
      group={normalizedGroup}
      members={normalizedMembers}
      expenses={normalizedExpenses}
      settlements={normalizedSettlements}
      balances={normalizedBalances}
      transactions={normalizedTransactions}
      actor={actor}
      adapter={adapter}
      features={{ admin: isAdmin, searchFilter: true, auditLog: true, multiPayer: true, attachments: true }}
      onLeave={handleLeave}
      onSwitchIdentity={handleSwitchActor}
      isAdmin={isAdmin}
      auditEntries={auditLog}
      onRefresh={() => { setRefreshing(true); fetchGroup(); fetchAuditLog(); }}
      AttachmentManager={AttachmentManager}
      attachmentProps={{ code }}
    />
  );
}

export default Group;