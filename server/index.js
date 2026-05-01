const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { COOKIE_NAME, AUTH_SERVICE, requireAdmin, requireAuth, parseCookies, verifySession } = require('./auth');
const { init: initDb, prepare, exec: execDb, saveDb, markDirty } = require('./db');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Helper: generate 6-char alphanumeric code
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generateUniqueCode() {
  let code;
  let attempts = 0;
  do {
    code = generateCode();
    const existing = prepare('SELECT id FROM groups WHERE code = ?').get(code);
    if (!existing) return code;
    attempts++;
  } while (attempts < 100);
  throw new Error('Failed to generate unique code');
}

function nameToColor(name) {
  const colors = [
    '#E57373', '#F06292', '#BA68C8', '#9575CD',
    '#7986CB', '#64B5F6', '#4FC3F7', '#4DD0E1',
    '#4DB6AC', '#81C784', '#AED581', '#DCE775',
    '#FFD54F', '#FFB74D', '#FF8A65', '#A1887F'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function calculateSimplifiedDebts(groupId) {
  const members = prepare('SELECT id, name FROM members WHERE group_id = ?').all(groupId);
  const balances = {};
  members.forEach(m => { balances[m.id] = 0; });

  const expenses = prepare('SELECT id, payer_id, amount FROM expenses WHERE group_id = ?').all(groupId);
  expenses.forEach(exp => {
    balances[exp.payer_id] = (balances[exp.payer_id] || 0) + exp.amount;
    const splits = prepare('SELECT member_id, share FROM splits WHERE expense_id = ?').all(exp.id);
    splits.forEach(s => {
      balances[s.member_id] = (balances[s.member_id] || 0) - s.share;
    });
  });

  const settlements = prepare(
    "SELECT from_id, to_id, amount FROM settlements WHERE group_id = ? AND status = 'confirmed'"
  ).all(groupId);
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

// Admin middleware: session cookie OR admin_token header
function adminOrToken(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (token) {
    return verifySession(token).then(user => {
      if (user && user.role === 'admin') {
        req.user = user;
        return next();
      }
      return checkAdminToken(req, res, next);
    }).catch(() => checkAdminToken(req, res, next));
  }
  return checkAdminToken(req, res, next);
}

function checkAdminToken(req, res, next) {
  const adminToken = req.headers['x-admin-token'] || req.query.admin_token;
  if (!adminToken) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const group = prepare('SELECT id FROM groups WHERE admin_token = ?').get(adminToken);
  if (!group) {
    return res.status(403).json({ error: 'Invalid admin token' });
  }
  req.adminGroupId = group.id;
  next();
}

// ==================== AUTH ROUTES ====================
// Login/logout handled by auth.johnzhong.win — redirect there
app.get('/api/v1/auth/me', requireAuth, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role });
});

// Admin: list all groups
app.get('/api/v1/admin/groups', requireAdmin, (req, res) => {
  try {
    const groups = prepare('SELECT g.*, (SELECT COUNT(*) FROM members WHERE group_id = g.id) as member_count, (SELECT COUNT(*) FROM expenses WHERE group_id = g.id) as expense_count FROM groups g ORDER BY g.created_at DESC').all();
    res.json(groups);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list groups' });
  }
});

// ==================== GROUP ROUTES ====================

app.post('/api/v1/groups', (req, res) => {
  const { name, passcode } = req.body;
  if (!name || name.trim().length === 0 || name.length > 50) {
    return res.status(400).json({ error: 'Group name must be 1-50 characters' });
  }
  const id = uuidv4();
  const code = generateUniqueCode();
  const adminToken = generateCode() + generateCode();
  try {
    prepare('INSERT INTO groups (id, name, code, admin_token, passcode) VALUES (?, ?, ?, ?, ?)')
      .run(id, name.trim(), code, adminToken, passcode || null);
    const group = prepare('SELECT * FROM groups WHERE id = ?').get(id);
    res.status(201).json({ ...group, admin_token: adminToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

app.get('/api/v1/groups/:code', (req, res) => {
  const group = prepare('SELECT * FROM groups WHERE code = ?').get(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const members = prepare('SELECT * FROM members WHERE group_id = ?').all(group.id);
  const expenses = prepare(
    'SELECT e.*, m.name as payer_name FROM expenses e JOIN members m ON e.payer_id = m.id WHERE e.group_id = ? ORDER BY e.created_at DESC'
  ).all(group.id);

  const expensesWithSplits = expenses.map(exp => {
    const splits = prepare(
      'SELECT s.member_id, s.share, m.name as member_name FROM splits s JOIN members m ON s.member_id = m.id WHERE s.expense_id = ?'
    ).all(exp.id);
    return { ...exp, splits };
  });

  const settlements = prepare(
    'SELECT s.*, m1.name as from_name, m2.name as to_name FROM settlements s JOIN members m1 ON s.from_id = m1.id JOIN members m2 ON s.to_id = m2.id WHERE s.group_id = ? ORDER BY s.created_at DESC'
  ).all(group.id);

  const debtInfo = calculateSimplifiedDebts(group.id);

  res.json({
    ...group,
    members,
    expenses: expensesWithSplits,
    settlements,
    balances: debtInfo.balances,
    simplifiedDebts: debtInfo.transactions
  });
});

app.delete('/api/v1/groups/:code', adminOrToken, (req, res) => {
  const group = prepare('SELECT * FROM groups WHERE code = ?').get(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  // Delete cascading: settlements, splits, expenses, members, then group
  prepare('DELETE FROM settlements WHERE group_id = ?').run(group.id);
  const expIds = prepare('SELECT id FROM expenses WHERE group_id = ?').all(group.id);
  expIds.forEach(e => prepare('DELETE FROM splits WHERE expense_id = ?').run(e.id));
  prepare('DELETE FROM expenses WHERE group_id = ?').run(group.id);
  prepare('DELETE FROM members WHERE group_id = ?').run(group.id);
  prepare('DELETE FROM groups WHERE id = ?').run(group.id);
  saveDb();
  res.json({ success: true });
});

app.patch('/api/v1/groups/:code', (req, res) => {
  const group = prepare('SELECT * FROM groups WHERE code = ?').get(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const { name, passcode: newPasscode } = req.body;
  try {
    if (name && name.trim().length > 0) {
      prepare('UPDATE groups SET name = ? WHERE id = ?').run(name.trim(), group.id);
    }
    if (newPasscode !== undefined) {
      prepare('UPDATE groups SET passcode = ? WHERE id = ?').run(newPasscode || null, group.id);
    }
    saveDb();
    const updated = prepare('SELECT * FROM groups WHERE id = ?').get(group.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update group' });
  }
});

// ==================== MEMBER ROUTES ====================

app.post('/api/v1/groups/:code/members', (req, res) => {
  const group = prepare('SELECT * FROM groups WHERE code = ?').get(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const { name } = req.body;
  if (!name || name.trim().length === 0 || name.length > 30) {
    return res.status(400).json({ error: 'Member name must be 1-30 characters' });
  }
  const memberCount = prepare('SELECT COUNT(*) as count FROM members WHERE group_id = ?').get(group.id);
  if ((memberCount?.count || 0) >= 20) {
    return res.status(400).json({ error: 'Maximum 20 members per group' });
  }
  const existing = prepare('SELECT id FROM members WHERE group_id = ? AND LOWER(name) = LOWER(?)').get(group.id, name.trim());
  if (existing) {
    return res.status(409).json({ error: 'That name is already in this group' });
  }
  const id = uuidv4();
  const color = nameToColor(name.trim());
  try {
    prepare('INSERT INTO members (id, group_id, name, color) VALUES (?, ?, ?, ?)')
      .run(id, group.id, name.trim(), color);
    saveDb();
    const member = prepare('SELECT * FROM members WHERE id = ?').get(id);
    res.status(201).json(member);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add member' });
  }
});

app.delete('/api/v1/groups/:code/members/:id', adminOrToken, (req, res) => {
  const group = prepare('SELECT * FROM groups WHERE code = ?').get(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const member = prepare('SELECT * FROM members WHERE id = ? AND group_id = ?').get(req.params.id, group.id);
  if (!member) return res.status(404).json({ error: 'Member not found' });

  const force = req.query.force === 'true';
  const debts = calculateSimplifiedDebts(group.id);
  const balance = debts.balances[member.id]?.balance || 0;

  if (!force && Math.abs(balance) > 0.01) {
    return res.status(400).json({
      error: `Cannot remove ${member.name} — outstanding balance of $${balance.toFixed(2)}. Use ?force=true to override.`,
      balance
    });
  }

  try {
    // Remove member's splits
    prepare('DELETE FROM splits WHERE member_id = ?').run(req.params.id);
    // Remove expenses where this member was the payer
    const solePayerExpenses = prepare('SELECT id FROM expenses WHERE payer_id = ? AND group_id = ?').all(req.params.id, group.id);
    solePayerExpenses.forEach(e => {
      prepare('DELETE FROM splits WHERE expense_id = ?').run(e.id);
      prepare('DELETE FROM expenses WHERE id = ?').run(e.id);
    });
    // Remove settlements involving this member
    prepare("DELETE FROM settlements WHERE (from_id = ? OR to_id = ?) AND group_id = ?")
      .run(req.params.id, req.params.id, group.id);
    // Remove the member
    prepare('DELETE FROM members WHERE id = ? AND group_id = ?').run(req.params.id, group.id);
    saveDb();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// ==================== EXPENSE ROUTES ====================

app.post('/api/v1/groups/:code/expenses', (req, res) => {
  const group = prepare('SELECT * FROM groups WHERE code = ?').get(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const { description, amount, payer_id, split_type, split_among, exact_amounts, percentages, date, created_by } = req.body;

  if (!description || description.trim().length === 0) return res.status(400).json({ error: 'Description is required' });
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Amount must be greater than $0' });
  if (!payer_id) return res.status(400).json({ error: 'Payer is required' });

  const payer = prepare('SELECT id FROM members WHERE id = ? AND group_id = ?').get(payer_id, group.id);
  if (!payer) return res.status(400).json({ error: 'Payer must be a member of this group' });

  const type = split_type || 'equal';
  const members = prepare('SELECT id FROM members WHERE group_id = ?').all(group.id);
  const memberIds = new Set(members.map(m => m.id));

  let splitMemberIds;
  if (split_among && split_among.length > 0) {
    for (const mid of split_among) {
      if (!memberIds.has(mid)) return res.status(400).json({ error: `Member ${mid} is not in this group` });
    }
    splitMemberIds = split_among;
  } else {
    splitMemberIds = members.map(m => m.id);
  }

  if (splitMemberIds.length === 0) return res.status(400).json({ error: 'At least one person must be in the split' });

  const shares = {};
  const roundedAmount = Math.round(amount * 100) / 100;

  if (type === 'equal') {
    const sharePerPerson = Math.round((roundedAmount / splitMemberIds.length) * 100) / 100;
    const totalAllocated = Math.round(sharePerPerson * splitMemberIds.length * 100) / 100;
    const remainder = Math.round((roundedAmount - totalAllocated) * 100) / 100;
    splitMemberIds.forEach((mid, i) => {
      shares[mid] = sharePerPerson + (i < Math.round(remainder * 100) ? 0.01 : 0);
    });
  } else if (type === 'exact') {
    if (!exact_amounts) return res.status(400).json({ error: 'exact_amounts required for exact split type' });
    const total = Object.values(exact_amounts).reduce((sum, v) => sum + v, 0);
    if (Math.abs(total - roundedAmount) > 0.01) {
      return res.status(400).json({ error: `Split amounts must equal the total ($${roundedAmount.toFixed(2)}). Got $${total.toFixed(2)}` });
    }
    for (const [mid, val] of Object.entries(exact_amounts)) {
      if (!splitMemberIds.includes(mid)) return res.status(400).json({ error: `Member ${mid} not in split` });
      shares[mid] = val;
    }
  } else if (type === 'percentage') {
    if (!percentages) return res.status(400).json({ error: 'percentages required for percentage split type' });
    const totalPct = Object.values(percentages).reduce((sum, v) => sum + v, 0);
    if (Math.abs(totalPct - 100) > 0.01) {
      return res.status(400).json({ error: `Split percentages must add up to 100%. Got ${totalPct.toFixed(1)}%` });
    }
    for (const [mid, pct] of Object.entries(percentages)) {
      if (!splitMemberIds.includes(mid)) return res.status(400).json({ error: `Member ${mid} not in split` });
      shares[mid] = Math.round(roundedAmount * pct / 100 * 100) / 100;
    }
  }

  // Anti-fat-finger
  const recent = prepare(
    "SELECT id FROM expenses WHERE group_id = ? AND payer_id = ? AND description = ? AND amount = ? AND created_at > datetime('now', '-1 minute')"
  ).get(group.id, payer_id, description.trim(), roundedAmount);
  if (recent) return res.status(409).json({ error: 'Duplicate expense — similar expense was added in the last minute' });

  const id = uuidv4();
  const expenseDate = date || new Date().toISOString().split('T')[0];

  try {
    prepare('INSERT INTO expenses (id, group_id, description, amount, payer_id, split_type, date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, group.id, description.trim(), roundedAmount, payer_id, type, expenseDate, created_by || null);
    for (const [mid, share] of Object.entries(shares)) {
      prepare('INSERT INTO splits (expense_id, member_id, share) VALUES (?, ?, ?)').run(id, mid, share);
    }
    saveDb();
    const expense = prepare('SELECT * FROM expenses WHERE id = ?').get(id);
    const splits = prepare('SELECT s.member_id, s.share, m.name as member_name FROM splits s JOIN members m ON s.member_id = m.id WHERE s.expense_id = ?').all(id);
    res.status(201).json({ ...expense, splits });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add expense' });
  }
});

app.delete('/api/v1/groups/:code/expenses/:id', adminOrToken, (req, res) => {
  const group = prepare('SELECT * FROM groups WHERE code = ?').get(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const expense = prepare('SELECT * FROM expenses WHERE id = ? AND group_id = ?').get(req.params.id, group.id);
  if (!expense) return res.status(404).json({ error: 'Expense not found' });
  prepare('DELETE FROM splits WHERE expense_id = ?').run(req.params.id);
  prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  saveDb();
  res.json({ success: true });
});

// ==================== SETTLEMENT ROUTES ====================

app.post('/api/v1/groups/:code/settlements', (req, res) => {
  const group = prepare('SELECT * FROM groups WHERE code = ?').get(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const { from_id, to_id, amount } = req.body;

  if (!from_id || !to_id) return res.status(400).json({ error: 'from_id and to_id are required' });
  if (from_id === to_id) return res.status(400).json({ error: 'Cannot settle with yourself' });
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Amount must be greater than $0' });

  const fromMember = prepare('SELECT id, name FROM members WHERE id = ? AND group_id = ?').get(from_id, group.id);
  const toMember = prepare('SELECT id, name FROM members WHERE id = ? AND group_id = ?').get(to_id, group.id);
  if (!fromMember || !toMember) return res.status(400).json({ error: 'Both parties must be members' });

  const debts = calculateSimplifiedDebts(group.id);
  const outstandingFromTo = debts.transactions
    .filter(t => t.from.id === from_id && t.to.id === to_id)
    .reduce((sum, t) => sum + t.amount, 0);
  if (outstandingFromTo > 0 && amount > outstandingFromTo + 0.01) {
    return res.status(400).json({ error: `Amount exceeds what ${fromMember.name} owes ${toMember.name} ($${outstandingFromTo.toFixed(2)})` });
  }

  const id = uuidv4();
  try {
    prepare('INSERT INTO settlements (id, group_id, from_id, to_id, amount) VALUES (?, ?, ?, ?, ?)')
      .run(id, group.id, from_id, to_id, Math.round(amount * 100) / 100);
    saveDb();
    const settlement = prepare(
      'SELECT s.*, m1.name as from_name, m2.name as to_name FROM settlements s JOIN members m1 ON s.from_id = m1.id JOIN members m2 ON s.to_id = m2.id WHERE s.id = ?'
    ).get(id);
    res.status(201).json(settlement);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to record settlement' });
  }
});

app.patch('/api/v1/groups/:code/settlements/:id', (req, res) => {
  const group = prepare('SELECT * FROM groups WHERE code = ?').get(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const settlement = prepare('SELECT * FROM settlements WHERE id = ? AND group_id = ?').get(req.params.id, group.id);
  if (!settlement) return res.status(404).json({ error: 'Settlement not found' });

  const { status } = req.body;
  if (!['confirmed', 'disputed'].includes(status)) return res.status(400).json({ error: 'Status must be confirmed or disputed' });

  prepare('UPDATE settlements SET status = ? WHERE id = ?').run(status, req.params.id);
  saveDb();
  const updated = prepare(
    'SELECT s.*, m1.name as from_name, m2.name as to_name FROM settlements s JOIN members m1 ON s.from_id = m1.id JOIN members m2 ON s.to_id = m2.id WHERE s.id = ?'
  ).get(req.params.id);
  res.json(updated);
});

// ==================== START ====================

async function start() {
  await initDb();
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`SplitDumb server running on port ${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});