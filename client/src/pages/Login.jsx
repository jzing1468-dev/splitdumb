import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, AUTH_SERVICE } from '../api';

function Login() {
  const [authUser, setAuthUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api.me().then(user => {
      setAuthUser(user);
      setChecking(false);
    }).catch(() => {
      setAuthUser(null);
      setChecking(false);
    });
  }, []);

  if (checking) {
    return <div className="loading"><div className="spinner" /><p>Checking auth...</p></div>;
  }

  if (authUser) {
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: '1.1rem', marginBottom: 20 }}>
          ✅ Logged in as <strong>{authUser.username}</strong> ({authUser.role})
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320, margin: '0 auto' }}>
          <Link to="/splitdumb/admin" className="btn btn-primary">Go to Admin Panel</Link>
          <Link to="/splitdumb/" className="btn btn-secondary">← Back to Home</Link>
        </div>
      </div>
    );
  }

  // Not authenticated — show login prompt with back option
  const authUrl = `${AUTH_SERVICE}/login?from=${encodeURIComponent(window.location.origin + '/splitdumb/admin')}`;
  return (
    <div style={{ padding: '60px 24px', textAlign: 'center' }}>
      <p style={{ fontSize: '1rem', marginBottom: 20, color: 'var(--text-dim)' }}>
        You need to log in to access the admin panel.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320, margin: '0 auto' }}>
        <a href={authUrl} className="btn btn-primary">🔐 Log in</a>
        <Link to="/splitdumb/" className="btn btn-secondary">← Back to Home</Link>
      </div>
    </div>
  );
}

export default Login;
