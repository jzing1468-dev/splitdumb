'use strict';
// db.js durability: atomic saves, dirty-flag semantics, ENOENT vs corrupt
// init behavior. Each `node --test` file runs in its own process, so the
// in-process tests share one DB_PATH; init-variant tests spawn children.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-auth-secret';
const DB_PATH = path.join(os.tmpdir(), `splitdumb-db-test-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = DB_PATH;

const db = require('../db');
const DB_JS = path.join(__dirname, '..', 'db.js');

const CLEANUP = [DB_PATH, DB_PATH + '.tmp'];
process.on('exit', () => { for (const p of CLEANUP) { try { fs.unlinkSync(p); } catch {} } });

// Run a snippet against db.js in a child process with its own DB_PATH.
// The snippet must be a single expression evaluating to a promise.
function childDb(dbPath, snippet) {
  const code = `
    process.env.DB_PATH = ${JSON.stringify(dbPath)};
    const db = require(${JSON.stringify(DB_JS)});
    Promise.resolve((function () { return (${snippet}); })()).then(
      () => console.log('DONE'),
      e => console.log('FAIL:' + (e && e.message))
    );
  `;
  let out;
  try {
    out = execFileSync(process.execPath, ['-e', code], { encoding: 'utf8', env: process.env });
  } catch (e) {
    out = (e.stdout || '') + (e.stderr || '');
  }
  return out;
}

before(async () => {
  await db.init();
});

test('init creates a fresh database when DB_PATH is missing (ENOENT)', () => {
  // init() already ran in before(); verify schema exists and file was created on save.
  const tables = db.prepare('SELECT name FROM sqlite_master WHERE type = ?').all('table');
  const names = tables.map(t => t.name);
  for (const t of ['groups', 'members', 'expenses', 'splits', 'settlements', 'audit_log', 'notes', 'attachments']) {
    assert.ok(names.includes(t), `table ${t} exists`);
  }
  // notes schema has the author-survival columns
  const cols = new Set(db.prepare('PRAGMA table_info(notes)').all().map(c => c.name));
  for (const c of ['author_member_id', 'author_name', 'revision']) {
    assert.ok(cols.has(c), `notes.${c} exists`);
  }
});

test('markDirty flags unsaved state; successful saveDb clears it and writes a valid SQLite file atomically', () => {
  assert.equal(db.isDirty(), false);
  db.exec("INSERT INTO groups (id, name, code) VALUES ('g-dbtest', 'DbTest', 'DBTEST')");
  assert.equal(db.isDirty(), true);
  db.saveDb();
  assert.equal(db.isDirty(), false);
  // Atomic snapshot: final file in place, no leftover temp file, valid header.
  const buf = fs.readFileSync(DB_PATH);
  assert.equal(buf.slice(0, 15).toString(), 'SQLite format 3');
  assert.ok(!fs.existsSync(DB_PATH + '.tmp'), 'no temp file left behind');
});

test('saveDb failure propagates the error and keeps dirty true', () => {
  const dbPath = path.join(os.tmpdir(), `no-such-dir-${process.pid}-${Date.now()}`, 'test.db');
  const out = childDb(dbPath, `db.init().then(() => {
    db.exec("INSERT INTO groups (id, name, code) VALUES ('g1', 'G', 'CODE1')");
    try {
      db.saveDb();
      console.log('SAVE_OK');
    } catch (e) {
      console.log('SAVE_FAIL dirty=' + db.isDirty());
    }
  })`);
  assert.match(out, /SAVE_FAIL dirty=true/);
  assert.doesNotMatch(out, /SAVE_OK/);
});

test('init distinguishes ENOENT from other read errors (directory as DB_PATH must throw)', () => {
  const dirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'splitdumb-dirtest-'));
  const out = childDb(dirPath, `db.init()`);
  assert.match(out, /FAIL:/);
  assert.doesNotMatch(out, /DONE/);
  fs.rmdirSync(dirPath);
});

test('init rejects a corrupt DB file instead of silently replacing it', () => {
  const corruptPath = path.join(os.tmpdir(), `splitdumb-corrupt-${process.pid}-${Date.now()}.db`);
  fs.writeFileSync(corruptPath, 'this is definitely not a sqlite database');
  const out = childDb(corruptPath, `db.init()`);
  assert.match(out, /FAIL:/);
  assert.doesNotMatch(out, /DONE/);
  // The corrupt file must still be there, byte-for-byte, not replaced.
  assert.equal(fs.readFileSync(corruptPath).toString(), 'this is definitely not a sqlite database');
  fs.unlinkSync(corruptPath);
});

test('migrates an old notes schema (NOT NULL author_member_id, no author_name/revision) preserving rows and names', async () => {
  // Build a pre-migration database with the old notes shape + a member author.
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const raw = new SQL.Database();
  raw.run("CREATE TABLE groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))");
  raw.run("CREATE TABLE members (id TEXT PRIMARY KEY, group_id TEXT NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL, joined_at TEXT NOT NULL DEFAULT (datetime('now')))");
  raw.run("CREATE TABLE notes (id TEXT PRIMARY KEY, group_id TEXT NOT NULL, author_member_id TEXT NOT NULL, title TEXT, body TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT)");
  raw.run("INSERT INTO groups (id, name, code) VALUES ('g1', 'Old', 'OLDONE')");
  raw.run("INSERT INTO members (id, group_id, name, color) VALUES ('m1', 'g1', 'Legacy Alice', '#fff')");
  raw.run("INSERT INTO notes (id, group_id, author_member_id, title, body, pinned) VALUES ('n1', 'g1', 'm1', 'Keep me', 'door code', 1)");
  raw.run("INSERT INTO notes (id, group_id, author_member_id, title, body) VALUES ('n2', 'g1', 'm1', NULL, 'orphan body')");
  const oldPath = path.join(os.tmpdir(), `splitdumb-oldschema-${process.pid}-${Date.now()}.db`);
  fs.writeFileSync(oldPath, Buffer.from(raw.export()));
  raw.close();

  const migrateOut = childDb(oldPath, `db.init().then(() => {
    const names = new Set(db.prepare('PRAGMA table_info(notes)').all().map(c => c.name));
    console.log('COLS=' + ['author_name', 'revision'].every(c => names.has(c)));
    console.log('ROWS=' + JSON.stringify(db.prepare('SELECT id, author_member_id, author_name, title, body, pinned, revision FROM notes ORDER BY id').all()));
  })`);
  assert.match(migrateOut, /COLS=true/);
  const rowsMatch = migrateOut.match(/ROWS=(.*)/);
  const rows = JSON.parse(rowsMatch[1]);
  assert.equal(rows.length, 2);
  const n1 = rows.find(r => r.id === 'n1');
  assert.equal(n1.title, 'Keep me');
  assert.equal(n1.body, 'door code');
  assert.equal(n1.pinned, 1);
  assert.equal(n1.author_member_id, 'm1');
  assert.equal(n1.author_name, 'Legacy Alice'); // live author name carried into snapshot
  assert.equal(n1.revision, 1);
  fs.unlinkSync(oldPath);
});

test('wrapStmt free() releases statements and the db keeps working', () => {
  const stmt = db.prepare('SELECT COUNT(*) as n FROM groups');
  assert.equal(stmt.get().n >= 1, true);
  stmt.free();
  stmt.free(); // idempotent
  const again = db.prepare('SELECT COUNT(*) as n FROM groups');
  assert.equal(again.get().n >= 1, true);
  again.free();
});