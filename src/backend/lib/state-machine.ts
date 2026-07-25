import { ValidationError } from './errors';

export const TICKET_STATUSES = ['new', 'open', 'pending', 'resolved', 'closed'] as const;
export type TicketStatus = typeof TICKET_STATUSES[number];
export const ACTIVE_TICKET_STATUSES = ['new', 'open', 'pending'] as const;
export type TicketQueue = 'my' | 'unassigned' | 'escalated';
export type TicketRole = 'admin' | 'agent' | 'customer';
export type TicketAction = TicketStatus | 'confirm_resolution' | 'reject_resolution' | 'create_follow_up';

const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  new: ['open'],
  open: ['pending', 'resolved'],
  pending: ['open', 'resolved'],
  resolved: ['open', 'closed'],
  closed: ['open'],
};

export function isValidStatus(status: string): status is TicketStatus {
  return TICKET_STATUSES.includes(status as TicketStatus);
}

export function getAllowedTransitions(status: string, role: TicketRole): TicketStatus[] {
  if (!isValidStatus(status)) return [];

  if (role === 'customer') {
    return status === 'resolved' ? ['open', 'closed'] : [];
  }

  const transitions = TRANSITIONS[status];
  if (role === 'admin') return [...transitions];

  return transitions.filter((target) => target !== 'closed' && status !== 'closed');
}

export function getAllowedActions(status: string, role: TicketRole): TicketAction[] {
  if (!isValidStatus(status)) return [];

  if (role === 'customer') {
    if (status === 'resolved') return ['confirm_resolution', 'reject_resolution'];
    if (status === 'closed') return ['create_follow_up'];
    return [];
  }

  return getAllowedTransitions(status, role);
}

export function isValidTransition(from: string, to: string, role: TicketRole): boolean {
  if (!isValidStatus(from) || !isValidStatus(to)) return false;
  const allowed = TRANSITIONS[from];
  return allowed.includes(to) && getAllowedTransitions(from, role).includes(to);
}

export function validateTransition(from: string, to: string, role: TicketRole): void {
  if (!isValidStatus(from)) {
    throw new ValidationError(`Geçersiz kaynak durum: ${from}`);
  }

  if (!isValidStatus(to)) {
    throw new ValidationError(`Geçersiz hedef durum: ${to}`);
  }

  if (!isValidTransition(from, to, role)) {
    throw new ValidationError(`'${from}' durumundan '${to}' durumuna geçiş yapılamaz`);
  }
}
