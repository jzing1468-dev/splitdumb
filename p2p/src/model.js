import * as Y from 'yjs';
// Import directly from source files to prevent Rollup tree-shaking
// (barrel re-exports via @splitdumb/core are statically invisible to Rollup)
import { calculateSimplifiedDebts } from '@splitdumb/core/debts';
import { nextColorForGroup } from '@splitdumb/core/colors';

const GROUP_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f97316',
  '#8b5cf6', '#eab308', '#06b6d4', '#ec4899',
  '#14b8a6', '#d946ef', '#84cc16', '#f43f5e',
  '#6366f1', '#a855f7', '#0ea5e9', '#78716c'
];

export function createDoc() {
  return new Y.Doc();
}

export function getGroupMeta(doc) {
  return doc.getMap('meta');
}

export function getMembers(doc) {
  return doc.getMap('members');
}

export function getExpenses(doc) {
  return doc.getArray('expenses');
}

export function getSettlements(doc) {
  return doc.getArray('settlements');
}

export function addMember(doc, name) {
  const id = crypto.randomUUID();
  const members = doc.getMap('members');
  const count = members.size;
  members.set(id, {
    id,
    name: name.trim(),
    color: nextColorForGroup(count),
    joinedAt: new Date().toISOString()
  });
  return id;
}

export function removeMember(doc, memberId) {
  const members = doc.getMap('members');
  if (members.has(memberId)) {
    const member = members.get(memberId);
    members.set(memberId, { ...member, active: false });
  }
}

export function addExpense(doc, expenseData) {
  const expenses = doc.getArray('expenses');
  expenses.push([{
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...expenseData
  }]);
}

export function editExpense(doc, expenseId, updates) {
  const expenses = doc.getArray('expenses');
  doc.transact(() => {
    for (let i = 0; i < expenses.length; i++) {
      const exp = expenses.get(i);
      if (exp.id === expenseId) {
        // Y.Array has no .set() — delete + insert in a transaction
        expenses.delete(i);
        expenses.insert(i, [{ ...exp, ...updates }]);
        return;
      }
    }
  });
}

export function deleteExpense(doc, expenseId) {
  const expenses = doc.getArray('expenses');
  for (let i = 0; i < expenses.length; i++) {
    if (expenses.get(i).id === expenseId) {
      expenses.delete(i);
      return;
    }
  }
}

export function addSettlement(doc, settlementData) {
  const settlements = doc.getArray('settlements');
  settlements.push([{
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: 'confirmed',
    ...settlementData
  }]);
}

/**
 * Compute balances using @splitdumb/core.
 * Converts Yjs types to plain objects that core expects.
 */
export function computeBalances(doc) {
  const members = [];
  doc.getMap('members').forEach((val) => {
    if (val.active !== false) members.push({ id: val.id, name: val.name });
  });

  const expenses = doc.getArray('expenses').toArray()
    .map(exp => ({
      ...exp,
      payer_id: exp.payerId || exp.payer_id,  // normalize for core
      payers_data: exp.payersData ? JSON.stringify(exp.payersData) : (exp.payers_data || null),
    }));

  // Flatten splits: core expects [{expense_id, member_id, share}]
  const expenseSplits = [];
  expenses.forEach(exp => {
    if (exp.splits && Array.isArray(exp.splits)) {
      exp.splits.forEach(s => {
        expenseSplits.push({ expense_id: exp.id, member_id: s.memberId || s.member_id, share: s.share });
      });
    }
  });

  const settlements = doc.getArray('settlements')
    .toArray()
    .filter(s => s.status === 'confirmed')
    .map(s => ({ from_id: s.fromId || s.from_id, to_id: s.toId || s.to_id, amount: s.amount }));

  return calculateSimplifiedDebts(members, expenses, expenseSplits, settlements);
}