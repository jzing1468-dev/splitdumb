import { useState, useEffect } from 'react';
import { api } from '../api';

// This component checks auth status and shows admin link or login redirect
function Login() {
  const [authUser, setAuthUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Check if already logged in via shared auth cookie
    api.me().then(user => {
      setAuthUser(user);
      setChecking(false);
    }).catch(() => {
      setAuthUser(null);
      setChecking(false);
    });
  }, []);

  if (checking) {
    return <div className="loading"><div className="spinner"></div><p>Checking auth...</p></div>;
  }

  if (authUser) {
    // Already logged in
    return (
      <div className="page" style={{ textAlign: 'center', paddingTop: 80 }}>
        <p style={{ fontSize: '1.1rem', marginBottom: 16 }}>✅ Logged in as <strong>{authUser.username}</strong> ({authUser.role})</p>
        <a href="/splitdumb/admin" className="btn btn-primary" style={{ display: 'inline-block', textDecoration: 'none' }}>Go to Admin Panel</a>
      </div>
    );
  }

  // Not logged in — redirect to shared auth
  const authUrl = 'https://auth.johnzhong.win/login?from=' + encodeURIComponent(window.location.origin + '/splitdumb/admin');
  window.location.href = authUrl;
  return <div className="loading"><p>Redirecting to login...</p></div>;
}

export default Login;