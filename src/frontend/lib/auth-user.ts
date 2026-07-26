import type { User } from './types';

export function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) as User : null;
  } catch {
    return null;
  }
}

export function getDefaultPath(user: User | null) {
  return user?.role === 'agent' || user?.role === 'admin'
    ? '/dashboard'
    : '/tickets';
}
