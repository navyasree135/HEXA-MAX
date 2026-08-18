// In development, Vite proxies /officer/* and /citizen/* → http://localhost:8000
// Use empty base URL (relative) so all requests go through the proxy.
const API_BASE = import.meta.env.VITE_API_URL || '';

class ApiClient {
  constructor() {
    this.baseUrl = API_BASE.replace(/\/$/, '');
  }

  getToken() {
    return localStorage.getItem('citizen_ai_token');
  }

  getHeaders(isMultipart = false) {
    const headers = {};
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!isMultipart) headers['Content-Type'] = 'application/json';
    return headers;
  }

  async request(method, endpoint, data = null, isMultipart = false) {
    const url = `${this.baseUrl}${endpoint}`;
    const options = {
      method,
      headers: this.getHeaders(isMultipart),
    };

    if (data) {
      options.body = isMultipart ? data : JSON.stringify(data);
    }

    const response = await fetch(url, options);

    if (response.status === 401) {
      localStorage.removeItem('citizen_ai_token');
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
      throw new Error('Session expired. Please log in again.');
    }

    const result = await response.json().catch(() => ({ error: 'Invalid response format' }));

    if (!response.ok) {
      const errorMsg = result.detail || result.error || result.message || `HTTP ${response.status}`;
      throw new Error(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
    }

    return result;
  }

  get(endpoint) { return this.request('GET', endpoint); }
  post(endpoint, data, isMultipart = false) { return this.request('POST', endpoint, data, isMultipart); }
  patch(endpoint, data) { return this.request('PATCH', endpoint, data); }
  put(endpoint, data) { return this.request('PUT', endpoint, data); }
  delete(endpoint) { return this.request('DELETE', endpoint); }

  // 1. Officer Authentication (Supports both FastAPI Gateway & Node backend)
  async loginUser(credentials) {
    // Try FastAPI Gateway endpoint: /officer/auth/login
    const res = await this.post('/officer/auth/login', credentials);
    const token = res.access_token || res.token;
    const user = res.user || {
      id: res.user_id || 'officer-1',
      name: res.name || 'Officer',
      email: credentials.email,
      role: 'officer',
      officer_profile: {
        department: res.department || 'Water & Sewerage',
        region: res.region || 'Ward 4 (Central)',
        designation: res.designation || 'Field Officer',
      }
    };
    return { user, token };
  }

  async registerOfficer(data) { 
    // Send WebSocket broadcast to live Admin Portals
    try {
      const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/admin';
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'NEW_OFFICER_REGISTRATION',
          officer: {
            name: data.name,
            email: data.email,
            phone: data.phone,
            department: data.department || 'Revenue & Land Dept',
            department_id: data.department_id || 1,
            role: 'officer',
            designation: data.designation || 'Inspector',
            employee_id: data.employee_id,
            region: data.region || 'Ward 4 (Central)',
            status: 'pending',
          }
        }));
        setTimeout(() => ws.close(), 1200);
      };
    } catch (wsErr) {
      console.warn('WS Broadcast to admin portal:', wsErr);
    }

    // Post to backend gateway
    return await this.post('/officer/auth/register', data);
  }

  async getMe() { 
    try {
      const res = await this.get('/officer/me');
      return { user: res.user || res };
    } catch {
      return this.get('/auth/me');
    }
  }

  // 2. Officer Queue & Complaints (Supports /officer/queue and /complaints)
  async getComplaints(params = {}) {
    const query = new URLSearchParams(params).toString();
    try {
      // Try FastAPI gateway /officer/queue
      const res = await this.get(`/officer/queue?${query}`);
      const list = res.items || res.complaints || res;
      // Normalize FastAPI issue schema to frontend model if needed
      const normalized = Array.isArray(list) ? list.map(item => {
        const isAccepted = (item.status || '').toLowerCase() === 'in_progress' || (item.status || '').toLowerCase() === 'resolved';
        const claimHistory = item.history?.find(h => h.new_status === 'in_progress');
        const assignments = isAccepted ? [{
          action: 'accepted',
          officer: {
            name: claimHistory?.changed_by_name || 'Field Officer'
          }
        }] : [];

        return {
          id: item.id || item.issue_id,
          title: item.title || item.ai_summary || 'Municipal Grievance',
          description: item.description || item.transcript,
          department: item.department || item.department_name,
          region: item.ward || item.region || 'Mumbai',
          priority: (item.priority || 'normal').toLowerCase(),
          status: (item.status || 'pending').toLowerCase(),
          is_emergency: item.priority === 'emergency' || item.priority === 'high' || item.is_emergency,
          ai_summary: item.ai_summary || item.summary || item.description,
          sla_deadline: item.sla_deadline || item.target_resolution_at,
          created_at: item.created_at,
          citizen: item.citizen || { name: item.citizen_name || 'Citizen' },
          assignments: assignments,
          history: item.history || []
        };
      }) : [];
      return { complaints: normalized, total: res.total || normalized.length };
    } catch {
      // Fallback to /complaints
      return this.get(`/complaints?${query}`);
    }
  }

  // 3. Issue Detail
  async getComplaint(id) { 
    try {
      const res = await this.get(`/officer/issues/${id}`);
      const c = res.issue || res;
      const isAccepted = (c.status || '').toLowerCase() === 'in_progress' || (c.status || '').toLowerCase() === 'resolved';
      const claimHistory = c.history?.find(h => h.new_status === 'in_progress');
      const assignments = isAccepted ? [{
        action: 'accepted',
        officer: {
          name: claimHistory?.changed_by_name || 'Field Officer'
        }
      }] : [];

      return {
        complaint: {
          id: c.id,
          title: c.title || c.ai_summary || 'Municipal Grievance',
          description: c.description || c.transcript,
          department: c.department || c.department_name,
          region: c.ward || c.region,
          priority: (c.priority || 'normal').toLowerCase(),
          status: (c.status || 'pending').toLowerCase(),
          is_emergency: c.priority === 'emergency' || c.priority === 'high',
          ai_summary: c.ai_summary || c.description,
          sla_deadline: c.sla_deadline || c.target_resolution_at,
          created_at: c.created_at,
          citizen: c.citizen || { name: c.citizen_name || 'Citizen' },
          timeline: c.timeline || [],
          assignments: assignments,
          history: c.history || []
        }
      };
    } catch {
      return this.get(`/complaints/${id}`);
    }
  }

  // 4. Claim / Assign Complaint (Starts SLA)
  async assignComplaint(id, data) { 
    try {
      // Try FastAPI optimistic locking claim: PATCH /officer/issues/{id}/claim
      return await this.patch(`/officer/issues/${id}/claim`, { notes: data.notes || '' });
    } catch {
      // Fallback to Node backend: POST /complaints/{id}/assign
      return await this.post(`/complaints/${id}/assign`, data);
    }
  }

  // 5. Update Status & Timeline
  async updateComplaint(id, data) { 
    try {
      // Try FastAPI endpoint: PATCH /officer/issues/{id}/status
      return await this.patch(`/officer/issues/${id}/status`, { 
        status: data.new_status || 'in_progress', 
        action_taken: data.update_text || '',
        resolution_notes: data.update_text || '' 
      });
    } catch {
      // Fallback to Node backend: POST /complaints/{id}/update
      return await this.post(`/complaints/${id}/update`, data);
    }
  }

  // 6. Mark Malicious
  markMalicious(id, data) {
    return this.patch(`/officer/issues/${id}/mark-malicious`, data);
  }

  // 7. Notifications
  getNotifications() { return this.get('/officer/notifications').catch(() => this.get('/notifications')); }
  markNotificationRead(id) { return this.patch(`/notifications/${id}/read`); }
  markAllRead() { return this.patch('/notifications/read-all'); }

  // 8. Chatbot
  chatbot(message) { return this.post('/citizen/chatbot', { message }).catch(() => this.post('/chatbot', { message })); }
}

export const api = new ApiClient();
export default api;
