import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import Group from './pages/Group';
import Login from './pages/Login';
import Logout from './pages/Logout';
import Admin from './pages/Admin';
import { api, AUTH_SERVICE } from './api';
import '@splitdumb/ui/styles.css';

function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const location = useLocation();

  useEffect(() => {
    api.me().then(user => {
      setLoggedIn(!!user?.role);
    }).catch(() => {
      setLoggedIn(false);
    }).finally(() => setAuthChecked(true));
  }, [location.pathname]);

  return (
    <div className="app">
      <div style={{
        padding: '14px 20px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backdropFilter: 'blur(12px)',
      }}>
        <Link to="/splitdumb/" style={{ textDecoration: 'none' }}>
          <span style={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)' }}>💸 SplitDumb</span>
        </Link>
        <div style={{ position: 'relative' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setMenuOpen(!menuOpen)}>☰</button>
          {menuOpen && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 6,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', padding: 6,
              minWidth: 160, zIndex: 150,
              boxShadow: 'var(--shadow-lg)',
              display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              <Link to="/splitdumb/" className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start', whiteSpace: 'nowrap' }}
                onClick={() => setMenuOpen(false)}>🏠 Home</Link>
              <Link to="/splitdumb/admin" className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start', whiteSpace: 'nowrap' }}
                onClick={() => setMenuOpen(false)}>⚙️ Admin</Link>
              {authChecked && (loggedIn ? (
                <Link to="/splitdumb/logout" className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start', whiteSpace: 'nowrap' }}
                  onClick={() => setMenuOpen(false)}>🚪 Logout</Link>
              ) : (
                <a href={`${AUTH_SERVICE}/login?from=${encodeURIComponent(window.location.origin + '/splitdumb/admin')}`}
                  className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start', whiteSpace: 'nowrap' }}
                  onClick={() => setMenuOpen(false)}>🔐 Login</a>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="app-main">
        <Routes>
          <Route path="/splitdumb/" element={<Home />} />
          <Route path="/splitdumb/group/:code" element={<Group />} />
          <Route path="/splitdumb/login" element={<Login />} />
          <Route path="/splitdumb/logout" element={<Logout />} />
          <Route path="/splitdumb/admin" element={<Admin />} />
        </Routes>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  );
}

export default App;
