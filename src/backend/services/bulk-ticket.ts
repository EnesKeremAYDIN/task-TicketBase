import prisma from '../lib/prisma';
import { AppError, ForbiddenError, ValidationError } from '../lib/errors';
import type { TicketRole, TicketStatus } from '../lib/state-machine';
import {
  calculateSLADeadlineValues,
  isFirstResponseSlaBreached,
  isResolutionSlaBreached,
} from './sla';
import { updateTicketStatus } from './ticket';
import { recordTicketActivity } from './ticket-activity';

type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export type BulkTicketOperation =
  | { type: 'status'; status: TicketStatus; pendingUntil?: Date; reason?: string }
  | { type: 'priority'; priority: TicketPriority }
  | { type: 'assign'; agentId: string | null };

interface BulkResultItem {
  ticketId: string;
  displayId: string;
}

interface BulkFailureItem extends BulkResultItem {
  reason: string;
}

export interface BulkTicketResult {
  succeeded: BulkResultItem[];
  failed: BulkFailureItem[];
}

export async function bulkUpdateTickets(
  ticketIds: string[],
  tenantId: string,
  actorId: string,
  actorRole: Exclude<TicketRole, 'customer'>,
  operation: BulkTicketOperation,
): Promise<BulkTicketResult> {
  validateBulkAssignment(actorId, actorRole, operation);

  const tickets = await prisma.ticket.findMany({
    where: { id: { in: ticketIds }, tenantId },
  });
  const ticketMap = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  const result: BulkTicketResult = { succeeded: [], failed: [] };

  const priorityContext = operation.type === 'priority'
    ? await getPriorityContext(tenantId, operation.priority)
    : null;

  const targetAgent = operation.type === 'assign' && operation.agentId
    ? await prisma.user.findFirst({
      where: { id: operation.agentId, tenantId, role: 'agent' },
      select: { id: true, name: true },
    })
    : null;

  if (operation.type === 'assign' && operation.agentId && !targetAgent) {
    throw new ValidationError('Geçersiz ajan');
  }

  const currentAssigneeIds = operation.type === 'assign' && actorRole === 'admin'
    ? [...new Set(tickets.map((ticket) => ticket.assignedToId).filter((id): id is string => Boolean(id)))]
    : [];
  const currentAssignees = currentAssigneeIds.length > 0
    ? await prisma.user.findMany({
      where: { id: { in: currentAssigneeIds }, tenantId },
      select: { id: true, name: true },
    })
    : [];
  const currentAssigneeMap = new Map(currentAssignees.map((agent) => [agent.id, agent.name]));

  for (const ticketId of ticketIds) {
    const ticket = ticketMap.get(ticketId);
    if (!ticket) {
      result.failed.push({ ticketId, displayId: ticketId, reason: 'Ticket bulunamadı' });
      continue;
    }

    try {
      if (operation.type === 'status') {
        await updateTicketStatus(ticket.id, tenantId, operation.status, actorId, actorRole, {
          pendingUntil: operation.pendingUntil,
          pendingReason: operation.reason,
          reason: operation.reason,
          source: 'bulk',
        });
      } else if (operation.type === 'priority') {
        await updatePriority(ticket, operation.priority, priorityContext!, actorId);
      } else if (actorRole === 'agent') {
        await claimWithActivity(ticket.id, tenantId, actorId, targetAgent?.name || 'Agent');
      } else {
        await updateAssignee(
          ticket,
          tenantId,
          operation.agentId,
          actorId,
          targetAgent?.name || null,
          ticket.assignedToId ? currentAssigneeMap.get(ticket.assignedToId) || null : null,
        );
      }

      result.succeeded.push({ ticketId, displayId: ticket.displayId });
    } catch (error) {
      result.failed.push({
        ticketId,
        displayId: ticket.displayId,
        reason: error instanceof AppError ? error.message : 'İşlem tamamlanamadı',
      });
    }
  }

  return result;
}

function validateBulkAssignment(
  actorId: string,
  actorRole: Exclude<TicketRole, 'customer'>,
  operation: BulkTicketOperation,
) {
  if (operation.type !== 'assign' || actorRole !== 'agent') return;

  if (operation.agentId !== actorId) {
    throw new ForbiddenError('Agent yalnızca atanmamış ticketları kendine alabilir');
  }
}

async function getPriorityContext(tenantId: string, priority: TicketPriority) {
  const [policy, holidays] = await Promise.all([
    prisma.sLAPolicy.findUnique({
      where: { tenantId_priority: { tenantId, priority } },
    }),
    prisma.holiday.findMany({
      where: { tenantId },
      select: { date: true },
    }),
  ]);

  if (!policy) {
    throw new ValidationError('Bu öncelik için SLA politikası bulunamadı');
  }

  return { policy, holidayDates: holidays.map((holiday) => holiday.date) };
}

async function updatePriority(
  ticket: {
    id: string;
    tenantId: string;
    priority: string;
    status: string;
    createdAt: Date;
    firstResponseAt: Date | null;
    resolvedAt: Date | null;
    firstResponseSlaBreached: boolean;
    resolutionSlaBreached: boolean;
  },
  priority: TicketPriority,
  context: Awaited<ReturnType<typeof getPriorityContext>>,
  actorId: string,
) {
  if (ticket.priority === priority) return;

  const now = new Date();
  const deadlines = calculateSLADeadlineValues(ticket.createdAt, context.policy, context.holidayDates);
  const firstResponseReference = ticket.firstResponseAt || now;
  const resolutionReference = ['resolved', 'closed'].includes(ticket.status)
    ? ticket.resolvedAt || now
    : now;
  const firstResponseSlaBreached = ticket.firstResponseSlaBreached
    || isFirstResponseSlaBreached(firstResponseReference, deadlines.firstResponseSlaDue);
  const resolutionSlaBreached = ticket.resolutionSlaBreached
    || isResolutionSlaBreached(resolutionReference, deadlines.slaDueAt);

  await prisma.$transaction(async (tx) => {
    const updateResult = await tx.ticket.updateMany({
      where: { id: ticket.id, tenantId: ticket.tenantId, priority: ticket.priority },
      data: {
        priority,
        firstResponseSlaDue: deadlines.firstResponseSlaDue,
        slaDueAt: deadlines.slaDueAt,
        firstResponseSlaBreached,
        resolutionSlaBreached,
        slaBreached: firstResponseSlaBreached || resolutionSlaBreached,
        lastActivityAt: now,
      },
    });

    if (updateResult.count === 0) {
      throw new ValidationError('Ticket önceliği değişti, işlem tekrar denenmeli');
    }

    await recordTicketActivity(tx, {
      tenantId: ticket.tenantId,
      ticketId: ticket.id,
      actorId,
      type: 'priority_changed',
      field: 'priority',
      oldValue: ticket.priority,
      newValue: priority,
      source: 'bulk',
      visibility: 'internal',
      createdAt: now,
    });
  });
}

async function claimWithActivity(
  ticketId: string,
  tenantId: string,
  actorId: string,
  actorName: string,
) {
  await prisma.$transaction(async (tx) => {
    const now = new Date();
    const result = await tx.ticket.updateMany({
      where: {
        id: ticketId,
        tenantId,
        assignedToId: null,
        status: { in: ['new', 'open', 'pending'] },
      },
      data: { assignedToId: actorId, lastActivityAt: now },
    });

    if (result.count === 0) {
      throw new ValidationError('Bu ticket atanmış veya üstlenmeye uygun değil');
    }

    await recordTicketActivity(tx, {
      tenantId,
      ticketId,
      actorId,
      type: 'assignee_changed',
      field: 'assignedToId',
      oldValue: null,
      newValue: actorId,
      oldLabel: 'Atanmamış',
      newLabel: actorName,
      source: 'bulk',
      visibility: 'internal',
      createdAt: now,
    });
  });
}

async function updateAssignee(
  ticket: { id: string; assignedToId: string | null },
  tenantId: string,
  agentId: string | null,
  actorId: string,
  agentName: string | null,
  oldAgentName: string | null,
) {
  if (ticket.assignedToId === agentId) return;

  await prisma.$transaction(async (tx) => {
    const now = new Date();
    const result = await tx.ticket.updateMany({
      where: { id: ticket.id, tenantId, assignedToId: ticket.assignedToId },
      data: { assignedToId: agentId, lastActivityAt: now },
    });

    if (result.count === 0) {
      throw new ValidationError('Ticket ataması değiştirilemedi');
    }

    await recordTicketActivity(tx, {
      tenantId,
      ticketId: ticket.id,
      actorId,
      type: 'assignee_changed',
      field: 'assignedToId',
      oldValue: ticket.assignedToId,
      newValue: agentId,
      oldLabel: oldAgentName || 'Atanmamış',
      newLabel: agentName || 'Atanmamış',
      source: 'bulk',
      visibility: 'internal',
      createdAt: now,
    });
  });
}
