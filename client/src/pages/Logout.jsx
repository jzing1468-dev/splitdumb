import { useEffect, useState } from 'react';
import { authLogout, clearAuthState } from '../api';

function Logout() {
  const [done, setDone] = useState(false);

  useEffect(() => {
    authLogout()
      .then(() => {
        clearAuthState();
        setDone(true);
        setTimeout(() => { window.location.href = '/splitdumb/'; }, 1500);
      })
      .catch(() => {
        clearAuthState();
        setDone(true);
        setTimeout(() => { window.location.href = '/splitdumb/'; }, 1500);
      });
  }, []);

  if (!done) {
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center' }}>
        <div className="spinner" />
        <p style={{ marginTop: 12, color: 'var(--text-dim)' }}>Logging out...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '60px 24px', textAlign: 'center' }}>
      <p style={{ fontSize: '1.1rem', marginBottom: 20 }}>
        ✅ Logged out. Redirecting...
      </p>
    </div>
  );
}

export default Logout;