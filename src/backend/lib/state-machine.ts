import { ValidationError } from './errors';

const TRANSITIONS: Record<string, string[]> = {
  new: ['open'],
  open: ['pending', 'resolved', 'closed'],
  pending: ['open', 'closed'],
  resolved: ['closed'],
  closed: [],
};

const VALID_STATUSES = Object.keys(TRANSITIONS);

export function isValidStatus(status: string): boolean {
  return VALID_STATUSES.includes(status);
}

export function isValidTransition(from: string, to: string): boolean {
  const allowed = TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

export function validateTransition(from: string, to: string): void {
  if (!isValidStatus(from)) {
    throw new ValidationError(`Geçersiz kaynak durum: ${from}`);
  }

  if (!isValidStatus(to)) {
    throw new ValidationError(`Geçersiz hedef durum: ${to}`);
  }

  if (!isValidTransition(from, to)) {
    throw new ValidationError(`'${from}' durumundan '${to}' durumuna geçiş yapılamaz`);
  }
}
