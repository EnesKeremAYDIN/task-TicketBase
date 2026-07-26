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
export type TicketAction = Status | 'confirm_resolution' | 'reject_resolution' | 'create_follow_up';

export type BulkTicketOperation =
  | { type: 'status'; status: Exclude<Status, 'new'>; pendingUntil?: string; reason?: string }
  | { type: 'priority'; priority: Priority }
  | { type: 'assign'; agentId: string | null };

export interface BulkTicketResultItem {
  ticketId: string;
  displayId: string;
}

export interface BulkTicketResult {
  succeeded: BulkTicketResultItem[];
  failed: Array<BulkTicketResultItem & { reason: string }>;
}

export type TicketActivityType =
  | 'ticket_created'
  | 'status_changed'
  | 'priority_changed'
  | 'assignee_changed'
  | 'follow_up_created'
  | 'macro_applied';

export interface TicketActivity {
  id: string;
  type: TicketActivityType;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  oldLabel: string | null;
  newLabel: string | null;
  reason: string | null;
  source: 'web' | 'email' | 'bulk' | 'macro' | 'system' | 'seed';
  visibility: 'public' | 'internal';
  actor: { id: string; name: string; role: string } | null;
  createdAt: string;
}

export interface TicketActivityResponse {
  activities: TicketActivity[];
  total: number;
  page: number;
  limit: number;
}

export interface Ticket {
  id: string;
  displayId: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  category: string | null;
  customer: { id: string; name: string; email: string };
  assignedTo: { id: string; name: string } | null;
  comments: Comment[];
  lastComment: { body: string; createdAt: string; author: { name: string } } | null;
  createdAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  firstClosedAt: string | null;
  closedAt: string | null;
  lastReopenedAt: string | null;
  reopenCount: number;
  pendingUntil: string | null;
  pendingReason: string | null;
  lastActivityAt: string;
  followUpOf: { id: string; displayId: string; title: string } | null;
  allowedActions: TicketAction[];
  firstResponseSlaBreached: boolean;
  resolutionSlaBreached: boolean;
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
  activeTotal: number;
  slaBreached: number;
  agentWorkload: Record<string, number>;
  queueCounts: {
    myTickets: number;
    unassignedOpen: number;
    escalated: number;
  };
  slaBreachBreakdown: {
    firstResponse: number;
    resolution: number;
  };
}

export type TicketQueue = 'my' | 'unassigned' | 'escalated';

export interface CannedResponse {
  id: string;
  tenantId: string;
  name: string;
  body: string;
  commentType: 'public_reply' | 'internal_note';
  isActive: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export type MacroAction =
  | {
      type: 'comment';
      commentType: 'public_reply' | 'internal_note';
      body: string;
    }
  | {
      type: 'status';
      status: Exclude<Status, 'new'>;
      reason?: string;
      pendingOffsetHours?: number;
    }
  | {
      type: 'priority';
      priority: Priority;
    }
  | {
      type: 'assign_self';
    };

export interface TicketMacro {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  actions: MacroAction[];
  isActive: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  name: string;
  email: string;
}

export interface OperatingRule {
  kural: string;
  deger: string;
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
