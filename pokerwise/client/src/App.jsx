import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import Session from './pages/Session';
import Summary from './pages/Summary';
import '@pokerwise/ui/styles.css';

function Layout() {
  const location = useLocation();
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
        <Link to="/pokerwise/" style={{ textDecoration: 'none' }}>
          <span style={{
            fontSize: '1.15rem',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            color: 'var(--text)'
          }}>🃏 PokerWise</span>
        </Link>
      </div>

      <div className="app-main" key={location.pathname}>
        <Routes>
          <Route path="/pokerwise/" element={<Home />} />
          <Route path="/pokerwise/session/:id" element={<Session />} />
          <Route path="/pokerwise/session/:id/summary" element={<Summary />} />
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