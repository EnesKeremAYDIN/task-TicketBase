import prisma from '../lib/prisma';
import { AppError, ForbiddenError, ValidationError } from '../lib/errors';
import type { TicketRole, TicketStatus } from '../lib/state-machine';
import { calculateSLADeadlineValues } from './sla';
import { updateTicketStatus } from './ticket';

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
          auditNote: buildStatusAuditNote(operation.status, operation.reason),
        });
      } else if (operation.type === 'priority') {
        await updatePriority(ticket, operation.priority, priorityContext!, actorId);
      } else if (actorRole === 'agent') {
        await claimWithAudit(ticket.id, tenantId, actorId);
      } else {
        await updateAssignee(
          ticket.id,
          tenantId,
          operation.agentId,
          actorId,
          targetAgent?.name || null,
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
    createdAt: Date;
    firstResponseAt: Date | null;
    resolvedAt: Date | null;
  },
  priority: TicketPriority,
  context: Awaited<ReturnType<typeof getPriorityContext>>,
  actorId: string,
) {
  const now = new Date();
  const deadlines = calculateSLADeadlineValues(ticket.createdAt, context.policy, context.holidayDates);
  const firstResponseReference = ticket.firstResponseAt || now;
  const resolutionReference = ticket.resolvedAt || now;
  const slaBreached = firstResponseReference > deadlines.firstResponseSlaDue
    || resolutionReference > deadlines.slaDueAt;

  await prisma.$transaction(async (tx) => {
    const updateResult = await tx.ticket.updateMany({
      where: { id: ticket.id, tenantId: ticket.tenantId, priority: ticket.priority },
      data: {
        priority,
        firstResponseSlaDue: deadlines.firstResponseSlaDue,
        slaDueAt: deadlines.slaDueAt,
        slaBreached,
        lastActivityAt: now,
      },
    });

    if (updateResult.count === 0) {
      throw new ValidationError('Ticket önceliği değişti, işlem tekrar denenmeli');
    }

    await tx.comment.create({
      data: {
        ticketId: ticket.id,
        authorId: actorId,
        type: 'internal_note',
        body: `Toplu işlem: Öncelik "${priorityLabel(priority)}" olarak değiştirildi.`,
      },
    });
  });
}

async function claimWithAudit(ticketId: string, tenantId: string, actorId: string) {
  await prisma.$transaction(async (tx) => {
    const result = await tx.ticket.updateMany({
      where: {
        id: ticketId,
        tenantId,
        assignedToId: null,
        status: { in: ['new', 'open', 'pending'] },
      },
      data: { assignedToId: actorId, lastActivityAt: new Date() },
    });

    if (result.count === 0) {
      throw new ValidationError('Bu ticket atanmış veya üstlenmeye uygun değil');
    }

    await tx.comment.create({
      data: {
        ticketId,
        authorId: actorId,
        type: 'internal_note',
        body: 'Toplu işlem: Ticket agent tarafından üstlenildi.',
      },
    });
  });
}

async function updateAssignee(
  ticketId: string,
  tenantId: string,
  agentId: string | null,
  actorId: string,
  agentName: string | null,
) {
  await prisma.$transaction(async (tx) => {
    const result = await tx.ticket.updateMany({
      where: { id: ticketId, tenantId },
      data: { assignedToId: agentId, lastActivityAt: new Date() },
    });

    if (result.count === 0) {
      throw new ValidationError('Ticket ataması değiştirilemedi');
    }

    await tx.comment.create({
      data: {
        ticketId,
        authorId: actorId,
        type: 'internal_note',
        body: agentId
          ? `Toplu işlem: Ticket "${agentName}" ajanına atandı.`
          : 'Toplu işlem: Ticket ataması kaldırıldı.',
      },
    });
  });
}

function buildStatusAuditNote(status: TicketStatus, reason?: string) {
  const reasonText = reason?.trim() ? ` Neden: ${reason.trim()}` : '';
  return `Toplu işlem: Durum "${statusLabel(status)}" olarak değiştirildi.${reasonText}`;
}

function statusLabel(status: TicketStatus) {
  return {
    new: 'Yeni',
    open: 'Açık',
    pending: 'Beklemede',
    resolved: 'Çözüldü',
    closed: 'Kapalı',
  }[status];
}

function priorityLabel(priority: TicketPriority) {
  return {
    low: 'Düşük',
    normal: 'Normal',
    high: 'Yüksek',
    urgent: 'Acil',
  }[priority];
}
