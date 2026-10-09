#!/usr/bin/env node
// One-time migration: repair stored splits whose shares don't sum to the expense amount.
//
// Root cause: calculateSplits had rounding bugs where negative remainder was never
// distributed (equal/shares) or no remainder handling existed at all (percentage).
// Expenses stored before the fix (core/src/splits.{js,cjs}) carry ±cent residuals,
// which accumulate into group balances that can never sum to zero ("unsettleable").
//
// This script re-balances each expense's stored shares in place:
//   diff = amount - SUM(shares)  (in integer cents)
//   if diff != 0: add/subtract $0.01 across members ordered by share descending
//   (same distribution rule the fixed runtime code uses).
//
// Run:  node scripts/resplit.js [--dry]
// The backend service MUST be stopped while this runs (it holds the DB in memory
// via sql.js and would overwrite the file on its next save).

const fs = require('fs');
const path = require('path');
const initSqlJs = require(path.join(__dirname, '..', 'server', 'node_modules', 'sql.js'));

const DB_PATH = path.join(__dirname, '..', 'server', 'splitdumb.db');
const DRY = process.argv.includes('--dry');

(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(DB_PATH));

  const expenses = db.exec(
    "SELECT id, description, amount FROM expenses"
  )[0]?.values || [];

  let fixed = 0, totalCents = 0;
  const changes = [];

  for (const [id, desc, amount] of expenses) {
    const rows = db.exec(
      "SELECT member_id, share FROM splits WHERE expense_id = ? ORDER BY share DESC, member_id",
      [id]
    )[0]?.values || [];
    if (rows.length === 0) continue;

    const sumShares = rows.reduce((s, [, share]) => s + share, 0);
    const diffCents = Math.round(amount * 100) - Math.round(sumShares * 100);
    if (diffCents === 0) continue;

    const dir = diffCents > 0 ? 0.01 : -0.01;
    const steps = Math.min(Math.abs(diffCents), rows.length);
    for (let i = 0; i < steps; i++) {
      const [memberId, share] = rows[i];
      const newShare = Math.round((share + dir) * 100) / 100;
      if (!DRY) db.run("UPDATE splits SET share = ? WHERE expense_id = ? AND member_id = ?", [newShare, id, memberId]);
    }
    fixed++;
    totalCents += Math.abs(diffCents);
    changes.push(`  ${desc} ($${amount.toFixed(2)}): diff ${diffCents > 0 ? '+' : ''}${(diffCents / 100).toFixed(2)} -> adjusted ${steps} member(s)`);
  }

  if (changes.length) console.log('Expenses repaired:'); 
  changes.forEach(c => console.log(c));
  console.log(`\n${DRY ? '[DRY RUN] ' : ''}${fixed} expense(s) repaired, ${totalCents} cent(s) redistributed total.`);

  // Sanity check: every expense's shares must now sum to its amount (only meaningful when applied)
  let bad = 0;
  if (DRY) { console.log('Sanity check skipped (dry run).'); process.exit(0); }
  for (const [id, desc, amount] of expenses) {
    const rows = db.exec("SELECT share FROM splits WHERE expense_id = ?", [id])[0]?.values || [];
    const diff = Math.round(amount * 100) - Math.round(rows.reduce((s, [v]) => s + v, 0) * 100);
    if (diff !== 0) { bad++; console.log(`STILL OFF: ${desc} by ${diff}c`); }
  }
  console.log(bad === 0 ? 'Sanity check: all expenses balanced.' : `SANITY FAIL: ${bad} expense(s) still off`);
  if (bad > 0) process.exit(1);

  if (!DRY) {
    const buffer = Buffer.from(db.export());
    fs.writeFileSync(DB_PATH, buffer);
    console.log('Database written:', DB_PATH);
  }
})();
