import { useMemo } from 'react';
import { useYjsMap, useYjsArray } from '../hooks/useYjs';
import { computeBalances, addMember as addMemberToDoc, addExpense as addExpenseToDoc, editExpense as editExpenseToDoc, deleteExpense as deleteExpenseFromDoc, addSettlement as addSettlementToDoc } from '../model';
import { calculateSplits } from '@splitdumb/core/splits';
import { GroupPage } from '@splitdumb/ui';

function GroupView({ doc, groupId, self, connected, peerCount, onLeave, onSwitchIdentity, onActorReady }) {
  const members = useYjsMap(doc, 'members');
  const expenses = useYjsArray(doc, 'expenses');
  const settlements = useYjsArray(doc, 'settlements');

  // Convert Yjs to plain objects on every render (Yjs hooks forceUpdate on changes)
  const memberList = (() => {
    const list = [];
    members.forEach((val) => {
      if (val.active !== false) list.push(val);
    });
    return list;
  })();

  const expenseList = expenses.toArray();
  const settlementList = settlements.toArray();

  const { balances, transactions } = computeBalances(doc);

  // Normalize expenses for shared component
  const normalizedExpenses = expenseList.map(e => ({
    ...e,
    payer_id: e.payerId || e.payer_id,
    payer_name: memberList.find(m => m.id === (e.payerId || e.payer_id))?.name || 'Unknown',
    split_type: e.splitType || e.split_type || 'equal',
  }));

  // Normalize settlements
  const normalizedSettlements = settlementList.map(s => ({
    ...s,
    from_id: s.fromId || s.from_id,
    to_id: s.toId || s.to_id,
    from_name: memberList.find(m => m.id === (s.fromId || s.from_id))?.name || '?',
    to_name: memberList.find(m => m.id === (s.toId || s.to_id))?.name || '?',
    status: s.status || 'confirmed',
  }));

  // P2P adapter — mutates Yjs doc directly
  const adapter = useMemo(() => ({
    addMember: async (name) => {
      const id = addMemberToDoc(doc, name);
      return doc.getMap('members').get(id);
    },
    addExpense: async (data) => {
      // Build P2P expense data from adapter payload
      const splitType = data.split_type;
      const numAmount = data.amount;
      const effectiveSplitAmong = data.split_among;

      const opts = {};
      if (splitType === 'shares') {
        opts.sharesInput = Object.fromEntries(
          Object.entries(data.shares || {}).filter(([id]) => effectiveSplitAmong.includes(id)).map(([id, v]) => [id, parseFloat(v)])
        );
      }
      if (splitType === 'exact') {
        opts.exactAmounts = Object.fromEntries(
          Object.entries(data.exact_amounts || {}).filter(([id]) => effectiveSplitAmong.includes(id)).map(([id, v]) => [id, parseFloat(v)])
        );
      }
      if (splitType === 'percentage') {
        opts.percentages = Object.fromEntries(
          Object.entries(data.percentages || {}).filter(([id]) => effectiveSplitAmong.includes(id)).map(([id, v]) => [id, parseFloat(v)])
        );
      }
      if (splitType === 'nights') {
        opts.nightsInput = data.nights || {};
        opts.nightsMode = data.nights_mode;
        opts.calcMethod = data.calc_method;
        if (data.nights_mode === 'dates') { opts.dateRangeStart = data.date_range_start; opts.dateRangeEnd = data.date_range_end; }
        if (data.nights_mode === 'count') { opts.numNights = data.num_nights; }
      }

      const result = calculateSplits(splitType, numAmount, effectiveSplitAmong, opts);
      const splits = Object.entries(result.shares).map(([memberId, share]) => ({ memberId, share }));

      const expenseData = {
        description: data.description,
        amount: numAmount,
        payerId: data.payer_id,
        splitType,
        splitAmong: effectiveSplitAmong,
        splits,
        date: data.date,
        category: data.category || null,
        notes: data.notes || null,
        sharesData: splitType === 'shares' ? Object.fromEntries(
          Object.entries(data.shares || {}).filter(([id]) => effectiveSplitAmong.includes(id))
        ) : null,
        dateRangeStart: splitType === 'nights' && data.nights_mode === 'dates' ? data.date_range_start : null,
        dateRangeEnd: splitType === 'nights' && data.nights_mode === 'dates' ? data.date_range_end : null,
        nightsData: splitType === 'nights' ? data.nights : null,
        nightsMode: splitType === 'nights' ? data.nights_mode : null,
        calcMethod: splitType === 'nights' ? data.calc_method : null,
        numNights: splitType === 'nights' && data.nights_mode === 'count' ? data.num_nights : null,
      };

      addExpenseToDoc(doc, expenseData);
      return { id: 'new' };
    },
    editExpense: async (id, data) => {
      // Similar normalization for editing
      const splitType = data.split_type;
      const numAmount = data.amount;
      const effectiveSplitAmong = data.split_among;

      const opts = {};
      if (splitType === 'shares') {
        opts.sharesInput = Object.fromEntries(
          Object.entries(data.shares || {}).filter(([id]) => effectiveSplitAmong.includes(id)).map(([id, v]) => [id, parseFloat(v)])
        );
      }
      if (splitType === 'exact') {
        opts.exactAmounts = Object.fromEntries(
          Object.entries(data.exact_amounts || {}).filter(([id]) => effectiveSplitAmong.includes(id)).map(([id, v]) => [id, parseFloat(v)])
        );
      }
      if (splitType === 'percentage') {
        opts.percentages = Object.fromEntries(
          Object.entries(data.percentages || {}).filter(([id]) => effectiveSplitAmong.includes(id)).map(([id, v]) => [id, parseFloat(v)])
        );
      }
      if (splitType === 'nights') {
        opts.nightsInput = data.nights || {};
        opts.nightsMode = data.nights_mode;
        opts.calcMethod = data.calc_method;
        if (data.nights_mode === 'dates') { opts.dateRangeStart = data.date_range_start; opts.dateRangeEnd = data.date_range_end; }
        if (data.nights_mode === 'count') { opts.numNights = data.num_nights; }
      }

      const result = calculateSplits(splitType, numAmount, effectiveSplitAmong, opts);
      const splits = Object.entries(result.shares).map(([memberId, share]) => ({ memberId, share }));

      const updates = {
        description: data.description,
        amount: numAmount,
        payerId: data.payer_id,
        splitType,
        splitAmong: effectiveSplitAmong,
        splits,
        date: data.date,
        category: data.category || null,
        notes: data.notes || null,
        sharesData: splitType === 'shares' ? Object.fromEntries(
          Object.entries(data.shares || {}).filter(([id]) => effectiveSplitAmong.includes(id))
        ) : null,
        dateRangeStart: splitType === 'nights' && data.nights_mode === 'dates' ? data.date_range_start : null,
        dateRangeEnd: splitType === 'nights' && data.nights_mode === 'dates' ? data.date_range_end : null,
        nightsData: splitType === 'nights' ? data.nights : null,
        nightsMode: splitType === 'nights' ? data.nights_mode : null,
        calcMethod: splitType === 'nights' ? data.calc_method : null,
        numNights: splitType === 'nights' && data.nights_mode === 'count' ? data.num_nights : null,
      };

      editExpenseToDoc(doc, id, updates);
      return { id };
    },
    deleteExpense: async (id) => {
      deleteExpenseFromDoc(doc, id);
    },
    addSettlement: async (data) => {
      addSettlementToDoc(doc, { fromId: data.from_id, toId: data.to_id, amount: data.amount });
    },
    selectMember: (member) => {
      // Forward to App.jsx to update self state
      if (onActorReady) onActorReady(member);
    },
  }), [doc, onActorReady]);

  const extraHeader = (
    <div style={{ fontSize: '0.78rem', color: connected ? '#22c55e' : 'var(--text-dim)', marginTop: 4 }}>
      {connected ? '🟢 Connected' : '🔴 Disconnected'} · {peerCount} peer(s)
    </div>
  );

  return (
    <GroupPage
      group={{ name: doc.getMap('meta')?.get('name') || `Group ${groupId}`, code: groupId }}
      members={memberList}
      expenses={normalizedExpenses}
      settlements={normalizedSettlements}
      balances={balances}
      transactions={transactions || []}
      actor={self}
      adapter={adapter}
      features={{ admin: false, searchFilter: false, auditLog: false, multiPayer: false, attachments: false }}
      onLeave={onLeave}
      onSwitchIdentity={onSwitchIdentity}
      extraHeader={extraHeader}
      onRefresh={() => {}}  // Yjs re-renders automatically
    />
  );
}

export default GroupView;