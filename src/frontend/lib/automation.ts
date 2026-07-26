import type { MacroAction, Ticket, User } from './types';

export function renderCannedTemplate(template: string, ticket: Ticket, user: User | null) {
  const replacements: Record<string, string> = {
    'customer.name': ticket.customer?.name || '',
    'ticket.displayId': ticket.displayId,
    'ticket.title': ticket.title,
    'agent.name': user?.name || '',
  };

  return template.replace(/{{\s*([^{}]+?)\s*}}/g, (_match, key: string) => (
    replacements[key.trim()] || ''
  ));
}

export function macroActionLabel(action: MacroAction) {
  if (action.type === 'comment') {
    return action.commentType === 'public_reply' ? 'Genel yanıt ekle' : 'İç not ekle';
  }
  if (action.type === 'priority') return `Öncelik: ${action.priority}`;
  if (action.type === 'assign_self') return 'Çalıştıran ajana ata';
  if (action.status === 'pending') {
    return `Beklemeye al: ${action.pendingOffsetHours} saat`;
  }
  return `Durum: ${action.status}`;
}
