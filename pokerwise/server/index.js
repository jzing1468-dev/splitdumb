const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { init: initDb, prepare, saveDb, markDirty } = require('./db');
const { calculateSettlements, nextColor } = require('@pokerwise/core');

// Export app for mounting as sub-app; start() only when run directly
const app = express();
app.use(cors());
app.use(express.json());

// Disable caching for API responses
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// ==================== SESSION ROUTES ====================

// Create session
app.post('/api/v1/sessions', (req, res) => {
  const { date, location, buy_in_amount } = req.body;
  const id = crypto.randomUUID();
  const adminToken = crypto.randomUUID();
  const buyIn = buy_in_amount != null ? Number(buy_in_amount) : 20;
  const sessionDate = date || new Date().toISOString().split('T')[0];

  try {
    prepare(
      'INSERT INTO sessions (id, date, location, buy_in_amount, admin_token) VALUES (?, ?, ?, ?, ?)'
    ).run(id, sessionDate, location || null, buyIn, adminToken);

    const session = prepare('SELECT * FROM sessions WHERE id = ?').get(id);
    // Don't return admin_token in the session object directly; return it separately
    res.status(201).json({ ...session, admin_token: adminToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// List all sessions
app.get('/api/v1/sessions', (req, res) => {
  try {
    const sessions = prepare(`
      SELECT s.*,
        (SELECT COUNT(*) FROM players WHERE session_id = s.id) as player_count,
        (SELECT COALESCE(SUM(total_buy_in), 0) FROM players WHERE session_id = s.id) as total_pot
      FROM sessions s
      ORDER BY s.created_at DESC
    `).all();
    // Strip admin_token
    const safe = sessions.map(({ admin_token, ...rest }) => rest);
    res.json(safe);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

// Get session with players and transactions
app.get('/api/v1/sessions/:id', (req, res) => {
  const session = prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const players = prepare('SELECT * FROM players WHERE session_id = ? ORDER BY created_at').all(session.id);
  const transactions = prepare('SELECT * FROM transactions WHERE session_id = ? ORDER BY created_at').all(session.id);

  const { admin_token, ...safeSession } = session;
  res.json({
    ...safeSession,
    players,
    transactions,
  });
});

// Delete session
app.delete('/api/v1/sessions/:id', (req, res) => {
  const session = prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  // Check admin token
  const adminToken = req.headers['x-admin-token'] || req.query.admin_token;
  if (session.admin_token && adminToken !== session.admin_token) {
    return res.status(403).json({ error: 'Invalid admin token' });
  }

  try {
    prepare('DELETE FROM transactions WHERE session_id = ?').run(session.id);
    prepare('DELETE FROM players WHERE session_id = ?').run(session.id);
    prepare('DELETE FROM sessions WHERE id = ?').run(session.id);
    saveDb();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// ==================== PLAYER ROUTES ====================

// Add player
app.post('/api/v1/sessions/:id/players', (req, res) => {
  const session = prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { name } = req.body;
  if (!name || name.trim().length === 0) {
    return res.status(400).json({ error: 'Player name is required' });
  }

  const existing = prepare('SELECT id FROM players WHERE session_id = ? AND LOWER(name) = LOWER(?)').get(session.id, name.trim());
  if (existing) {
    return res.status(409).json({ error: 'That name is already in this session' });
  }

  const countResult = prepare('SELECT COUNT(*) as count FROM players WHERE session_id = ?').get(session.id);
  const count = countResult?.count || 0;

  const id = crypto.randomUUID();
  const color = nextColor(count);

  try {
    // Initial buy-in
    prepare(
      'INSERT INTO players (id, session_id, name, color, total_buy_in) VALUES (?, ?, ?, ?, ?)'
    ).run(id, session.id, name.trim(), color, session.buy_in_amount);

    // Record the buy-in transaction
    const txId = crypto.randomUUID();
    prepare(
      'INSERT INTO transactions (id, session_id, player_id, type, amount) VALUES (?, ?, ?, ?, ?)'
    ).run(txId, session.id, id, 'buyin', session.buy_in_amount);

    saveDb();
    const player = prepare('SELECT * FROM players WHERE id = ?').get(id);
    res.status(201).json(player);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add player' });
  }
});

// Edit player
app.patch('/api/v1/sessions/:id/players/:pid', (req, res) => {
  const session = prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const player = prepare('SELECT * FROM players WHERE id = ? AND session_id = ?').get(req.params.pid, session.id);
  if (!player) return res.status(404).json({ error: 'Player not found' });

  const { name, venmo_link, zelle_handle } = req.body;
  const updates = [];
  const values = [];

  if (name !== undefined) {
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Player name cannot be empty' });
    }
    const existing = prepare('SELECT id FROM players WHERE session_id = ? AND LOWER(name) = LOWER(?) AND id != ?').get(session.id, name.trim(), req.params.pid);
    if (existing) {
      return res.status(409).json({ error: 'That name is already in this session' });
    }
    updates.push('name = ?');
    values.push(name.trim());
  }

  if (venmo_link !== undefined) {
    let normalized = venmo_link ? venmo_link.trim() : null;
    if (normalized) {
      if (normalized.startsWith('@')) {
        normalized = 'venmo.com/' + normalized.slice(1);
      } else if (!normalized.startsWith('http') && !normalized.startsWith('venmo.com')) {
        normalized = 'venmo.com/' + normalized;
      }
      normalized = normalized.replace(/^https?:\/\/(www\.)?/, '');
    }
    updates.push('venmo_link = ?');
    values.push(normalized);
  }

  if (zelle_handle !== undefined) {
    updates.push('zelle_handle = ?');
    values.push(zelle_handle ? zelle_handle.trim() : null);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  try {
    prepare(`UPDATE players SET ${updates.join(', ')} WHERE id = ?`).run(...values, req.params.pid);
    saveDb();
    const updated = prepare('SELECT * FROM players WHERE id = ?').get(req.params.pid);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update player' });
  }
});

// Remove player
app.delete('/api/v1/sessions/:id/players/:pid', (req, res) => {
  const session = prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const player = prepare('SELECT * FROM players WHERE id = ? AND session_id = ?').get(req.params.pid, session.id);
  if (!player) return res.status(404).json({ error: 'Player not found' });

  try {
    prepare('DELETE FROM transactions WHERE player_id = ?').run(req.params.pid);
    prepare('DELETE FROM players WHERE id = ?').run(req.params.pid);
    saveDb();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove player' });
  }
});

// Buy-in / Rebuy
app.post('/api/v1/sessions/:id/players/:pid/buyin', (req, res) => {
  const session = prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const player = prepare('SELECT * FROM players WHERE id = ? AND session_id = ?').get(req.params.pid, session.id);
  if (!player) return res.status(404).json({ error: 'Player not found' });

  const amount = req.body.amount != null ? Number(req.body.amount) : session.buy_in_amount;
  if (amount <= 0) return res.status(400).json({ error: 'Amount must be > 0' });

  // Check if already cashed out
  if (player.cash_out != null) {
    return res.status(400).json({ error: 'Player has already cashed out' });
  }

  try {
    const newTotal = player.total_buy_in + amount;
    prepare('UPDATE players SET total_buy_in = ? WHERE id = ?').run(newTotal, req.params.pid);

    const txId = crypto.randomUUID();
    prepare(
      'INSERT INTO transactions (id, session_id, player_id, type, amount) VALUES (?, ?, ?, ?, ?)'
    ).run(txId, session.id, req.params.pid, 'rebuy', amount);

    saveDb();
    const updated = prepare('SELECT * FROM players WHERE id = ?').get(req.params.pid);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to record buy-in' });
  }
});

// Cash out
app.post('/api/v1/sessions/:id/players/:pid/cashout', (req, res) => {
  const session = prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const player = prepare('SELECT * FROM players WHERE id = ? AND session_id = ?').get(req.params.pid, session.id);
  if (!player) return res.status(404).json({ error: 'Player not found' });

  if (player.cash_out != null) {
    return res.status(400).json({ error: 'Player has already cashed out' });
  }

  const amount = Number(req.body.amount);
  if (isNaN(amount) || amount < 0) {
    return res.status(400).json({ error: 'Cash-out amount must be >= 0' });
  }

  try {
    prepare('UPDATE players SET cash_out = ? WHERE id = ?').run(amount, req.params.pid);

    const txId = crypto.randomUUID();
    prepare(
      'INSERT INTO transactions (id, session_id, player_id, type, amount) VALUES (?, ?, ?, ?, ?)'
    ).run(txId, session.id, req.params.pid, 'cashout', amount);

    saveDb();
    const updated = prepare('SELECT * FROM players WHERE id = ?').get(req.params.pid);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to record cash-out' });
  }
});

// Edit cash-out amount (update existing cashout)
app.patch('/api/v1/sessions/:id/players/:pid/cashout', (req, res) => {
  const session = prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const player = prepare('SELECT * FROM players WHERE id = ? AND session_id = ?').get(req.params.pid, session.id);
  if (!player) return res.status(404).json({ error: 'Player not found' });

  const amount = Number(req.body.amount);
  if (isNaN(amount) || amount < 0) {
    return res.status(400).json({ error: 'Cash-out amount must be >= 0' });
  }

  try {
    prepare('UPDATE players SET cash_out = ? WHERE id = ?').run(amount, req.params.pid);

    // Update the existing cashout transaction
    const tx = prepare('SELECT id FROM transactions WHERE session_id = ? AND player_id = ? AND type = ? ORDER BY created_at DESC LIMIT 1').get(session.id, req.params.pid, 'cashout');
    if (tx) {
      prepare('UPDATE transactions SET amount = ? WHERE id = ?').run(amount, tx.id);
    }

    saveDb();
    const updated = prepare('SELECT * FROM players WHERE id = ?').get(req.params.pid);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update cash-out' });
  }
});

// Edit buy-in total
app.patch('/api/v1/sessions/:id/players/:pid/buyin', (req, res) => {
  const session = prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const player = prepare('SELECT * FROM players WHERE id = ? AND session_id = ?').get(req.params.pid, session.id);
  if (!player) return res.status(404).json({ error: 'Player not found' });

  const totalBuyIn = Number(req.body.total_buy_in);
  if (isNaN(totalBuyIn) || totalBuyIn <= 0) {
    return res.status(400).json({ error: 'Total buy-in must be > 0' });
  }

  try {
    prepare('UPDATE players SET total_buy_in = ? WHERE id = ?').run(totalBuyIn, req.params.pid);
    saveDb();
    const updated = prepare('SELECT * FROM players WHERE id = ?').get(req.params.pid);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update buy-in' });
  }
});

// Mark session as settled
app.post('/api/v1/sessions/:id/settle', (req, res) => {
  const session = prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  try {
    prepare("UPDATE sessions SET status = 'settled' WHERE id = ?").run(session.id);
    saveDb();
    const updated = prepare('SELECT * FROM sessions WHERE id = ?').get(session.id);
    const { admin_token, ...safe } = updated;
    res.json(safe);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to settle session' });
  }
});

// Get settlements
app.get('/api/v1/sessions/:id/settlements', (req, res) => {
  const session = prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const players = prepare('SELECT * FROM players WHERE session_id = ? ORDER BY created_at').all(session.id);

  // Only include players who have cashed out
  const cashedOut = players.filter(p => p.cash_out != null);

  if (cashedOut.length === 0) {
    return res.json({ balances: {}, settlements: [] });
  }

  const result = calculateSettlements(cashedOut);
  res.json(result);
});

// ==================== START ====================

async function start() {
  await initDb();
  const PORT = process.env.PORT || 3010;
  app.listen(PORT, () => {
    console.log(`PokerWise server running on port ${PORT}`);
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