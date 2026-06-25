const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'splitdumb.db');

let db;
let ready = false;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    admin_token TEXT,
    passcode TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(group_id, name)
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    payer_id TEXT NOT NULL REFERENCES members(id),
    split_type TEXT NOT NULL,
    date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_by TEXT REFERENCES members(id)
  );

  CREATE TABLE IF NOT EXISTS splits (
    expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    member_id TEXT NOT NULL REFERENCES members(id),
    share REAL NOT NULL,
    PRIMARY KEY (expense_id, member_id)
  );

  CREATE TABLE IF NOT EXISTS settlements (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    from_id TEXT NOT NULL REFERENCES members(id),
    to_id TEXT NOT NULL REFERENCES members(id),
    amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_members_group ON members(group_id);
  CREATE INDEX IF NOT EXISTS idx_expenses_group ON expenses(group_id);
  CREATE INDEX IF NOT EXISTS idx_splits_expense ON splits(expense_id);
  CREATE INDEX IF NOT EXISTS idx_settlements_group ON settlements(group_id);
  CREATE INDEX IF NOT EXISTS idx_groups_code ON groups(code);

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    member_id TEXT REFERENCES members(id),
    member_name TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    changes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_audit_group ON audit_log(group_id);
  CREATE INDEX IF NOT EXISTS idx_audit_member ON audit_log(member_id);
  CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);

  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    mimetype TEXT NOT NULL,
    size INTEGER NOT NULL,
    path TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_attachments_expense ON attachments(expense_id);
`;

function saveDb() {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('Failed to save DB:', err.message);
  }
}

// Auto-save every 5 seconds if dirty
let dirty = false;
function markDirty() { dirty = true; }

setInterval(() => {
  if (dirty && db) {
    saveDb();
    dirty = false;
  }
}, 5000);

// Wrap db operations to auto-mark dirty
function wrapStmt(stmt) {
  return {
    run(...args) {
      stmt.bind(args);
      stmt.step();
      const info = { changes: db.getRowsModified(), lastInsertRowid: null };
      stmt.reset();
      markDirty();
      return info;
    },
    get(...args) {
      stmt.bind(args);
      const hasRow = stmt.step();
      let row = null;
      if (hasRow) {
        row = stmt.getAsObject();
      }
      stmt.reset();
      return row;
    },
    all(...args) {
      stmt.bind(args);
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.reset();
      return rows;
    }
  };
}

function prepare(sql) {
  const rawStmt = db.prepare(sql);
  return wrapStmt(rawStmt);
}

function exec(sql) {
  db.run(sql);
  markDirty();
}

async function init() {
  const SQL = await initSqlJs();
  
  // Try loading existing DB
  let buffer = null;
  try {
    buffer = fs.readFileSync(DB_PATH);
  } catch (e) {
    // No existing DB, will create new
  }

  if (buffer) {
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(SCHEMA);

  // Migration: add admin_token if missing
  try {
    db.run('ALTER TABLE groups ADD COLUMN admin_token TEXT');
  } catch (e) {
    // Column already exists
  }

  // Migration: add date_range_start, date_range_end, nights_data columns for nights split
  try {
    db.run('ALTER TABLE expenses ADD COLUMN date_range_start TEXT');
  } catch (e) { /* Column already exists */ }
  try {
    db.run('ALTER TABLE expenses ADD COLUMN date_range_end TEXT');
  } catch (e) { /* Column already exists */ }
  try {
    db.run('ALTER TABLE expenses ADD COLUMN nights_data TEXT');
  } catch (e) { /* Column already exists */ }

  // Migration: add category and notes columns
  try {
    db.run('ALTER TABLE expenses ADD COLUMN category TEXT');
  } catch (e) { /* Column already exists */ }
  try {
    db.run('ALTER TABLE expenses ADD COLUMN notes TEXT');
  } catch (e) { /* Column already exists */ }

  // Migration: add payers_data column for multi-payer splits
  try {
    db.run('ALTER TABLE expenses ADD COLUMN payers_data TEXT');
  } catch (e) { /* Column already exists */ }

  // Migration: add shares_data column to store raw share counts
  try {
    db.run('ALTER TABLE expenses ADD COLUMN shares_data TEXT');
  } catch (e) { /* Column already exists */ }

  // Migration: add profile columns to members for payment methods
  try {
    db.run('ALTER TABLE members ADD COLUMN venmo_link TEXT');
  } catch (e) { /* Column already exists */ }
  try {
    db.run('ALTER TABLE members ADD COLUMN zelle_handle TEXT');
  } catch (e) { /* Column already exists */ }

  // Migration: drop items_data column (SQLite can't DROP COLUMN, so we null it out)
  try {
    db.run("UPDATE expenses SET items_data = NULL WHERE items_data IS NOT NULL");
  } catch (e) { /* Table may not have column yet */ }

  ready = true;
  console.log('Database ready');
  return db;
}

module.exports = { init, prepare, exec, saveDb, markDirty, isReady: () => ready };