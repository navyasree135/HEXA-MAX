import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import ReportComplaint from './pages/ReportComplaint';
import MyComplaints from './pages/MyComplaints';
import ComplaintDetails from './pages/ComplaintDetails';
import AIChatbot from './pages/AIChatbot';
import CallAgent from './pages/CallAgent';
import Emergency from './pages/Emergency';
import Settings from './pages/Settings';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import './index.css';

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('access_token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

const RootRoute = () => {
  const token = localStorage.getItem('access_token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to="/dashboard" replace />;
};

function App() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      setIsDark(true);
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }, []);

  const toggleTheme = () => {
    setIsDark(prev => {
      const newTheme = !prev;
      document.documentElement.setAttribute('data-theme', newTheme ? 'dark' : 'light');
      localStorage.setItem('theme', newTheme ? 'dark' : 'light');
      return newTheme;
    });
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    window.location.href = '/login';
  };

  return (
    <Router>
      <div className="app-container">
        <header className="header">
          <div className="brand">
            <Link to="/" style={{color: 'white', textDecoration: 'none'}}><h1>Citizen Portal</h1></Link>
          </div>
          <nav>
            <button onClick={toggleTheme} style={{ marginRight: '1rem', background: 'transparent', border: '1px solid var(--border)', padding: '0.25rem 0.75rem' }} title="Toggle Theme">
              {isDark ? '☀️ Light' : '🌙 Dark'}
            </button>
            {localStorage.getItem('access_token') ? (
              <>
                <Link to="/dashboard" style={{marginRight: '1rem'}}>Dashboard</Link>
                <Link to="/report" style={{marginRight: '1rem'}}>Report</Link>
                <Link to="/my-complaints" style={{marginRight: '1rem'}}>My Complaints</Link>
                <Link to="/assistant" style={{marginRight: '1rem'}}>Chatbot</Link>
                <Link to="/call-agent" style={{marginRight: '1rem'}}>Call Agent</Link>
                <Link to="/emergency" style={{marginRight: '1rem'}}>Emergency</Link>
                <Link to="/settings" style={{marginRight: '1rem'}}>Settings ⚙️</Link>
                <button onClick={handleLogout}>Logout</button>
              </>
            ) : (
              <div>
                <Link to="/emergency" style={{marginRight: '1rem'}}>Emergency</Link>
                <Link to="/login" style={{marginRight: '1rem'}}>Login</Link>
                <Link to="/register">Sign Up</Link>
              </div>
            )}
          </nav>
        </header>

        <main className="main-content">
          <Routes>
            <Route path="/" element={<RootRoute />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/emergency" element={<Emergency />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/report" element={<ProtectedRoute><ReportComplaint /></ProtectedRoute>} />
            <Route path="/my-complaints" element={<ProtectedRoute><MyComplaints /></ProtectedRoute>} />
            <Route path="/my-complaints/:id" element={<ProtectedRoute><ComplaintDetails /></ProtectedRoute>} />
            <Route path="/assistant" element={<ProtectedRoute><AIChatbot /></ProtectedRoute>} />
            <Route path="/call-agent" element={<ProtectedRoute><CallAgent /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
