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

  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    author_member_id TEXT REFERENCES members(id),
    author_name TEXT,
    title TEXT,
    body TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT,
    revision INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_notes_group ON notes(group_id);

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

// Durable snapshot: write to a temp file, fsync, then atomically rename over
// DB_PATH. On any failure dirty stays true and the error propagates so
// callers can surface a 500 instead of acknowledging a lost write.
function saveDb() {
  if (!db) return;
  const buffer = Buffer.from(db.export());
  const tmpPath = DB_PATH + '.tmp';
  let fd = null;
  try {
    fd = fs.openSync(tmpPath, 'w');
    fs.writeSync(fd, buffer);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmpPath, DB_PATH);
    dirty = false;
  } catch (err) {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch { /* fd already closed or unusable */ }
    }
    try { fs.unlinkSync(tmpPath); } catch { /* temp file may not exist */ }
    dirty = true;
    throw err;
  }
}

// Auto-save every 5 seconds if dirty; dirty clears only on a successful save.
let dirty = false;
function markDirty() { dirty = true; }

setInterval(() => {
  if (dirty && db) {
    try {
      saveDb();
    } catch (err) {
      console.error('Autosave failed:', err.message);
    }
  }
}, 5000).unref();

// Wrap db operations to auto-mark dirty
function wrapStmt(stmt) {
  let freed = false;
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
    },
    // Release the underlying sql.js statement; call once done with a
    // one-shot statement so it does not leak.
    free() {
      if (!freed) {
        freed = true;
        stmt.free();
      }
    },
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

  // Try loading existing DB. Only a missing file (ENOENT) creates a fresh
  // database; any other read error (unreadable file, directory, permissions)
  // must propagate — never silently replace an existing unreadable DB.
  let buffer = null;
  try {
    buffer = fs.readFileSync(DB_PATH);
  } catch (e) {
    if (e.code !== 'ENOENT') {
      throw new Error(`Failed to read existing database at ${DB_PATH}: ${e.message}`);
    }
    // No existing DB, will create new
  }

  if (buffer) {
    // May throw or produce errors on first statement if the file is not a
    // valid SQLite database — that propagates rather than replacing the file.
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

  // Migration: notes author survival + revision. The old schema declared
  // author_member_id NOT NULL, so removing a member either hid their notes
  // (inner join) or was blocked. Rebuild the table with a nullable
  // author_member_id, an author_name snapshot (carrying each author's live
  // name), and a revision counter. Reads fall back: live member name >
  // notes.author_name snapshot > 'Former member'.
  {
    const stmt = db.prepare('PRAGMA table_info(notes)');
    const cols = new Set();
    while (stmt.step()) cols.add(stmt.getAsObject().name);
    stmt.free();
    if (!cols.has('author_name')) {
      db.run(`CREATE TABLE notes_new (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        author_member_id TEXT REFERENCES members(id),
        author_name TEXT,
        title TEXT,
        body TEXT NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT,
        revision INTEGER NOT NULL DEFAULT 1
      )`);
      db.run(`INSERT INTO notes_new (id, group_id, author_member_id, author_name, title, body, pinned, created_at, updated_at, revision)
        SELECT n.id, n.group_id, n.author_member_id, m.name, n.title, n.body, n.pinned, n.created_at, n.updated_at, 1
        FROM notes n LEFT JOIN members m ON n.author_member_id = m.id`);
      db.run('DROP TABLE notes');
      db.run('ALTER TABLE notes_new RENAME TO notes');
      db.run('CREATE INDEX IF NOT EXISTS idx_notes_group ON notes(group_id)');
      markDirty();
    }
  }

  // Migration: Releases 1-3 group utilities — stay singleton, one travel
  // plan per member, shared lists and list items. Idempotent CREATE TABLE IF
  // NOT EXISTS blocks (new installs and old databases both converge).
  db.run(`
    CREATE TABLE IF NOT EXISTS stay (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL UNIQUE REFERENCES groups(id) ON DELETE CASCADE,
      title TEXT,
      address TEXT,
      listing_url TEXT,
      checkin_at TEXT,
      checkout_at TEXT,
      timezone TEXT,
      instructions TEXT,
      parking TEXT,
      wifi TEXT,
      contact_name TEXT,
      contact_phone TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      revision INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_stay_group ON stay(group_id);

    CREATE TABLE IF NOT EXISTS travel_plans (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      member_id TEXT NOT NULL REFERENCES members(id),
      arrival_at TEXT,
      arrival_place TEXT,
      arrival_detail TEXT,
      departure_at TEXT,
      departure_place TEXT,
      pickup_requested INTEGER NOT NULL DEFAULT 0,
      pickup_by TEXT REFERENCES members(id),
      status TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      revision INTEGER NOT NULL DEFAULT 1,
      UNIQUE(group_id, member_id)
    );
    CREATE INDEX IF NOT EXISTS idx_travel_plans_group ON travel_plans(group_id);
    CREATE INDEX IF NOT EXISTS idx_travel_plans_member ON travel_plans(member_id);

    CREATE TABLE IF NOT EXISTS lists (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      kind TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      revision INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_lists_group ON lists(group_id);

    CREATE TABLE IF NOT EXISTS list_items (
      id TEXT PRIMARY KEY,
      list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      assignee_id TEXT REFERENCES members(id),
      done INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      revision INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_list_items_list ON list_items(list_id);
    CREATE INDEX IF NOT EXISTS idx_list_items_assignee ON list_items(assignee_id);
  `);

  ready = true;
  console.log('Database ready');
  return db;
}

module.exports = { init, prepare, exec, saveDb, markDirty, isReady: () => ready, isDirty: () => dirty };