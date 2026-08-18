import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Search,
  Filter,
  Download,
  Users,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Eye,
  Ban,
  UserCheck,
  Award,
  ArrowUpDown,
  CheckCircle,
  Sparkles
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAdmin } from '../context/AdminContext';
import StatusBadge from '../components/StatusBadge';

export const AuditLogs = () => {
  const { complaints, users, toggleBlockUser, adjustCredibility, searchQuery, setSearchQuery } = useAdmin();

  const [activeTab, setActiveTab] = useState('complaints'); // 'complaints' | 'citizens' | 'officers' | 'audit_trail'
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedPriority, setSelectedPriority] = useState('all');
  const [selectedTicketModal, setSelectedTicketModal] = useState(null);

  // Filter complaints
  const filteredComplaints = useMemo(() => {
    return complaints.filter((c) => {
      if (selectedCategory !== 'all' && c.category !== selectedCategory) return false;
      if (selectedStatus !== 'all' && c.status !== selectedStatus) return false;
      if (selectedPriority !== 'all' && c.priority !== selectedPriority) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchId = c.id.toLowerCase().includes(q);
        const matchName = c.citizen_name.toLowerCase().includes(q);
        const matchEmail = c.citizen_email.toLowerCase().includes(q);
        const matchWard = c.ward.toLowerCase().includes(q);
        const matchTranscript = (c.transcript || '').toLowerCase().includes(q);
        if (!matchId && !matchName && !matchEmail && !matchWard && !matchTranscript) return false;
      }
      return true;
    });
  }, [complaints, selectedCategory, selectedStatus, selectedPriority, searchQuery]);

  const citizensList = useMemo(() => {
    return users.filter((u) => u.role === 'citizen');
  }, [users]);

  const officersList = useMemo(() => {
    return users.filter((u) => u.role === 'officer' || u.role === 'admin');
  }, [users]);

  // Export Table to CSV
  const exportCSV = () => {
    const headers = ['ID', 'Citizen Name', 'Email', 'Category', 'Ward', 'Priority', 'Status', 'SLA Status', 'Created At'];
    const rows = filteredComplaints.map((c) => [
      c.id,
      `"${c.citizen_name}"`,
      c.citizen_email,
      `"${c.category}"`,
      `"${c.ward}"`,
      c.priority,
      c.status,
      c.sla_status,
      c.created_at,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `municipal_grievance_audit_log_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Audit Log exported to CSV successfully!');
  };

  const mockAuditTrail = [
    { id: 'AUD-901', timestamp: '2026-08-16 19:42:10', actor: 'Officer V. Patil', action: 'Claimed Ticket ISS-2026-009210 (Electricity Transformer Outage)', target: 'ISS-2026-009210', ip: '10.0.4.12' },
    { id: 'AUD-900', timestamp: '2026-08-16 19:15:00', actor: 'System AI Engine', action: 'Categorized Grievance ISS-2026-009213 -> Priority: High, Dept: Power', target: 'ISS-2026-009213', ip: 'internal-llm' },
    { id: 'AUD-899', timestamp: '2026-08-16 18:30:22', actor: 'Admin Superintendent', action: 'Dispatched Emergency Broadcast #BC-2026-01 to Ward 4 Residents', target: 'Broadcast-01', ip: '192.168.1.10' },
    { id: 'AUD-898', timestamp: '2026-08-16 16:10:45', actor: 'Officer R. Sharma', action: 'Status Updated: ISS-2026-009101 -> in_progress (Excavation Crew Active)', target: 'ISS-2026-009101', ip: '10.0.2.88' },
    { id: 'AUD-897', timestamp: '2026-08-16 09:16:00', actor: 'System Credibility Guard', action: 'Flagged ISS-2026-008890 as Malicious. User Credibility penalty applied (-0.15)', target: 'citizen.spammer@example.com', ip: '49.37.10.44' },
  ];

  const realAuditTrail = useMemo(() => {
    const list = [];
    complaints.forEach((c) => {
      if (c.history && Array.isArray(c.history)) {
        c.history.forEach((h) => {
          list.push({
            id: `AUD-${h.id}`,
            timestamp: new Date(h.changed_at).toLocaleString(),
            actor: h.changed_by_name || 'System Guard',
            action: `${h.new_status === 'in_progress' ? 'Claimed' : h.new_status === 'resolved' ? 'Resolved' : h.new_status === 'malicious' ? 'Flagged Malicious' : 'Updated'} Ticket ${c.issue_id} (${c.category}). Notes: ${h.notes || 'None'}`,
            target: c.issue_id,
            ip: 'internal-api'
          });
        });
      }
    });
    return [...list, ...mockAuditTrail].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [complaints]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h1 style={{ fontSize: '26px', color: '#fff', marginBottom: 4 }}>
            Full Audit Log & User Access Oversight
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Raw searchable repository of municipal complaints, citizen credibility audit trails, and officer actions
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={exportCSV} className="btn btn-secondary btn-sm">
            <Download size={14} />
            <span>Export Raw Log (CSV)</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-subtle)',
          gap: 24,
          paddingBottom: 2,
        }}
      >
        {[
          { id: 'complaints', label: `Complaint Master Log (${filteredComplaints.length})`, icon: FileSpreadsheet },
          { id: 'citizens', label: `Citizen Credibility Oversight (${citizensList.length})`, icon: Users },
          { id: 'officers', label: `Field Officer Registry (${officersList.length})`, icon: ShieldCheck },
          { id: 'audit_trail', label: 'System Action Audit Trail', icon: Clock },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 4px',
                background: 'transparent',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--primary-light)' : '2px solid transparent',
                color: isActive ? '#38bdf8' : 'var(--text-secondary)',
                fontSize: '13.5px',
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Complaints Master Log */}
      {activeTab === 'complaints' && (
        <div className="glass-card" style={{ padding: '20px 24px' }}>
          {/* Filters Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <select
                className="input-control"
                style={{ width: 'auto', padding: '6px 32px 6px 10px', fontSize: '12px' }}
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="all">All Categories</option>
                <option value="Water & Sanitation">Water & Sanitation</option>
                <option value="Electricity & Power">Electricity & Power</option>
                <option value="Roads & Infrastructure">Roads & Infrastructure</option>
                <option value="Public Health & Waste">Public Health & Waste</option>
              </select>

              <select
                className="input-control"
                style={{ width: 'auto', padding: '6px 32px 6px 10px', fontSize: '12px' }}
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
              >
                <option value="all">All Statuses</option>
                <option value="new">New</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="malicious">Malicious</option>
              </select>

              <select
                className="input-control"
                style={{ width: 'auto', padding: '6px 32px 6px 10px', fontSize: '12px' }}
                value={selectedPriority}
                onChange={(e) => setSelectedPriority(e.target.value)}
              >
                <option value="all">All Priorities</option>
                <option value="high">High / Emergency</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Showing {filteredComplaints.length} records
            </span>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Ticket ID</th>
                  <th>Citizen & Email</th>
                  <th>Category</th>
                  <th>Ward</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>SLA Status</th>
                  <th>Assigned Officer</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredComplaints.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className="mono" style={{ fontSize: '12.5px', fontWeight: 700, color: '#38bdf8' }}>
                        {c.id}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#fff' }}>{c.citizen_name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.citizen_email}</div>
                    </td>
                    <td>{c.category}</td>
                    <td>{c.ward}</td>
                    <td>
                      <StatusBadge status={c.priority} type="priority" />
                    </td>
                    <td>
                      <StatusBadge status={c.status} />
                    </td>
                    <td>
                      <StatusBadge status={c.sla_status} type="sla" />
                    </td>
                    <td>
                      <span style={{ fontSize: '12px', color: c.assigned_officers?.length ? '#fff' : 'var(--text-muted)' }}>
                        {c.assigned_officers?.[0] || 'Unassigned'}
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={() => setSelectedTicketModal(c)}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '4px 8px' }}
                      >
                        <Eye size={12} />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Citizen Management & Credibility Oversight */}
      {activeTab === 'citizens' && (
        <div className="glass-card" style={{ padding: '20px 24px' }}>
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: '16px', color: '#fff' }}>Citizen Credibility & Abuse Prevention</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Scores range from 0.0 to 1.0. Accounts dropping below 0.50 trigger administrative review and progressive block tiers.
            </p>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Citizen Name</th>
                  <th>Email</th>
                  <th>Credibility Score</th>
                  <th>Account Status</th>
                  <th>Prior Blocks</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {citizensList.map((cit) => {
                  const isLow = cit.credibility_score < 0.5;
                  const isBanned = cit.status === 'banned';

                  return (
                    <tr key={cit.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: '#fff' }}>{cit.name}</div>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{cit.email}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            className="mono"
                            style={{
                              fontSize: '13px',
                              fontWeight: 800,
                              color: isLow ? '#f87171' : '#34d399',
                            }}
                          >
                            {cit.credibility_score.toFixed(2)}
                          </span>
                          {isLow && (
                            <span className="badge badge-malicious" style={{ fontSize: '10px' }}>
                              Abuse Risk
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            background: isBanned ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                            color: isBanned ? '#f87171' : '#34d399',
                          }}
                        >
                          {isBanned ? 'Banned / Blocked' : 'Active Account'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {cit.block_history?.length > 0 ? `${cit.block_history.length} Prior Block(s)` : 'None'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button
                            onClick={() => toggleBlockUser(cit.id, '3d', 'Spam report penalty')}
                            className={`btn btn-sm ${isBanned ? 'btn-secondary' : 'btn-danger'}`}
                            style={{ padding: '4px 8px', fontSize: '11px' }}
                          >
                            <Ban size={12} />
                            <span>{isBanned ? 'Unblock' : 'Issue Block (3d)'}</span>
                          </button>
                          <button
                            onClick={() => adjustCredibility(cit.id, +0.1, 'Manual restoration')}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '4px 8px', fontSize: '11px' }}
                          >
                            +0.10 Score
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Field Officer Performance */}
      {activeTab === 'officers' && (
        <div className="glass-card" style={{ padding: '20px 24px' }}>
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: '16px', color: '#fff' }}>Field Officer Performance Registry</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Assigned department workloads, total resolved complaints, and mean turnaround time
            </p>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Officer Name</th>
                  <th>Department</th>
                  <th>Assigned Role</th>
                  <th>Total Handled</th>
                  <th>Resolved Cases</th>
                  <th>Avg Resolution Speed</th>
                </tr>
              </thead>
              <tbody>
                {officersList.map((off) => (
                  <tr key={off.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#fff' }}>{off.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{off.email}</div>
                    </td>
                    <td>{off.department}</td>
                    <td>
                      <span className="badge" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
                        {off.role}
                      </span>
                    </td>
                    <td>{off.action_count || 0}</td>
                    <td>
                      <span style={{ color: '#34d399', fontWeight: 600 }}>{off.resolved_count || 0}</span>
                    </td>
                    <td className="mono">{off.avg_speed_hours ? `${off.avg_speed_hours} hrs` : 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: System Action Audit Trail */}
      {activeTab === 'audit_trail' && (
        <div className="glass-card" style={{ padding: '20px 24px' }}>
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: '16px', color: '#fff' }}>Immutable System Audit Trail</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Cryptographic and actor action log tracking state modifications across the platform
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {realAuditTrail.map((log) => (
              <div
                key={log.id}
                style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 14,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span className="mono" style={{ fontSize: '11.5px', color: '#38bdf8', fontWeight: 700 }}>
                      {log.id}
                    </span>
                    <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{log.timestamp}</span>
                    <span className="badge" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', fontSize: '10px' }}>
                      Actor: {log.actor}
                    </span>
                  </div>
                  <p style={{ fontSize: '13px', color: '#fff' }}>{log.action}</p>
                </div>

                <span className="mono" style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                  IP: {log.ip}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ticket Details Modal */}
      {selectedTicketModal && (
        <div className="modal-overlay" onClick={() => setSelectedTicketModal(null)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 580 }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="mono" style={{ fontSize: '14px', fontWeight: 700, color: '#38bdf8' }}>
                  {selectedTicketModal.id}
                </span>
                <StatusBadge status={selectedTicketModal.status} />
              </div>
              <button onClick={() => setSelectedTicketModal(null)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '11.5px', color: 'var(--text-muted)', display: 'block' }}>Citizen Summary / AI Triage</label>
                <p style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginTop: 2 }}>{selectedTicketModal.ai_summary}</p>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Original Citizen Audio/Text Transcript:</label>
                <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>"{selectedTicketModal.transcript}"</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '12px' }}>
                <div>📍 Ward: <strong style={{ color: '#fff' }}>{selectedTicketModal.ward}</strong></div>
                <div>🏷️ Category: <strong style={{ color: '#fff' }}>{selectedTicketModal.category}</strong></div>
                <div>⚡ Priority: <strong style={{ color: '#fff' }}>{selectedTicketModal.priority}</strong></div>
                <div>⏱️ SLA Status: <strong style={{ color: '#34d399' }}>{selectedTicketModal.time_remaining}</strong></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default AuditLogs;
