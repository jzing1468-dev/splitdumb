import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Group from './pages/Group';
import Login from './pages/Login';
import Admin from './pages/Admin';
import './App.css';

const BASE_PATH = '/splitdumb';

function App() {
  return (
    <BrowserRouter basename={BASE_PATH}>
      <div className="app">
        <header className="app-header">
          <h1 className="app-title"><a href="/splitdumb/" style={{ color: 'inherit', textDecoration: 'none' }}>💸 SplitDumb</a></h1>
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/group/:code" element={<Group />} />
            <Route path="/login" element={<Login />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;