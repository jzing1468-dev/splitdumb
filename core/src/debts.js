// @splitdumb/core — debts.js
// Calculate simplified debts (who owes whom). Pure function — no DB access.

/**
 * @param {Array<{id: string, name: string}>} members
 * @param {Array<{id: string, payer_id: string, amount: number, payers_data: string|null}>} expenses
 * @param {Array<{expense_id: string, member_id: string, share: number}>} expenseSplits
 * @param {Array<{from_id: string, to_id: string, amount: number}>} settlements
 */
export function calculateSimplifiedDebts(members, expenses, expenseSplits, settlements) {
  const balances = {};
  members.forEach(m => { balances[m.id] = 0; });

  expenses.forEach(exp => {
    if (exp.payers_data) {
      try {
        const payers = JSON.parse(exp.payers_data);
        payers.forEach(p => {
          balances[p.member_id] = (balances[p.member_id] || 0) + Number(p.amount);
        });
      } catch { balances[exp.payer_id] = (balances[exp.payer_id] || 0) + exp.amount; }
    } else {
      balances[exp.payer_id] = (balances[exp.payer_id] || 0) + exp.amount;
    }
  });

  expenseSplits.forEach(s => {
    balances[s.member_id] = (balances[s.member_id] || 0) - s.share;
  });

  settlements.forEach(s => {
    balances[s.from_id] = (balances[s.from_id] || 0) + s.amount;
    balances[s.to_id] = (balances[s.to_id] || 0) - s.amount;
  });

  const creditors = [];
  const debtors = [];
  Object.entries(balances).forEach(([id, bal]) => {
    if (bal > 0.005) creditors.push({ id, amount: Math.round(bal * 100) / 100 });
    else if (bal < -0.005) debtors.push({ id, amount: Math.round(Math.abs(bal) * 100) / 100 });
  });

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transactions = [];
  let i = 0, j = 0;
  while (i < creditors.length && j < debtors.length) {
    const amount = Math.round(Math.min(creditors[i].amount, debtors[j].amount) * 100) / 100;
    if (amount > 0.01) {
      transactions.push({ from: debtors[j].id, to: creditors[i].id, amount });
    }
    creditors[i].amount -= amount;
    debtors[j].amount -= amount;
    if (creditors[i].amount < 0.01) i++;
    if (debtors[j].amount < 0.01) j++;
  }

  const memberMap = {};
  members.forEach(m => { memberMap[m.id] = m.name; });

  return {
    balances: Object.fromEntries(
      Object.entries(balances).map(([id, bal]) => [
        id,
        { name: memberMap[id] || 'Unknown', balance: Math.round(bal * 100) / 100 }
      ])
    ),
    transactions: transactions.map(t => ({
      from: { id: t.from, name: memberMap[t.from] },
      to: { id: t.to, name: memberMap[t.to] },
      amount: t.amount
    }))
  };
}