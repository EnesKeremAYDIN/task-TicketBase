const API_BASE = '/api';

let authToken: string | null = localStorage.getItem('token');

export function setToken(token: string | null) {
  authToken = token;
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
}

export function getToken(): string | null {
  return authToken;
}

async function request(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    setToken(null);
    window.location.href = '/login';
    throw new Error('Oturum süresi doldu');
  }

  const body = await res.json();

  if (!res.ok) {
    throw new Error(body.message || 'Bir hata oluştu');
  }

  return body;
}

export async function login(email: string, password: string) {
  const data = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  return data.user;
}

export async function listTickets(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  return request(`/tickets${qs ? `?${qs}` : ''}`);
}

export async function getTicket(id: string) {
  return request(`/tickets/${id}`);
}

export async function createTicket(data: { title: string; description: string; priority?: string }) {
  return request('/tickets', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateTicketStatus(id: string, status: string) {
  return request(`/tickets/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

export async function claimTicket(id: string) {
  return request(`/tickets/${id}/claim`, { method: 'POST' });
}

export async function assignTicket(id: string, agentId: string) {
  return request(`/tickets/${id}/assign`, { method: 'POST', body: JSON.stringify({ agentId }) });
}

export async function getComments(ticketId: string) {
  return request(`/tickets/${ticketId}/comments`);
}

export async function createComment(ticketId: string, type: string, body: string) {
  return request(`/tickets/${ticketId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ type, body }),
  });
}

export async function getDashboard() {
  return request('/sla/dashboard');
}

export async function getSlaBreaches(page = 1) {
  return request(`/sla/breaches?page=${page}&limit=20`);
}

export async function getRules() {
  return request('/rules');
}
