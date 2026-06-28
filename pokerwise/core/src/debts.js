// @pokerwise/core — debts.js
// Calculate simplified settlements for poker sessions.
// Pure function — no DB access.

/**
 * @param {Array<{id: string, name: string, total_buy_in: number, cash_out: number|null}>} players
 * @returns {{ balances: Object, settlements: Array<{from: {id, name}, to: {id, name}, amount: number}> }}
 */
export function calculateSettlements(players) {
  const balances = {};
  players.forEach(p => {
    const buyIn = Number(p.total_buy_in) || 0;
    const cashOut = p.cash_out != null ? Number(p.cash_out) || 0 : 0;
    balances[p.id] = cashOut - buyIn;
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

  const nameMap = {};
  players.forEach(p => { nameMap[p.id] = p.name; });

  return {
    balances: Object.fromEntries(
      Object.entries(balances).map(([id, bal]) => [
        id,
        { name: nameMap[id] || 'Unknown', balance: Math.round(bal * 100) / 100 }
      ])
    ),
    settlements: transactions.map(t => ({
      from: { id: t.from, name: nameMap[t.from] },
      to: { id: t.to, name: nameMap[t.to] },
      amount: t.amount
    }))
  };
}