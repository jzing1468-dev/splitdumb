import { useState } from 'react';
import { api } from '../api';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api.login(username, password);
      // Store auth state
      localStorage.setItem('splitdumb_auth', JSON.stringify(result.user));
      window.location.href = '/splitdumb/';
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
      <div style={{ width: '100%', maxWidth: 320 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>🔐 Admin Login</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginTop: 8 }}>Required to delete groups, remove members, or delete expenses</p>
        </div>

        {error && <div className="error" style={{ margin: '0 0 16px' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              className="form-input"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="admin"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading || !username || !password}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;