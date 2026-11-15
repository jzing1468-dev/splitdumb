const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { COOKIE_NAME, AUTH_SERVICE, requireAdmin, requireAuth, parseCookies, verifySession } = require('./auth');
const { init: initDb, prepare, exec: execDb, saveDb, markDirty } = require('./db');
const { calculateSplits, buildNightsData, CATEGORIES } = require('./splitCalc');
const { calculateSimplifiedDebts, nameToColor, nextColorForGroup, validateNote, validateNotePatch,
  validateStay, validateTravelPlan, validateList, validateListPatch, validateListItem, validateListItemPatch,
  LIST_KINDS, TRAVEL_STATUSES } = require('@splitdumb/core');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Multer config for receipt uploads
const UPLOAD_DIR = path.join(__dirname, 'uploads');

const storage = multer.diskStorage({
  // Created lazily so importing the app (e.g. in tests) never touches the disk.
  destination: (req, file, cb) => {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${req.params.id}-${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|pdf/;
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype;
    if (allowed.test(ext) || mime.startsWith('image/') || mime === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only images and PDFs allowed'));
    }
  },
});

// ---- One-shot statement helpers ----
// prepare() allocates a new sql.js statement per call; free it when done so
// repeated requests do not grow memory without bound.

function runOnce(sql, ...args) {
  const stmt = prepare(sql);
  try { return stmt.run(...args); } finally { stmt.free(); }
}

function getOnce(sql, ...args) {
  const stmt = prepare(sql);
  try { return stmt.get(...args); } finally { stmt.free(); }
}

function allOnce(sql, ...args) {
  const stmt = prepare(sql);
  try { return stmt.all(...args); } finally { stmt.free(); }
}

// ---- Actor & Audit ----

// Resolve X-Member-Id → req.actor
function resolveActor(req, res, next) {
  const memberId = req.headers['x-member-id'];
  if (!memberId) { req.actor = null; return next(); }
  // Delayed lookup: we need group context. Do it in route handler.
  req.actorId = memberId;
  next();
}

function getGroupByCode(code) {
  return getOnce('SELECT * FROM groups WHERE code = ?', code);
}

function auditLog(req, action, entityType, entityId = null, changes = null) {
  // Lookup actor name from member_id
  let actorName = null;
  if (req.actorId) {
    try {
      const group = getOnce('SELECT id FROM groups WHERE code = ?', req.params?.code);
      if (group) {
        const m = getOnce('SELECT name FROM members WHERE id = ? AND group_id = ?', req.actorId, group.id);
        if (m) actorName = m.name;
      }
    } catch {}
  }
  const entry = {
    group_id: null,
    member_id: req.actorId || null,
    member_name: actorName,
    action,
    entity_type: entityType,
    entity_id: entityId || null,
    changes: changes ? JSON.stringify(changes) : null,
  };
  if (req.params?.code) {
    const g = getOnce('SELECT id FROM groups WHERE code = ?', req.params.code);
    if (g) entry.group_id = g.id;
  }
  try {
    runOnce('INSERT INTO audit_log (group_id, member_id, member_name, action, entity_type, entity_id, changes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      entry.group_id, entry.member_id, entry.member_name, entry.action, entry.entity_type, entry.entity_id, entry.changes);
  } catch (e) {
    console.error('audit_log insert failed:', e.message);
  }
}

const app = express();
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()) : true,
  credentials: true,
}));
app.use(express.json());
app.use(resolveActor);

// Disable caching for all API responses
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

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

// nameToColor, nextColorForGroup, calculateSimplifiedDebts are now imported from @splitdumb/core

/**
 * Server wrapper: gather data from DB, then call core's pure calculateSimplifiedDebts.
 */
function calculateSimplifiedDebtsFromDb(groupId) {
  const members = prepare('SELECT id, name FROM members WHERE group_id = ?').all(groupId);
  const expenses = prepare('SELECT id, payer_id, amount, payers_data FROM expenses WHERE group_id = ?').all(groupId);
  const allSplits = prepare(
    'SELECT s.expense_id, s.member_id, s.share FROM splits s JOIN expenses e ON s.expense_id = e.id WHERE e.group_id = ?'
  ).all(groupId);
  const settlements = prepare(
    "SELECT from_id, to_id, amount FROM settlements WHERE group_id = ? AND status = 'confirmed'"
  ).all(groupId);
  return calculateSimplifiedDebts(members, expenses, allSplits, settlements);
}

// Admin middleware is now requireAdmin (from auth.js) — session cookie only, no per-group tokens

// ==================== AUTH ROUTES ====================
// Login/logout handled by auth service — redirect there
app.get('/api/v1/auth/me', requireAuth, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role });
});

// Logout: clear the session cookie (same-origin, reliable in all browsers)
app.post('/api/v1/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', [
    `johnzhong_session=`,
    `Domain=${process.env.COOKIE_DOMAIN || '.johnzhong.win'}`,
    `Path=/`,
    `HttpOnly`,
    `Secure`,
    `SameSite=Lax`,
    `Max-Age=0`,
  ].join('; '));
  res.json({ ok: true });
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

// ==================== AUDIT ROUTES ====================

app.get('/api/v1/groups/:code/audit', (req, res) => {
  const group = getGroupByCode(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  // Clamp limit to 1..200; invalid or missing falls back to 50.
  let limit = parseInt(req.query.limit, 10);
  if (!Number.isFinite(limit)) limit = 50;
  limit = Math.max(1, Math.min(200, limit));
  const log = allOnce(
    'SELECT * FROM audit_log WHERE group_id = ? ORDER BY created_at DESC LIMIT ?',
    group.id, limit
  );
  const parsed = log.map(entry => {
    try {
      return { ...entry, changes: entry.changes ? JSON.parse(entry.changes) : null };
    } catch {
      return { ...entry, changes: null };
    }
  });
  res.json(parsed);
});

// ==================== GROUP ROUTES ====================

app.post('/api/v1/groups', requireAdmin, (req, res) => {
  const { name, passcode } = req.body;
  if (!name || name.trim().length === 0 || name.length > 50) {
    return res.status(400).json({ error: 'Group name must be 1-50 characters' });
  }
  const id = uuidv4();
  const code = generateUniqueCode();
  // Keep generating admin_token for DB backward compat, but don't return it
  const adminToken = generateCode() + generateCode();
  try {
    prepare('INSERT INTO groups (id, name, code, admin_token, passcode) VALUES (?, ?, ?, ?, ?)')
      .run(id, name.trim(), code, adminToken, passcode || null);
    const group = prepare('SELECT * FROM groups WHERE id = ?').get(id);
    auditLog(req, 'create', 'group', id, { name: name.trim(), code });
    // Strip admin_token from response
    const { admin_token, ...safeGroup } = group;
    res.status(201).json(safeGroup);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

app.get('/api/v1/groups/:code', (req, res) => {
  const group = prepare('SELECT * FROM groups WHERE code = ?').get(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  // Strip admin_token from group response
  const { admin_token, ...safeGroup } = group;

  const members = prepare('SELECT * FROM members WHERE group_id = ?').all(group.id);
  const expenses = prepare(
    'SELECT e.*, m.name as payer_name, (SELECT COUNT(*) FROM attachments WHERE expense_id = e.id) as attachment_count FROM expenses e JOIN members m ON e.payer_id = m.id WHERE e.group_id = ? ORDER BY e.created_at DESC'
  ).all(group.id);

  const expensesWithSplits = expenses.map(exp => {
    const splits = prepare(
      'SELECT s.member_id, s.share, m.name as member_name FROM splits s JOIN members m ON s.member_id = m.id WHERE s.expense_id = ?'
    ).all(exp.id);
    let payerDisplay = exp.payer_name;
    let payerIsMulti = false;
    if (exp.payers_data) {
      try {
        const payers = JSON.parse(exp.payers_data);
        if (payers.length > 0) {
          payerIsMulti = true;
          payerDisplay = payers.map(p => {
            const m = prepare('SELECT name FROM members WHERE id = ?').get(p.member_id);
            return m ? `${m.name} ($${Number(p.amount).toFixed(2)})` : '?';
          }).join(' + ');
        }
      } catch {}
    }
    return { ...exp, splits, payer_name: payerDisplay, payer_is_multi: payerIsMulti };
  });

  const settlements = prepare(
    'SELECT s.*, m1.name as from_name, m2.name as to_name FROM settlements s JOIN members m1 ON s.from_id = m1.id JOIN members m2 ON s.to_id = m2.id WHERE s.group_id = ? ORDER BY s.created_at DESC'
  ).all(group.id);

  // Notes via LEFT JOIN so notes whose author is gone still appear; author
  // name falls back live member > notes.author_name snapshot > 'Former member'.
  let notes;
  {
    const stmt = prepare(
      'SELECT n.*, m.name as live_name FROM notes n LEFT JOIN members m ON n.author_member_id = m.id WHERE n.group_id = ? ORDER BY n.pinned DESC, n.created_at DESC'
    );
    try { notes = stmt.all(group.id).map(noteJson); } finally { stmt.free(); }
  }

  const debtInfo = calculateSimplifiedDebtsFromDb(group.id);

  res.json({
    ...safeGroup,
    members,
    expenses: expensesWithSplits,
    settlements,
    notes,
    balances: debtInfo.balances,
    simplifiedDebts: debtInfo.transactions
  });
});

app.delete('/api/v1/groups/:code', requireAdmin, (req, res) => {
  const group = prepare('SELECT * FROM groups WHERE code = ?').get(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  auditLog(req, 'delete', 'group', group.id, { name: group.name, code: group.code });
  // Delete cascading: settlements, splits, expenses, notes, members, then group
  prepare('DELETE FROM settlements WHERE group_id = ?').run(group.id);
  prepare('DELETE FROM notes WHERE group_id = ?').run(group.id);
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
  const changes = {};
  try {
    if (name && name.trim().length > 0) {
      prepare('UPDATE groups SET name = ? WHERE id = ?').run(name.trim(), group.id);
      changes.name = name.trim();
    }
    if (newPasscode !== undefined) {
      prepare('UPDATE groups SET passcode = ? WHERE id = ?').run(newPasscode || null, group.id);
      changes.passcode = '***';
    }
    saveDb();
    auditLog(req, 'update', 'group', group.id, changes);
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
  const memberCountResult = prepare('SELECT COUNT(*) as count FROM members WHERE group_id = ?').get(group.id);
  if ((memberCountResult?.count || 0) >= 20) {
    return res.status(400).json({ error: 'Maximum 20 members per group' });
  }
  const existing = prepare('SELECT id FROM members WHERE group_id = ? AND LOWER(name) = LOWER(?)').get(group.id, name.trim());
  if (existing) {
    return res.status(409).json({ error: 'That name is already in this group' });
  }
  const id = uuidv4();
  const color = nextColorForGroup(memberCountResult?.count || 0);
  try {
    prepare('INSERT INTO members (id, group_id, name, color) VALUES (?, ?, ?, ?)')
      .run(id, group.id, name.trim(), color);
    saveDb();
    auditLog(req, 'create', 'member', id, { name: name.trim(), group_code: group.code });
    const member = prepare('SELECT * FROM members WHERE id = ?').get(id);
    res.status(201).json(member);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// Edit member profile (name, venmo, zelle)
app.patch('/api/v1/groups/:code/members/:id', (req, res) => {
  const group = prepare('SELECT * FROM groups WHERE code = ?').get(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const member = prepare('SELECT * FROM members WHERE id = ? AND group_id = ?').get(req.params.id, group.id);
  if (!member) return res.status(404).json({ error: 'Member not found' });

  const { name, venmo_link, zelle_handle } = req.body;
  const updates = [];
  const values = [];
  const changes = {};

  if (name !== undefined) {
    if (!name || name.trim().length === 0 || name.trim().length > 30) {
      return res.status(400).json({ error: 'Member name must be 1-30 characters' });
    }
    const existing = prepare('SELECT id FROM members WHERE group_id = ? AND LOWER(name) = LOWER(?) AND id != ?').get(group.id, name.trim(), req.params.id);
    if (existing) {
      return res.status(409).json({ error: 'That name is already in this group' });
    }
    updates.push('name = ?');
    values.push(name.trim());
    changes.name = { from: member.name, to: name.trim() };
  }

  if (venmo_link !== undefined) {
    // Accept: venmo.com/username, @username, full URL, venmo.com/code?user_id=..., or empty to clear
    let normalized = venmo_link ? venmo_link.trim() : null;
    if (normalized) {
      // Strip https?:// prefix for consistent storage
      normalized = normalized.replace(/^https?:\/\/(www\.)?/, '');
      // Strip @ prefix and treat as username
      if (normalized.startsWith('@')) {
        normalized = 'venmo.com/' + normalized.slice(1);
      } else if (!normalized.startsWith('venmo.com') && !normalized.startsWith('http')) {
        // Plain username — wrap in venmo.com/
        normalized = 'venmo.com/' + normalized;
      }
      // Validation: accept venmo.com/username OR venmo.com/code?user_id=...
      const isUsername = /^venmo\.com\/[A-Za-z0-9_.-]+$/.test(normalized);
      const isCodeLink = /^venmo\.com\/code\?user_id=\d+/.test(normalized);
      if (!isUsername && !isCodeLink) {
        return res.status(400).json({ error: 'Venmo link must be venmo.com/username, @username, or a venmo.com/code?user_id=... link' });
      }
    }
    updates.push('venmo_link = ?');
    values.push(normalized);
    changes.venmo_link = normalized ? '***' : null;
  }

  if (zelle_handle !== undefined) {
    const normalized = zelle_handle ? zelle_handle.trim() : null;
    if (normalized && normalized.length > 100) {
      return res.status(400).json({ error: 'Zelle handle too long' });
    }
    updates.push('zelle_handle = ?');
    values.push(normalized);
    changes.zelle_handle = normalized ? '***' : null;
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  try {
    prepare(`UPDATE members SET ${updates.join(', ')} WHERE id = ?`).run(...values, req.params.id);
    saveDb();
    auditLog(req, 'update', 'member', req.params.id, changes);
    const updated = prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update member' });
  }
});

app.delete('/api/v1/groups/:code/members/:id', requireAdmin, (req, res) => {
  const group = getGroupByCode(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const member = getOnce('SELECT * FROM members WHERE id = ? AND group_id = ?', req.params.id, group.id);
  if (!member) return res.status(404).json({ error: 'Member not found' });

  const force = req.query.force === 'true';
  const debts = calculateSimplifiedDebtsFromDb(group.id);
  const balance = debts.balances[member.id]?.balance || 0;

  if (!force && Math.abs(balance) > 0.01) {
    return res.status(400).json({
      error: `Cannot remove ${member.name} — outstanding balance of $${balance.toFixed(2)}. Use ?force=true to override.`,
      balance
    });
  }

  try {
    // Snapshot the departing member's name onto their notes, then detach
    // authorship so the notes survive the removal (author_member_id is
    // nullable since the notes migration).
    runOnce(
      'UPDATE notes SET author_name = ?, author_member_id = NULL WHERE author_member_id = ? AND group_id = ?',
      member.name, req.params.id, group.id
    );
    // Remove member's splits
    runOnce('DELETE FROM splits WHERE member_id = ?', req.params.id);
    // Remove expenses where this member was the payer
    const solePayerExpenses = allOnce('SELECT id FROM expenses WHERE payer_id = ? AND group_id = ?', req.params.id, group.id);
    solePayerExpenses.forEach(e => {
      runOnce('DELETE FROM splits WHERE expense_id = ?', e.id);
      runOnce('DELETE FROM expenses WHERE id = ?', e.id);
    });
    // Remove settlements involving this member
    runOnce("DELETE FROM settlements WHERE (from_id = ? OR to_id = ?) AND group_id = ?",
      req.params.id, req.params.id, group.id);
    // Group utilities: the member's travel plans go with them; their list
    // item assignments detach (items stay readable, assignee_name nulls).
    runOnce('DELETE FROM travel_plans WHERE member_id = ?', req.params.id);
    runOnce('UPDATE list_items SET assignee_id = NULL WHERE assignee_id = ?', req.params.id);
    // Remove the member
    runOnce('DELETE FROM members WHERE id = ? AND group_id = ?', req.params.id, group.id);
    saveDb();
    auditLog(req, 'delete', 'member', req.params.id, { name: member.name, balance: Math.round(balance * 100) / 100, force });
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
  const { description, amount, payer_id, split_type, split_among, exact_amounts, percentages, shares: sharesInput, nights: nightsInput, nights_mode, calc_method: calcMethod, num_nights, date, date_range_start, date_range_end, created_by, category, notes, payers } = req.body;

  if (!description || description.trim().length === 0) return res.status(400).json({ error: 'Description is required' });
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Amount must be greater than $0' });
  if (!payer_id) return res.status(400).json({ error: 'Payer is required' });

  // Validate category if provided
  if (category && !CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `Invalid category. Must be one of: ${CATEGORIES.join(', ')}` });
  }
  // Truncate notes
  const safeNotes = notes ? notes.substring(0, 500) : null;

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

  const roundedAmount = Math.round(amount * 100) / 100;
  const { shares, error: splitError } = calculateSplits(type, roundedAmount, splitMemberIds, {
    sharesInput,
    nightsInput,
    nightsMode: nights_mode,
    dateRangeStart: date_range_start,
    dateRangeEnd: date_range_end,
    numNights: num_nights,
    calcMethod: calcMethod,
    exactAmounts: exact_amounts,
    percentages,
  });
  if (splitError) return res.status(400).json({ error: splitError });

  // Anti-fat-finger
  const recent = prepare(
    "SELECT id FROM expenses WHERE group_id = ? AND payer_id = ? AND description = ? AND amount = ? AND created_at > datetime('now', '-1 minute')"
  ).get(group.id, payer_id, description.trim(), roundedAmount);
  if (recent) return res.status(409).json({ error: 'Duplicate expense — similar expense was added in the last minute' });

  const id = uuidv4();
  const expenseDate = date || new Date().toISOString().split('T')[0];

  // Build nights_data: store member-day matrix with mode + calc metadata
  let nightsDataJson = null;
  let drStart = null;
  let drEnd = null;
  if (type === 'nights') {
    const nightData = buildNightsData(nightsInput, {
      nightsMode: nights_mode,
      dateRangeStart: date_range_start,
      dateRangeEnd: date_range_end,
      numNights: num_nights,
      calcMethod: calcMethod,
    });
    nightsDataJson = nightData.json;
    drStart = nightData.drStart;
    drEnd = nightData.drEnd;
  }

  try {
    const payersDataJson = payers && payers.length > 0 ? JSON.stringify(payers) : null;

    const sharesDataJson = (type === 'shares' && sharesInput) ? JSON.stringify(sharesInput) : null;
    prepare('INSERT INTO expenses (id, group_id, description, amount, payer_id, split_type, date, created_by, date_range_start, date_range_end, nights_data, category, notes, payers_data, shares_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, group.id, description.trim(), roundedAmount, payer_id, type, expenseDate, created_by || null, drStart, drEnd, nightsDataJson, category || null, safeNotes, payersDataJson, sharesDataJson);
    for (const [mid, share] of Object.entries(shares)) {
      prepare('INSERT INTO splits (expense_id, member_id, share) VALUES (?, ?, ?)').run(id, mid, share);
    }
    saveDb();
    const payerName = prepare('SELECT name FROM members WHERE id = ?').get(payer_id)?.name || 'unknown';
    auditLog(req, 'create', 'expense', id, {
      description: description.trim(),
      amount: roundedAmount,
      payer: payerName,
      split_type: type,
      date: expenseDate,
      ...(category ? { category } : {}),
      ...(safeNotes ? { notes: safeNotes } : {}),
      splits: Object.fromEntries(Object.entries(shares).map(([mid, s]) => {
        const mn = prepare('SELECT name FROM members WHERE id = ?').get(mid);
        return [mn?.name || mid, s];
      }))
    });
    const expense = prepare('SELECT * FROM expenses WHERE id = ?').get(id);
    const splits = prepare('SELECT s.member_id, s.share, m.name as member_name FROM splits s JOIN members m ON s.member_id = m.id WHERE s.expense_id = ?').all(id);
    res.status(201).json({ ...expense, splits });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add expense' });
  }
});

// Edit expense (anyone can edit)
app.patch('/api/v1/groups/:code/expenses/:id', (req, res) => {
  const group = prepare('SELECT * FROM groups WHERE code = ?').get(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const expense = prepare('SELECT * FROM expenses WHERE id = ? AND group_id = ?').get(req.params.id, group.id);
  if (!expense) return res.status(404).json({ error: 'Expense not found' });

  const { description, amount, payer_id, split_type, split_among, exact_amounts, percentages, shares: sharesInput, nights: nightsInput, nights_mode, calc_method: calcMethod, num_nights, date, date_range_start, date_range_end, category, notes, payers } = req.body;

  // Build update fields
  const updates = [];
  const values = [];

  if (description !== undefined) {
    if (description.trim().length === 0) return res.status(400).json({ error: 'Description cannot be empty' });
    updates.push('description = ?');
    values.push(description.trim());
  }
  if (amount !== undefined) {
    if (amount <= 0) return res.status(400).json({ error: 'Amount must be > 0' });
    updates.push('amount = ?');
    values.push(Math.round(amount * 100) / 100);
  }
  if (payer_id !== undefined) {
    const payer = prepare('SELECT id FROM members WHERE id = ? AND group_id = ?').get(payer_id, group.id);
    if (!payer) return res.status(400).json({ error: 'Payer must be a member' });
    updates.push('payer_id = ?');
    values.push(payer_id);
  }
  if (date !== undefined) {
    updates.push('date = ?');
    values.push(date);
  }
  if (category !== undefined) {
    const CATEGORIES = ['groceries', 'dining', 'transport', 'accommodation', 'entertainment', 'utilities', 'health'];
    if (category && !CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `Invalid category: ${category}` });
    }
    updates.push('category = ?');
    values.push(category || null);
  }
  if (notes !== undefined) {
    updates.push('notes = ?');
    values.push(notes ? notes.substring(0, 500) : null);
  }

  // If amount, split_type, or split_among changed, recalculate splits
  const newAmount = amount !== undefined ? amount : expense.amount;
  const newType = split_type || expense.split_type;
  const members = prepare('SELECT id FROM members WHERE group_id = ?').all(group.id);
  const memberIds = new Set(members.map(m => m.id));

  let needsResplit = split_type || amount || split_among || sharesInput || exact_amounts || percentages || nightsInput || nights_mode || calcMethod;
  let resolvedSplits = null;
  let nightsDataJson = null;
  let drStart = null;
  let drEnd = null;

  if (needsResplit) {
    let splitMemberIds;
    if (split_among && split_among.length > 0) {
      for (const mid of split_among) {
        if (!memberIds.has(mid)) return res.status(400).json({ error: `Member ${mid} not in group` });
      }
      splitMemberIds = split_among;
    } else {
      const existingSplits = prepare('SELECT member_id FROM splits WHERE expense_id = ?').all(expense.id);
      splitMemberIds = existingSplits.map(s => s.member_id);
    }
    if (splitMemberIds.length === 0) return res.status(400).json({ error: 'At least one person must be in the split' });

    const roundedAmount = Math.round(newAmount * 100) / 100;
    const { shares: newSplits, error: splitError } = calculateSplits(newType, roundedAmount, splitMemberIds, {
      sharesInput,
      nightsInput,
      nightsMode: nights_mode,
      dateRangeStart: date_range_start || expense.date_range_start,
      dateRangeEnd: date_range_end || expense.date_range_end,
      numNights: num_nights,
      calcMethod: calcMethod,
      exactAmounts: exact_amounts,
      percentages,
    });
    resolvedSplits = newSplits;
    if (splitError) return res.status(400).json({ error: splitError });

    updates.push('split_type = ?');
    values.push(newType);

    // Handle nights-specific columns
    if (newType === 'nights') {
      const nightData = buildNightsData(nightsInput, {
        nightsMode: nights_mode,
        dateRangeStart: date_range_start || expense.date_range_start,
        dateRangeEnd: date_range_end || expense.date_range_end,
        numNights: num_nights,
        calcMethod: calcMethod,
      });
      nightsDataJson = nightData.json;
      drStart = nightData.drStart;
      drEnd = nightData.drEnd;
      updates.push('nights_data = ?');
      values.push(nightsDataJson);
      updates.push('date_range_start = ?');
      values.push(drStart);
      updates.push('date_range_end = ?');
      values.push(drEnd);
    } else {
      updates.push('nights_data = ?');
      values.push(null);
      updates.push('date_range_start = ?');
      values.push(null);
      updates.push('date_range_end = ?');
      values.push(null);
    }

    // Handle payers_data
    if (payers !== undefined) {
      updates.push('payers_data = ?');
      values.push(payers && payers.length > 0 ? JSON.stringify(payers) : null);
    }

    // Handle shares_data
    if (newType === 'shares' && sharesInput) {
      updates.push('shares_data = ?');
      values.push(JSON.stringify(sharesInput));
    } else if (newType !== 'shares') {
      updates.push('shares_data = ?');
      values.push(null);
    }
  }

  try {
    if (updates.length > 0) {
      prepare(`UPDATE expenses SET ${updates.join(', ')} WHERE id = ?`).run(...values, expense.id);
    }
    if (resolvedSplits) {
      prepare('DELETE FROM splits WHERE expense_id = ?').run(expense.id);
      for (const [mid, share] of Object.entries(resolvedSplits)) {
        prepare('INSERT INTO splits (expense_id, member_id, share) VALUES (?, ?, ?)').run(expense.id, mid, share);
      }
    }
    saveDb();
    auditLog(req, 'update', 'expense', expense.id, req.body);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to update expense' });
  }

  const updated = prepare('SELECT * FROM expenses WHERE id = ?').get(expense.id);
  const splits = prepare('SELECT s.member_id, s.share, m.name as member_name FROM splits s JOIN members m ON s.member_id = m.id WHERE s.expense_id = ?').all(expense.id);
  res.json({ ...updated, splits });
});

app.delete('/api/v1/groups/:code/expenses/:id', (req, res) => {
  const group = prepare('SELECT * FROM groups WHERE code = ?').get(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const expense = prepare('SELECT * FROM expenses WHERE id = ? AND group_id = ?').get(req.params.id, group.id);
  if (!expense) return res.status(404).json({ error: 'Expense not found' });
  prepare('DELETE FROM splits WHERE expense_id = ?').run(req.params.id);
  prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  // Delete associated attachments
  const attachments = prepare('SELECT * FROM attachments WHERE expense_id = ?').all(req.params.id);
  attachments.forEach(a => {
    try { fs.unlinkSync(a.path); } catch {}
  });
  prepare('DELETE FROM attachments WHERE expense_id = ?').run(req.params.id);
  saveDb();
  auditLog(req, 'delete', 'expense', req.params.id, expense);
  res.json({ success: true });
});

// ==================== ATTACHMENT ROUTES ====================

// Upload receipt to an expense
app.post('/api/v1/groups/:code/expenses/:id/attachments', upload.single('receipt'), (req, res) => {
  const group = prepare('SELECT * FROM groups WHERE code = ?').get(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const expense = prepare('SELECT * FROM expenses WHERE id = ? AND group_id = ?').get(req.params.id, group.id);
  if (!expense) return res.status(404).json({ error: 'Expense not found' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const id = uuidv4();
  prepare('INSERT INTO attachments (id, expense_id, filename, mimetype, size, path) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, req.params.id, req.file.originalname, req.file.mimetype, req.file.size, req.file.path);
  saveDb();
  auditLog(req, 'upload', 'attachment', id, { expense_id: req.params.id, filename: req.file.originalname });
  res.status(201).json({ id, filename: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size });
});

// List attachments for an expense
app.get('/api/v1/groups/:code/expenses/:id/attachments', (req, res) => {
  const group = prepare('SELECT * FROM groups WHERE code = ?').get(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const attachments = prepare('SELECT id, filename, mimetype, size, created_at FROM attachments WHERE expense_id = ?').all(req.params.id);
  res.json(attachments);
});

// Serve attachment file
app.get('/api/v1/attachments/:id/file', (req, res) => {
  const att = prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.id);
  if (!att) return res.status(404).json({ error: 'Attachment not found' });
  if (!fs.existsSync(att.path)) return res.status(404).json({ error: 'File not found on disk' });
  res.sendFile(att.path);
});

// Delete attachment
app.delete('/api/v1/attachments/:id', (req, res) => {
  const att = prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.id);
  if (!att) return res.status(404).json({ error: 'Attachment not found' });
  try { fs.unlinkSync(att.path); } catch {}
  prepare('DELETE FROM attachments WHERE id = ?').run(req.params.id);
  saveDb();
  auditLog(req, 'delete', 'attachment', req.params.id, { filename: att.filename });
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

  const debts = calculateSimplifiedDebtsFromDb(group.id);
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
    auditLog(req, 'create', 'settlement', id, {
      from: fromMember.name,
      to: toMember.name,
      amount: Math.round(amount * 100) / 100
    });
    const settlement = prepare(
      'SELECT s.*, m1.name as from_name, m2.name as to_name FROM settlements s JOIN members m1 ON s.from_id = m1.id JOIN members m2 ON s.to_id = m2.id WHERE s.id = ?'
    ).get(id);
    res.status(201).json(settlement);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to record settlement' });
  }
});

app.delete('/api/v1/groups/:code/settlements/:id', (req, res) => {
  const group = prepare('SELECT * FROM groups WHERE code = ?').get(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const settlement = prepare('SELECT * FROM settlements WHERE id = ? AND group_id = ?').get(req.params.id, group.id);
  if (!settlement) return res.status(404).json({ error: 'Settlement not found' });

  // Confirmed settlements are netted into balances — they can't be cancelled, only disputed records corrected
  if (settlement.status === 'confirmed') {
    return res.status(400).json({ error: 'Confirmed settlements cannot be deleted' });
  }

  prepare('DELETE FROM settlements WHERE id = ?').run(req.params.id);
  saveDb();
  const fromName = prepare('SELECT name FROM members WHERE id = ?').get(settlement.from_id)?.name || '?';
  const toName = prepare('SELECT name FROM members WHERE id = ?').get(settlement.to_id)?.name || '?';
  auditLog(req, 'delete', 'settlement', req.params.id, { from: fromName, to: toName, amount: settlement.amount });
  res.json({ ok: true });
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
  const fromName = prepare('SELECT name FROM members WHERE id = ?').get(settlement.from_id)?.name || '?';
  const toName = prepare('SELECT name FROM members WHERE id = ?').get(settlement.to_id)?.name || '?';
  auditLog(req, status, 'settlement', req.params.id, { from: fromName, to: toName, amount: settlement.amount });
  const updated = prepare(
    'SELECT s.*, m1.name as from_name, m2.name as to_name FROM settlements s JOIN members m1 ON s.from_id = m1.id JOIN members m2 ON s.to_id = m2.id WHERE s.id = ?'
  ).get(req.params.id);
  res.json(updated);
});

// ==================== NOTES ROUTES ====================

// Normalize SQLite datetime('now') strings ('YYYY-MM-DD HH:MM:SS', UTC) into
// ISO 8601 UTC with 'T' and 'Z' (contract format, set from JS for new writes).
function normalizeDbTime(value) {
  if (typeof value !== 'string') return value ?? null;
  const m = value.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/);
  if (m) return `${m[1]}T${m[2]}.000Z`;
  return value;
}

// Note JSON contract: { id, title, body, pinned, author_member_id, author_name,
// created_at, updated_at, revision }. author_name prefers the live member
// name, then the notes.author_name snapshot, then 'Former member'.
function noteJson(row) {
  return {
    id: row.id,
    title: row.title ?? null,
    body: row.body,
    pinned: !!row.pinned,
    author_member_id: row.author_member_id ?? null,
    author_name: row.live_name || row.author_name || 'Former member',
    created_at: normalizeDbTime(row.created_at),
    updated_at: normalizeDbTime(row.updated_at),
    revision: row.revision ?? 1,
  };
}

const NOTE_SELECT = 'SELECT n.*, m.name as live_name FROM notes n LEFT JOIN members m ON n.author_member_id = m.id';

function getNoteJson(noteId) {
  const row = getOnce(`${NOTE_SELECT} WHERE n.id = ?`, noteId);
  return row ? noteJson(row) : null;
}

function asObject(body) {
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

app.post('/api/v1/groups/:code/notes', (req, res) => {
  const group = getGroupByCode(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const payload = asObject(req.body);
  const validationError = validateNote(payload);
  if (validationError) return res.status(400).json({ error: validationError });
  if (!req.actorId) return res.status(400).json({ error: 'X-Member-Id header required' });
  const author = getOnce('SELECT id, name FROM members WHERE id = ? AND group_id = ?', req.actorId, group.id);
  if (!author) return res.status(400).json({ error: 'Author must be a member of this group' });

  const id = uuidv4();
  const now = new Date().toISOString();
  const title = payload.title !== undefined ? (payload.title.trim() || null) : null;
  const body = payload.body.trim();
  try {
    runOnce(
      'INSERT INTO notes (id, group_id, author_member_id, title, body, pinned, created_at, updated_at, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, group.id, author.id, title, body, payload.pinned ? 1 : 0, now, now, 1
    );
    saveDb();
    auditLog(req, 'create', 'note', id, { title: title || body.slice(0, 50) });
    res.status(201).json(getNoteJson(id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create note' });
  }
});

app.patch('/api/v1/groups/:code/notes/:id', (req, res) => {
  const group = getGroupByCode(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const payload = asObject(req.body);
  const validationError = validateNotePatch(payload);
  if (validationError) return res.status(400).json({ error: validationError });

  const note = getOnce('SELECT * FROM notes WHERE id = ? AND group_id = ?', req.params.id, group.id);
  if (!note) return res.status(404).json({ error: 'Note not found' });

  // Optimistic concurrency: a matching integer expected_revision is required
  // to apply the edit; a stale one returns the current note for a 409.
  if (payload.expected_revision !== undefined && payload.expected_revision !== note.revision) {
    return res.status(409).json({ error: 'Note was edited by someone else', note: getNoteJson(req.params.id) });
  }

  const hasContent = ['title', 'body', 'pinned'].some(k => payload[k] !== undefined);
  const sets = [];
  const values = [];
  if (payload.title !== undefined) {
    sets.push('title = ?');
    values.push(payload.title.trim() || null);
  }
  if (payload.body !== undefined) {
    sets.push('body = ?');
    values.push(payload.body.trim());
  }
  if (payload.pinned !== undefined) {
    sets.push('pinned = ?');
    values.push(payload.pinned ? 1 : 0);
  }
  if (hasContent) {
    sets.push('revision = revision + 1');
    sets.push('updated_at = ?');
    values.push(new Date().toISOString());
  }

  try {
    if (sets.length > 0) {
      runOnce(`UPDATE notes SET ${sets.join(', ')} WHERE id = ?`, ...values, req.params.id);
      saveDb();
    }
    auditLog(req, 'update', 'note', req.params.id, {
      ...(payload.title !== undefined ? { title: payload.title.trim() } : {}),
      ...(payload.body !== undefined ? { body: payload.body.trim().slice(0, 50) } : {}),
      ...(payload.pinned !== undefined ? { pinned: payload.pinned } : {}),
    });
    res.json(getNoteJson(req.params.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

app.delete('/api/v1/groups/:code/notes/:id', (req, res) => {
  const group = getGroupByCode(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const note = getOnce('SELECT * FROM notes WHERE id = ? AND group_id = ?', req.params.id, group.id);
  if (!note) return res.status(404).json({ error: 'Note not found' });

  try {
    runOnce('DELETE FROM notes WHERE id = ?', req.params.id);
    saveDb();
    auditLog(req, 'delete', 'note', req.params.id, { title: note.title || note.body.slice(0, 50) });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

// ==================== GROUP UTILITIES (info / stay / travel plans / lists) ===

// Datetime fields here are LOCAL wall-clock text as typed by users — stored
// verbatim (trimmed), never converted to UTC. ISO timestamps (created_at /
// updated_at) are new Date().toISOString().

function stayJson(row) {
  return {
    id: row.id,
    title: row.title ?? null,
    address: row.address ?? null,
    listing_url: row.listing_url ?? null,
    checkin_at: row.checkin_at ?? null,
    checkout_at: row.checkout_at ?? null,
    timezone: row.timezone ?? null,
    instructions: row.instructions ?? null,
    parking: row.parking ?? null,
    wifi: row.wifi ?? null,
    contact_name: row.contact_name ?? null,
    contact_phone: row.contact_phone ?? null,
    created_at: normalizeDbTime(row.created_at),
    updated_at: normalizeDbTime(row.updated_at),
    revision: row.revision ?? 1,
  };
}

function travelPlanJson(row) {
  const member = row.member_id ? getOnce('SELECT name FROM members WHERE id = ?', row.member_id) : null;
  const pickup = row.pickup_by ? getOnce('SELECT name FROM members WHERE id = ?', row.pickup_by) : null;
  return {
    id: row.id,
    member_id: row.member_id,
    member_name: member?.name ?? null,
    arrival_at: row.arrival_at ?? null,
    arrival_place: row.arrival_place ?? null,
    arrival_detail: row.arrival_detail ?? null,
    departure_at: row.departure_at ?? null,
    departure_place: row.departure_place ?? null,
    pickup_requested: !!row.pickup_requested,
    pickup_by: row.pickup_by ?? null,
    pickup_by_name: pickup?.name ?? null,
    status: row.status ?? null,
    notes: row.notes ?? null,
    updated_at: normalizeDbTime(row.updated_at),
    revision: row.revision ?? 1,
  };
}

function listJson(row, items) {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind ?? null,
    created_at: normalizeDbTime(row.created_at),
    revision: row.revision ?? 1,
    ...(items !== undefined ? { items } : {}),
  };
}

function listItemJson(row) {
  const assignee = row.assignee_id ? getOnce('SELECT name FROM members WHERE id = ?', row.assignee_id) : null;
  return {
    id: row.id,
    list_id: row.list_id,
    text: row.text,
    assignee_id: row.assignee_id ?? null,
    assignee_name: assignee?.name ?? null,
    done: !!row.done,
    position: row.position,
    revision: row.revision ?? 1,
    updated_at: normalizeDbTime(row.updated_at),
  };
}

// Normalize a present payload value: trimmed string, empty -> null, non-string
// (validated null) -> null.
function normField(v) {
  return typeof v === 'string' ? (v.trim() || null) : null;
}

// Every mutation requires X-Member-Id naming a member of THIS group.
function requireActorMember(req, group) {
  if (!req.actorId) return { error: 'X-Member-Id header required' };
  const actor = getOnce('SELECT id FROM members WHERE id = ? AND group_id = ?', req.actorId, group.id);
  if (!actor) return { error: 'Actor must be a member of this group' };
  return { actor };
}

function memberOfGroup(memberId, group) {
  return getOnce('SELECT id, name FROM members WHERE id = ? AND group_id = ?', memberId, group.id);
}

// Lightweight group info: stay/travel_plans/lists(+items) plus counts. No
// financial recomputation (the ledger reads keep their own paths).
app.get('/api/v1/groups/:code/info', (req, res) => {
  const group = getGroupByCode(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const stayRow = getOnce('SELECT * FROM stay WHERE group_id = ?', group.id);
  const stay = stayRow ? stayJson(stayRow) : null;

  const plans = allOnce(
    'SELECT * FROM travel_plans WHERE group_id = ? ORDER BY created_at ASC', group.id
  ).map(travelPlanJson);

  const listRows = allOnce('SELECT * FROM lists WHERE group_id = ? ORDER BY created_at ASC', group.id);
  const lists = listRows.map(l => listJson(l, allOnce(
    'SELECT * FROM list_items WHERE list_id = ? ORDER BY position ASC, created_at ASC', l.id
  ).map(listItemJson)));

  const noteCount = getOnce('SELECT COUNT(*) AS c FROM notes WHERE group_id = ?', group.id).c;
  res.json({
    stay,
    travel_plans: plans,
    lists,
    counts: {
      stay: stay ? 1 : 0,
      travel_plans: plans.length,
      lists: lists.length,
      list_items: lists.reduce((n, l) => n + l.items.length, 0),
      notes: noteCount,
    },
  });
});

const STAY_KEYS = ['title', 'address', 'listing_url', 'checkin_at', 'checkout_at', 'timezone',
  'instructions', 'parking', 'wifi', 'contact_name', 'contact_phone'];

// Stay singleton per group: PUT upserts. Absent expected_revision =
// unconditional update; a present integer != current revision -> 409.
app.put('/api/v1/groups/:code/stay', (req, res) => {
  const group = getGroupByCode(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const payload = asObject(req.body);
  const validationError = validateStay(payload);
  if (validationError) return res.status(400).json({ error: validationError });
  const { error: actorError } = requireActorMember(req, group);
  if (actorError) return res.status(400).json({ error: actorError });

  try {
    const existing = getOnce('SELECT * FROM stay WHERE group_id = ?', group.id);
    if (existing && payload.expected_revision !== undefined && payload.expected_revision !== existing.revision) {
      return res.status(409).json({ error: 'Stay was updated by someone else', stay: stayJson(existing) });
    }

    if (!existing) {
      const id = uuidv4();
      const now = new Date().toISOString();
      runOnce(
        'INSERT INTO stay (id, group_id, title, address, listing_url, checkin_at, checkout_at, timezone, instructions, parking, wifi, contact_name, contact_phone, created_at, updated_at, revision) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)',
        id, group.id,
        normField(payload.title), normField(payload.address), normField(payload.listing_url),
        normField(payload.checkin_at), normField(payload.checkout_at), normField(payload.timezone),
        normField(payload.instructions), normField(payload.parking), normField(payload.wifi),
        normField(payload.contact_name), normField(payload.contact_phone),
        now, now
      );
      saveDb();
      auditLog(req, 'create', 'stay', id, { title: normField(payload.title) });
      return res.json(stayJson(getOnce('SELECT * FROM stay WHERE id = ?', id)));
    }

    const sets = [];
    const values = [];
    let changed = false;
    for (const k of STAY_KEYS) {
      if (payload[k] === undefined) continue;
      const v = normField(payload[k]);
      if (v !== (existing[k] ?? null)) changed = true;
      sets.push(`${k} = ?`);
      values.push(v);
    }
    if (changed) {
      sets.push('revision = revision + 1', 'updated_at = ?');
      values.push(new Date().toISOString());
      runOnce(`UPDATE stay SET ${sets.join(', ')} WHERE id = ?`, ...values, existing.id);
      saveDb();
      auditLog(req, 'update', 'stay', existing.id,
        Object.fromEntries(STAY_KEYS.filter(k => payload[k] !== undefined).map(k => [k, payload[k]])));
    }
    res.json(stayJson(getOnce('SELECT * FROM stay WHERE id = ?', existing.id)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save stay' });
  }
});

app.delete('/api/v1/groups/:code/stay', (req, res) => {
  const group = getGroupByCode(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const existing = getOnce('SELECT * FROM stay WHERE group_id = ?', group.id);
  if (existing) {
    runOnce('DELETE FROM stay WHERE id = ?', existing.id);
    saveDb();
    auditLog(req, 'delete', 'stay', existing.id, { title: existing.title });
  }
  res.json({ ok: true });
});

const TRAVEL_KEYS = ['arrival_at', 'arrival_place', 'arrival_detail', 'departure_at',
  'departure_place', 'pickup_requested', 'pickup_by', 'status', 'notes'];

// One travel plan per (group, member): PUT upserts for that member.
app.put('/api/v1/groups/:code/travel-plans/:memberId', (req, res) => {
  const group = getGroupByCode(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const member = memberOfGroup(req.params.memberId, group);
  if (!member) return res.status(400).json({ error: 'Member must be in this group' });
  const payload = asObject(req.body);
  const validationError = validateTravelPlan(payload);
  if (validationError) return res.status(400).json({ error: validationError });
  const { error: actorError } = requireActorMember(req, group);
  if (actorError) return res.status(400).json({ error: actorError });
  if (payload.pickup_by != null && !memberOfGroup(payload.pickup_by, group)) {
    return res.status(400).json({ error: 'pickup_by must be a member of this group' });
  }

  try {
    const existing = getOnce('SELECT * FROM travel_plans WHERE group_id = ? AND member_id = ?', group.id, member.id);
    if (existing && payload.expected_revision !== undefined && payload.expected_revision !== existing.revision) {
      return res.status(409).json({ error: 'Travel plan was updated by someone else', travel_plan: travelPlanJson(existing) });
    }

    if (!existing) {
      const id = uuidv4();
      const now = new Date().toISOString();
      runOnce(
        'INSERT INTO travel_plans (id, group_id, member_id, arrival_at, arrival_place, arrival_detail, departure_at, departure_place, pickup_requested, pickup_by, status, notes, created_at, updated_at, revision) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)',
        id, group.id, member.id,
        normField(payload.arrival_at), normField(payload.arrival_place), normField(payload.arrival_detail),
        normField(payload.departure_at), normField(payload.departure_place),
        payload.pickup_requested ? 1 : 0, payload.pickup_by ?? null,
        normField(payload.status), normField(payload.notes),
        now, now
      );
      saveDb();
      auditLog(req, 'create', 'travel_plan', id, { member: member.name });
      return res.json(travelPlanJson(getOnce('SELECT * FROM travel_plans WHERE id = ?', id)));
    }

    const sets = [];
    const values = [];
    let changed = false;
    for (const k of TRAVEL_KEYS) {
      if (payload[k] === undefined) continue;
      let v;
      if (k === 'pickup_requested') v = payload.pickup_requested ? 1 : 0;
      else if (k === 'pickup_by') v = payload.pickup_by ?? null;
      else v = normField(payload[k]);
      if (v !== (existing[k] ?? null)) changed = true;
      sets.push(`${k} = ?`);
      values.push(v);
    }
    if (changed) {
      sets.push('revision = revision + 1', 'updated_at = ?');
      values.push(new Date().toISOString());
      runOnce(`UPDATE travel_plans SET ${sets.join(', ')} WHERE id = ?`, ...values, existing.id);
      saveDb();
      auditLog(req, 'update', 'travel_plan', existing.id, { member: member.name });
    }
    res.json(travelPlanJson(getOnce('SELECT * FROM travel_plans WHERE id = ?', existing.id)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save travel plan' });
  }
});

app.delete('/api/v1/groups/:code/travel-plans/:memberId', (req, res) => {
  const group = getGroupByCode(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const plan = getOnce('SELECT * FROM travel_plans WHERE group_id = ? AND member_id = ?', group.id, req.params.memberId);
  if (plan) {
    runOnce('DELETE FROM travel_plans WHERE id = ?', plan.id);
    saveDb();
    auditLog(req, 'delete', 'travel_plan', plan.id, {});
  }
  res.json({ ok: true });
});

app.post('/api/v1/groups/:code/lists', (req, res) => {
  const group = getGroupByCode(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const payload = asObject(req.body);
  const validationError = validateList(payload);
  if (validationError) return res.status(400).json({ error: validationError });
  const { error: actorError } = requireActorMember(req, group);
  if (actorError) return res.status(400).json({ error: actorError });

  try {
    const id = uuidv4();
    runOnce(
      'INSERT INTO lists (id, group_id, title, kind, created_at, revision) VALUES (?,?,?,?,?,1)',
      id, group.id, payload.title.trim(), payload.kind ?? null, new Date().toISOString()
    );
    saveDb();
    auditLog(req, 'create', 'list', id, { title: payload.title.trim(), kind: payload.kind ?? null });
    res.status(201).json(listJson(getOnce('SELECT * FROM lists WHERE id = ?', id)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create list' });
  }
});

app.patch('/api/v1/groups/:code/lists/:id', (req, res) => {
  const group = getGroupByCode(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const list = getOnce('SELECT * FROM lists WHERE id = ? AND group_id = ?', req.params.id, group.id);
  if (!list) return res.status(404).json({ error: 'List not found' });
  const payload = asObject(req.body);
  const validationError = validateListPatch(payload);
  if (validationError) return res.status(400).json({ error: validationError });
  const { error: actorError } = requireActorMember(req, group);
  if (actorError) return res.status(400).json({ error: actorError });

  if (payload.expected_revision !== undefined && payload.expected_revision !== list.revision) {
    return res.status(409).json({ error: 'List was updated by someone else', list: listJson(list) });
  }

  try {
    const sets = [];
    const values = [];
    let changed = false;
    if (payload.title !== undefined) {
      if (payload.title.trim() !== list.title) changed = true;
      sets.push('title = ?');
      values.push(payload.title.trim());
    }
    if (payload.kind !== undefined) {
      if ((payload.kind ?? null) !== (list.kind ?? null)) changed = true;
      sets.push('kind = ?');
      values.push(payload.kind ?? null);
    }
    if (changed) {
      sets.push('revision = revision + 1');
      runOnce(`UPDATE lists SET ${sets.join(', ')} WHERE id = ?`, ...values, list.id);
      saveDb();
      auditLog(req, 'update', 'list', list.id, {
        ...(payload.title !== undefined ? { title: payload.title.trim() } : {}),
        ...(payload.kind !== undefined ? { kind: payload.kind ?? null } : {}),
      });
    }
    res.json(listJson(getOnce('SELECT * FROM lists WHERE id = ?', list.id)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update list' });
  }
});

app.delete('/api/v1/groups/:code/lists/:id', (req, res) => {
  const group = getGroupByCode(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const list = getOnce('SELECT * FROM lists WHERE id = ? AND group_id = ?', req.params.id, group.id);
  if (!list) return res.status(404).json({ error: 'List not found' });
  runOnce('DELETE FROM list_items WHERE list_id = ?', list.id);
  runOnce('DELETE FROM lists WHERE id = ?', list.id);
  saveDb();
  auditLog(req, 'delete', 'list', list.id, { title: list.title });
  res.json({ ok: true });
});

app.post('/api/v1/groups/:code/lists/:id/items', (req, res) => {
  const group = getGroupByCode(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const list = getOnce('SELECT * FROM lists WHERE id = ? AND group_id = ?', req.params.id, group.id);
  if (!list) return res.status(404).json({ error: 'List not found' });
  const payload = asObject(req.body);
  const validationError = validateListItem(payload);
  if (validationError) return res.status(400).json({ error: validationError });
  const { error: actorError } = requireActorMember(req, group);
  if (actorError) return res.status(400).json({ error: actorError });
  if (payload.assignee_id != null && !memberOfGroup(payload.assignee_id, group)) {
    return res.status(400).json({ error: 'Assignee must be a member of this group' });
  }

  try {
    const id = uuidv4();
    const position = getOnce(
      'SELECT COALESCE(MAX(position), 0) + 1 AS p FROM list_items WHERE list_id = ?', list.id
    ).p;
    const now = new Date().toISOString();
    runOnce(
      'INSERT INTO list_items (id, list_id, text, assignee_id, done, position, created_at, updated_at, revision) VALUES (?,?,?,?,0,?,?,?,1)',
      id, list.id, payload.text.trim(), payload.assignee_id ?? null, position, now, now
    );
    saveDb();
    auditLog(req, 'create', 'list_item', id, { text: payload.text.trim(), list_id: list.id });
    res.status(201).json(listItemJson(getOnce('SELECT * FROM list_items WHERE id = ?', id)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create list item' });
  }
});

// Items are addressed globally by id but always resolved through their list's
// group, so a foreign item id never leaks across groups.
app.patch('/api/v1/groups/:code/items/:itemId', (req, res) => {
  const group = getGroupByCode(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const item = getOnce(
    'SELECT li.* FROM list_items li JOIN lists l ON li.list_id = l.id WHERE li.id = ? AND l.group_id = ?',
    req.params.itemId, group.id
  );
  if (!item) return res.status(404).json({ error: 'List item not found' });
  const payload = asObject(req.body);
  const validationError = validateListItemPatch(payload);
  if (validationError) return res.status(400).json({ error: validationError });
  const { error: actorError } = requireActorMember(req, group);
  if (actorError) return res.status(400).json({ error: actorError });
  if (payload.assignee_id != null && !memberOfGroup(payload.assignee_id, group)) {
    return res.status(400).json({ error: 'Assignee must be a member of this group' });
  }

  if (payload.expected_revision !== undefined && payload.expected_revision !== item.revision) {
    return res.status(409).json({ error: 'Item was updated by someone else', item: listItemJson(item) });
  }

  try {
    const sets = [];
    const values = [];
    let changed = false;
    if (payload.text !== undefined) {
      if (payload.text.trim() !== item.text) changed = true;
      sets.push('text = ?');
      values.push(payload.text.trim());
    }
    if (payload.assignee_id !== undefined) {
      if ((payload.assignee_id ?? null) !== (item.assignee_id ?? null)) changed = true;
      sets.push('assignee_id = ?');
      values.push(payload.assignee_id ?? null);
    }
    if (payload.done !== undefined) {
      if ((payload.done ? 1 : 0) !== item.done) changed = true;
      sets.push('done = ?');
      values.push(payload.done ? 1 : 0);
    }
    if (changed) {
      sets.push('revision = revision + 1', 'updated_at = ?');
      values.push(new Date().toISOString());
      runOnce(`UPDATE list_items SET ${sets.join(', ')} WHERE id = ?`, ...values, item.id);
      saveDb();
      auditLog(req, 'update', 'list_item', item.id, {
        ...(payload.text !== undefined ? { text: payload.text.trim() } : {}),
        ...(payload.assignee_id !== undefined ? { assignee_id: payload.assignee_id ?? null } : {}),
        ...(payload.done !== undefined ? { done: payload.done } : {}),
      });
    }
    res.json(listItemJson(getOnce('SELECT * FROM list_items WHERE id = ?', item.id)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update list item' });
  }
});

app.delete('/api/v1/groups/:code/items/:itemId', (req, res) => {
  const group = getGroupByCode(req.params.code);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const item = getOnce(
    'SELECT li.* FROM list_items li JOIN lists l ON li.list_id = l.id WHERE li.id = ? AND l.group_id = ?',
    req.params.itemId, group.id
  );
  if (!item) return res.status(404).json({ error: 'List item not found' });
  runOnce('DELETE FROM list_items WHERE id = ?', item.id);
  saveDb();
  auditLog(req, 'delete', 'list_item', item.id, { text: item.text });
  res.json({ ok: true });
});

// ==================== START ====================

async function start() {
  await initDb();
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`SplitDumb server running on port ${PORT}`);
  });
}

// Export for sub-app mounting; auto-start only when run directly
module.exports = { app, start };

if (require.main === module) {
  start().catch(err => {
    console.error('Failed to start:', err);
    process.exit(1);
  });
}