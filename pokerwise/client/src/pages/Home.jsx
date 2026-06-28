import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function Home() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    location: '',
    date: '',
    buy_in_amount: 20,
  });
  const navigate = useNavigate();

  useEffect(() => {
    loadSessions();
  }, []);

  async function loadSessions() {
    try {
      const data = await api.listSessions();
      setSessions(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    try {
      const data = await api.createSession({
        location: formData.location.trim() || undefined,
        date: formData.date || undefined,
        buy_in_amount: Number(formData.buy_in_amount) || 20,
      });
      // Store admin token
      if (data.admin_token) {
        localStorage.setItem(`pokerwise_admin_${data.id}`, data.admin_token);
      }
      setShowForm(false);
      setFormData({ location: '', date: '', buy_in_amount: 20 });
      navigate(`/pokerwise/session/${data.id}`);
    } catch (err) {
      setError(err.message);
    }
  }

  const totalPot = (s) => s.total_pot || 0;

  return (
    <div className="page">
      <div className="hero">
        <span className="hero-icon">🃏</span>
        <h1 className="hero-title">PokerWise</h1>
        <p className="hero-sub">Track buy-ins, rebuys & cash-outs. Settle up in seconds.</p>
      </div>

      <div style={{ padding: '0 16px', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ New Session'}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label className="form-label">Location (optional)</label>
              <input
                className="form-input"
                type="text"
                placeholder="e.g. John's place"
                value={formData.location}
                onChange={e => setFormData({ ...formData, location: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Date (optional)</label>
              <input
                className="form-input"
                type="date"
                value={formData.date}
                onChange={e => setFormData({ ...formData, date: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Default Buy-in Amount ($)</label>
              <input
                className="form-input"
                type="number"
                min="1"
                step="1"
                value={formData.buy_in_amount}
                onChange={e => setFormData({ ...formData, buy_in_amount: e.target.value })}
              />
            </div>
            <button type="submit" className="btn btn-primary">Create Session</button>
          </form>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {loading ? (
        <div className="loading">
          <div className="spinner" />
          <p>Loading sessions…</p>
        </div>
      ) : sessions.length === 0 ? (
        <div className="empty-state">
          <span className="icon">🎴</span>
          <p>No sessions yet.</p>
          <p>Create one to get started!</p>
        </div>
      ) : (
        <>
          <div className="section-label">Past Sessions</div>
          <div className="recent-sessions">
            {sessions.map(s => (
              <Link
                key={s.id}
                to={`/pokerwise/session/${s.id}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div className="card" style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                        {s.location || 'Poker Night'}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: 2 }}>
                        {s.date ? new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        {' · '}
                        {s.player_count || 0} players
                        {' · '}
                        Pot: ${totalPot(s).toFixed(0)}
                      </div>
                    </div>
                    <span className={`badge badge-${s.status}`}>
                      {s.status}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}