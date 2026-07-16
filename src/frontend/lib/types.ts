export interface Tenant {
  id: string;
  slug: string;
  name: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'agent' | 'customer';
  tenant: Tenant;
}

export type Status = 'new' | 'open' | 'pending' | 'resolved' | 'closed';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';

export interface Ticket {
  id: string;
  displayId: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  customer: { id: string; name: string; email: string };
  assignedTo: { id: string; name: string } | null;
  comments: Comment[];
  lastComment: { body: string; createdAt: string; author: { name: string } } | null;
  createdAt: string;
  firstResponseAt: string | null;
  slaBreached: boolean;
  slaDueAt: string | null;
  firstResponseSlaDue: string | null;
}

export interface Comment {
  id: string;
  body: string;
  type: 'public_reply' | 'internal_note';
  author: { id: string; name: string; role: string };
  createdAt: string;
}

export interface DashboardStats {
  statusBreakdown: Record<string, number>;
  priorityBreakdown: Record<string, number>;
  slaBreached: number;
  agentWorkload: Record<string, number>;
}

export interface Agent {
  id: string;
  name: string;
  email: string;
}

export const STATUS_LABELS: Record<Status, string> = {
  new: 'Yeni',
  open: 'Açık',
  pending: 'Beklemede',
  resolved: 'Çözüldü',
  closed: 'Kapalı',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Düşük',
  normal: 'Normal',
  high: 'Yüksek',
  urgent: 'Acil',
};
