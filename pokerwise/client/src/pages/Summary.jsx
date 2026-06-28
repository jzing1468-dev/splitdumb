import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';

export default function Summary() {
  const { id } = useParams();
  const [session, setSession] = useState(null);
  const [settlements, setSettlements] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    try {
      const [sess, sett] = await Promise.all([
        api.getSession(id),
        api.getSettlements(id),
      ]);
      setSession(sess);
      setSettlements(sett);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSettle() {
    try {
      await api.settleSession(id);
      // Reload to update badge
      const sess = await api.getSession(id);
      setSession(sess);
    } catch (err) {
      setError(err.message);
    }
  }

  function copyToClipboard(text, id) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  function buildVenmoUrl(player, amount) {
    if (!player.venmo_link) return null;
    const handle = player.venmo_link.replace('venmo.com/', '');
    return `https://venmo.com/${handle}?txn=pay&amount=${amount}`;
  }

  if (loading) {
    return <div className="loading"><div className="spinner" /><p>Loading summary…</p></div>;
  }

  if (!session) {
    return (
      <div className="page">
        {error && <div className="error">{error}</div>}
        <Link to={`/pokerwise/session/${id}`} className="btn btn-secondary">← Back</Link>
      </div>
    );
  }

  const players = session.players;
  const playerMap = {};
  players.forEach(p => { playerMap[p.id] = p; });

  const notCashedOut = players.filter(p => p.cash_out == null);
  const sortedPlayers = [...players].sort((a, b) => {
    const aNet = a.cash_out != null ? a.cash_out - a.total_buy_in : null;
    const bNet = b.cash_out != null ? b.cash_out - b.total_buy_in : null;
    if (aNet == null) return 1;
    if (bNet == null) return -1;
    return bNet - aNet;
  });

  return (
    <div className="page">
      {error && <div className="error" onClick={() => setError('')} style={{ cursor: 'pointer' }}>{error}</div>}

      {/* Header */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, letterSpacing: '-0.03em' }}>
              {session.location || 'Poker Night'}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginTop: 2 }}>
              {session.date ? new Date(session.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
              {' · '}{players.length} players
            </div>
          </div>
          <span className={`badge badge-${session.status}`}>{session.status}</span>
        </div>
      </div>

      {/* Warning for uncashed-out players */}
      {notCashedOut.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--amber)' }}>
          <div style={{ fontSize: '0.88rem', color: 'var(--amber)', fontWeight: 600 }}>
            ⚠️ {notCashedOut.length} player{notCashedOut.length > 1 ? 's' : ''} still playing
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginTop: 4 }}>
            {notCashedOut.map(p => p.name).join(', ')} — cash them out for accurate settlements.
          </div>
          <Link to={`/pokerwise/session/${id}`} className="btn btn-secondary btn-sm" style={{ marginTop: 8 }}>
            ← Back to session
          </Link>
        </div>
      )}

      {/* Results table */}
      <div className="card">
        <div className="section-label" style={{ padding: '0 0 10px' }}>Results</div>
        {sortedPlayers.map(player => {
          const net = player.cash_out != null ? player.cash_out - player.total_buy_in : null;
          return (
            <div
              key={player.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 0',
                borderBottom: '1px solid var(--border)',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="member-dot" style={{ background: player.color }} />
                <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>{player.name}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                {net != null ? (
                  <>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                      ${player.total_buy_in.toFixed(0)} → ${player.cash_out.toFixed(0)}
                    </div>
                    <div
                      className={net > 0 ? 'balance-positive' : net < 0 ? 'balance-negative' : 'balance-zero'}
                      style={{ fontWeight: 700, fontSize: '1.05rem' }}
                    >
                      {net > 0 ? '+' : ''}{net.toFixed(2)}
                    </div>
                  </>
                ) : (
                  <span style={{ fontSize: '0.82rem', color: 'var(--amber)' }}>still playing</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Settlements */}
      <div className="card">
        <div className="section-label" style={{ padding: '0 0 10px' }}>Settlements</div>
        {settlements && settlements.settlements.length > 0 ? (
          settlements.settlements.map((s, i) => {
            const fromPlayer = playerMap[s.from.id] || s.from;
            const toPlayer = playerMap[s.to.id] || s.to;
            const venmoUrl = buildVenmoUrl(toPlayer, s.amount);
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '13px 0',
                  borderBottom: '1px solid var(--border)',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                  <span className="member-dot" style={{ background: fromPlayer.color }} />
                  <span style={{ fontSize: '0.9rem' }}>
                    <strong>{s.from.name}</strong> owes <strong>{s.to.name}</strong>
                  </span>
                  <span className="member-dot" style={{ background: toPlayer.color }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem', fontVariantNumeric: 'tabular-nums' }}>
                    ${s.amount.toFixed(2)}
                  </span>
                  {venmoUrl && (
                    <a
                      href={venmoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pay-link pay-venmo"
                      onClick={() => copyToClipboard(venmoUrl, `settlement-${i}`)}
                    >
                      {copied === `settlement-${i}` ? '✓ Copied' : 'Venmo'}
                    </a>
                  )}
                  {toPlayer.zelle_handle && (
                    <button
                      className="pay-link pay-zelle"
                      onClick={() => copyToClipboard(toPlayer.zelle_handle, `zelle-${i}`)}
                    >
                      {copied === `zelle-${i}` ? '✓ Copied' : 'Zelle'}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="empty-state">
            <span className="icon">✅</span>
            <p>{notCashedOut.length > 0 ? 'Cash out all players to see settlements.' : 'All settled up — no debts!'}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="card">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {session.status === 'active' && notCashedOut.length === 0 && (
            <button className="btn btn-primary" onClick={handleSettle}>
              ✓ Mark as Settled
            </button>
          )}
          <Link to={`/pokerwise/session/${id}`} className="btn btn-secondary">
            ← Back to session
          </Link>
          <Link to="/pokerwise/" className="btn btn-ghost">
            🏠 Home
          </Link>
        </div>
      </div>
    </div>
  );
}