const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'pokerwise.db');

let db;
let ready = false;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL DEFAULT (datetime('now')),
    location TEXT,
    buy_in_amount REAL NOT NULL DEFAULT 20,
    currency TEXT NOT NULL DEFAULT 'USD',
    status TEXT NOT NULL DEFAULT 'active',
    admin_token TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    venmo_link TEXT,
    zelle_handle TEXT,
    total_buy_in REAL NOT NULL DEFAULT 0,
    cash_out REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(session_id, name)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL REFERENCES players(id),
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_players_session ON players(session_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_session ON transactions(session_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_player ON transactions(player_id);
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

let dirty = false;
function markDirty() { dirty = true; }

setInterval(() => {
  if (dirty && db) {
    saveDb();
    dirty = false;
  }
}, 5000);

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

  let buffer = null;
  try {
    buffer = fs.readFileSync(DB_PATH);
  } catch (e) {
    // No existing DB
  }

  if (buffer) {
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(SCHEMA);

  ready = true;
  console.log('Database ready at', DB_PATH);
  return db;
}

module.exports = { init, prepare, exec, saveDb, markDirty, isReady: () => ready };