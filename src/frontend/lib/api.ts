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

async function request<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
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

interface LoginResponse {
  token: string;
  user: { id: string; name: string; email: string; role: string; tenant: { id: string; slug: string; name: string } };
}

interface TicketResponse {
  tickets: import('./types').Ticket[];
  total: number;
  page: number;
  limit: number;
}

interface RuleItem {
  kural: string;
  deger: string;
}

interface RulesResponse {
  rules: RuleItem[];
}

export async function login(email: string, password: string) {
  const data = await request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  return data.user;
}

export async function listTickets(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  return request<TicketResponse>(`/tickets${qs ? `?${qs}` : ''}`);
}

export async function getTicket(id: string) {
  return request<import('./types').Ticket & { comments?: import('./types').Comment[] }>(`/tickets/${id}`);
}

export async function createTicket(data: { title: string; description: string; priority?: string }) {
  return request<import('./types').Ticket>('/tickets', { method: 'POST', body: JSON.stringify(data) });
}

export async function bulkUpdateTickets(
  ticketIds: string[],
  operation: import('./types').BulkTicketOperation,
) {
  return request<import('./types').BulkTicketResult>('/tickets/bulk', {
    method: 'POST',
    body: JSON.stringify({ ticketIds, operation }),
  });
}

export async function updateTicketStatus(
  id: string,
  status: string,
  options: { pendingUntil?: string; pendingReason?: string; reason?: string } = {},
) {
  return request<import('./types').Ticket>(`/tickets/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, ...options }),
  });
}

export async function confirmResolution(id: string) {
  return request<import('./types').Ticket>(`/tickets/${id}/confirm-resolution`, { method: 'POST' });
}

export async function rejectResolution(id: string, reason: string) {
  return request<import('./types').Ticket>(`/tickets/${id}/reject-resolution`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function createFollowUp(id: string, description: string) {
  return request<import('./types').Ticket>(`/tickets/${id}/follow-up`, {
    method: 'POST',
    body: JSON.stringify({ description }),
  });
}

export async function claimTicket(id: string) {
  return request<import('./types').Ticket>(`/tickets/${id}/claim`, { method: 'POST' });
}

export async function assignTicket(id: string, agentId: string) {
  return request<import('./types').Ticket>(`/tickets/${id}/assign`, { method: 'POST', body: JSON.stringify({ agentId }) });
}

export async function getComments(ticketId: string) {
  return request<import('./types').Comment[]>(`/tickets/${ticketId}/comments`);
}

export async function getTicketActivities(ticketId: string, page = 1, limit = 50) {
  return request<import('./types').TicketActivityResponse>(
    `/tickets/${ticketId}/activities?page=${page}&limit=${limit}`,
  );
}

export async function createComment(ticketId: string, type: string, body: string) {
  return request<import('./types').Comment>(`/tickets/${ticketId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ type, body }),
  });
}

export async function getDashboard() {
  return request<import('./types').DashboardStats>('/sla/dashboard');
}

export async function getSlaBreaches(page = 1) {
  return request<{ tickets: import('./types').Ticket[]; total: number }>(`/sla/breaches?page=${page}&limit=20`);
}

export async function getRules() {
  return request<RulesResponse>('/rules');
}

export async function getAgents() {
  return request<import('./types').Agent[]>('/agents');
}
