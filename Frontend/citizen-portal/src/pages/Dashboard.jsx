import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

const Dashboard = () => {
  const [user, setUser] = useState(null);
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('access_token');
        const headers = { Authorization: `Bearer ${token}` };
        
        const [profileRes, complaintsRes] = await Promise.all([
          api.get('/me', { headers }),
          api.get('/issues', { headers })
        ]);
        
        setUser(profileRes.data);
        setComplaints(complaintsRes.data.items || []);
      } catch (err) {
        console.error("Error fetching dashboard data", err);
        setError("Failed to load dashboard data. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  const getStatusColor = (status) => {
    switch(status) {
      case 'new': return 'var(--primary-blue)';
      case 'reviewed': return '#17a2b8';
      case 'in_progress': return 'var(--warning)';
      case 'resolved': return 'var(--success)';
      case 'malicious': return 'var(--error)';
      default: return 'var(--text-secondary)';
    }
  };

  if (loading) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
        <h2>Loading Dashboard...</h2>
      </div>
    );
  }

  // Calculate statistics
  const totalCount = complaints.length;
  const resolvedCount = complaints.filter(c => c.status === 'resolved').length;
  const inProgressCount = complaints.filter(c => c.status === 'in_progress').length;
  const pendingCount = complaints.filter(c => ['new', 'reviewed', 'forwarded'].includes(c.status)).length;
  
  // Get recent 3 complaints
  const recentComplaints = complaints.slice(0, 3);

  return (
    <div className="dashboard-page">
      <div className="mb-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2>Welcome back, {user?.name || 'Citizen'}</h2>
          <p className="text-secondary">Overview of your municipal grievance activity and portal status.</p>
        </div>
        
        {user && (
          <div className="card" style={{ padding: '1rem 1.5rem', marginBottom: 0, minWidth: '280px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Credibility Score</span>
              <span style={{ fontWeight: 700, color: user.credibility_score < 0.5 ? 'var(--error)' : 'var(--success)' }}>
                {(user.credibility_score * 100).toFixed(0)} / 100
              </span>
            </div>
            <div className="score-meter">
              <div 
                className="score-fill" 
                style={{ 
                  width: `${user.credibility_score * 100}%`,
                  background: user.credibility_score < 0.5 ? 'var(--error)' : 'var(--success)'
                }}
              ></div>
            </div>
            <p className="text-secondary mt-2" style={{ fontSize: '0.75rem', margin: 0 }}>
              {user.credibility_score < 0.5 
                ? 'Warning: Submitting false reports has reduced your score.' 
                : 'Maintain a high score for faster grievance resolution.'}
            </p>
          </div>
        )}
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {/* Statistics Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2rem'
      }}>
        <div className="card" style={{ padding: '1.5rem', margin: 0, textAlign: 'center' }}>
          <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Total Grievances</h4>
          <h1 style={{ fontSize: '2.5rem', margin: 0, color: 'var(--primary-blue)' }}>{totalCount}</h1>
        </div>
        <div className="card" style={{ padding: '1.5rem', margin: 0, textAlign: 'center' }}>
          <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Pending Action</h4>
          <h1 style={{ fontSize: '2.5rem', margin: 0, color: 'var(--warning)' }}>{pendingCount}</h1>
        </div>
        <div className="card" style={{ padding: '1.5rem', margin: 0, textAlign: 'center' }}>
          <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>In Progress</h4>
          <h1 style={{ fontSize: '2.5rem', margin: 0, color: '#17a2b8' }}>{inProgressCount}</h1>
        </div>
        <div className="card" style={{ padding: '1.5rem', margin: 0, textAlign: 'center' }}>
          <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Resolved</h4>
          <h1 style={{ fontSize: '2.5rem', margin: 0, color: 'var(--success)' }}>{resolvedCount}</h1>
        </div>
      </div>

      {/* Main Grid: Recent Activity & Quick Actions */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: '2rem'
      }}>
        {/* Quick Actions Card */}
        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ marginBottom: '1.5rem' }}>⚡ Quick Actions</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1.25rem'
          }}>
            <Link to="/report" style={{ textDecoration: 'none' }}>
              <div style={{
                padding: '1.25rem',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                background: 'var(--background)',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                height: '100%'
              }} className="quick-action-item">
                <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>🎤</span>
                <strong style={{ color: 'var(--text-primary)' }}>Report a Problem</strong>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.5rem 0 0 0' }}>
                  Use voice or text to log a municipal grievance.
                </p>
              </div>
            </Link>
            
            <Link to="/assistant" style={{ textDecoration: 'none' }}>
              <div style={{
                padding: '1.25rem',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                background: 'var(--background)',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                height: '100%'
              }} className="quick-action-item">
                <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>💬</span>
                <strong style={{ color: 'var(--text-primary)' }}>AI Assistant</strong>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.5rem 0 0 0' }}>
                  Ask questions and search municipal policies.
                </p>
              </div>
            </Link>

            <Link to="/emergency" style={{ textDecoration: 'none' }}>
              <div style={{
                padding: '1.25rem',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                background: 'var(--background)',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                height: '100%'
              }} className="quick-action-item">
                <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>🚨</span>
                <strong style={{ color: 'var(--text-primary)' }}>Emergency SOS</strong>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.5rem 0 0 0' }}>
                  Quickly access critical department hotlines.
                </p>
              </div>
            </Link>
          </div>
        </div>

        {/* Recent Activity Card */}
        <div className="card" style={{ margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0 }}>📋 Recent Complaints</h3>
            {totalCount > 0 && (
              <Link to="/my-complaints" style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                View All →
              </Link>
            )}
          </div>

          {recentComplaints.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <p className="text-secondary">You haven't filed any grievances yet.</p>
              <Link to="/report">
                <button className="btn btn-primary" style={{ marginTop: '0.5rem' }}>File Your First Complaint</button>
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {recentComplaints.map(issue => (
                <div key={issue.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1rem 1.25rem',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  background: 'var(--background)',
                  flexWrap: 'wrap',
                  gap: '1rem'
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <strong style={{ fontSize: '0.95rem' }}>{issue.issue_id}</strong>
                      <span style={{
                        backgroundColor: getStatusColor(issue.status),
                        color: (issue.status === 'in_progress' || issue.status === 'new') ? '#000' : '#fff',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        textTransform: 'uppercase'
                      }}>
                        {issue.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      Category: <strong>{issue.category}</strong> • Filed: {new Date(issue.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <Link to={`/my-complaints/${issue.id}`}>
                    <button style={{
                      padding: '0.5rem 1rem',
                      background: 'transparent',
                      border: '1px solid var(--primary-blue)',
                      color: 'var(--primary-blue)',
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: 'bold'
                    }}>
                      Track
                    </button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
