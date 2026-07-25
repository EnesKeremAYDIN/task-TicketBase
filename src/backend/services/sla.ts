import prisma from '../lib/prisma';
import { addBusinessMinutes } from '../lib/business-hours';
import { ACTIVE_TICKET_STATUSES, type TicketRole } from '../lib/state-machine';
import { createTicketActivities } from './ticket-activity';

const BUSINESS_HOURS_PER_DAY = 9;

const BREACH_BATCH_SIZE = 1000;

export interface SLADeadlinePolicy {
  firstResponseH: number;
  resolutionH: number;
  resolutionIsBD: boolean;
}

export function calculateSLADeadlineValues(
  createdAt: Date,
  slaPolicy: SLADeadlinePolicy,
  holidayDates: Date[],
) {
  const firstResponseMinutes = slaPolicy.firstResponseH * 60;
  const firstResponseSlaDue = addBusinessMinutes(createdAt, firstResponseMinutes, holidayDates);

  const resolutionMinutes = slaPolicy.resolutionIsBD
    ? slaPolicy.resolutionH * BUSINESS_HOURS_PER_DAY * 60
    : slaPolicy.resolutionH * 60;

  const slaDueAt = addBusinessMinutes(createdAt, resolutionMinutes, holidayDates);

  return { firstResponseSlaDue, slaDueAt };
}

export function isFirstResponseSlaBreached(
  firstResponseAt: Date,
  firstResponseSlaDue: Date | null,
): boolean {
  return Boolean(firstResponseSlaDue && firstResponseAt > firstResponseSlaDue);
}

export function isResolutionSlaBreached(
  resolvedAt: Date,
  slaDueAt: Date | null,
): boolean {
  return Boolean(slaDueAt && resolvedAt > slaDueAt);
}

export async function calculateTenantSLADeadlineValues(
  tenantId: string,
  priority: string,
  startAt: Date,
) {
  const [slaPolicy, holidays] = await Promise.all([
    prisma.sLAPolicy.findUnique({
      where: { tenantId_priority: { tenantId, priority } },
    }),
    prisma.holiday.findMany({
      where: { tenantId },
      select: { date: true },
    }),
  ]);

  if (!slaPolicy) return null;

  return calculateSLADeadlineValues(
    startAt,
    slaPolicy,
    holidays.map((holiday) => holiday.date),
  );
}

export async function calculateSLADeadlines(ticketId: string, tenantId: string): Promise<void> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, priority: true, createdAt: true, tenantId: true },
  });

  if (!ticket) return;

  const deadlines = await calculateTenantSLADeadlineValues(tenantId, ticket.priority, ticket.createdAt);
  if (!deadlines) return;

  await prisma.ticket.update({
    where: { id: ticketId },
    data: deadlines,
  });
}

export async function markBreachedTickets(tenantId?: string): Promise<number> {
  const now = new Date();

  const baseFilter = {
    status: { notIn: ['resolved', 'closed'] },
    ...(tenantId ? { tenantId } : {}),
  };

  const [resolutionBreached, firstResponseBreached] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        ...baseFilter,
        resolutionSlaBreached: false,
        slaDueAt: { not: null, lt: now },
      },
      select: { id: true },
    }),
    prisma.ticket.findMany({
      where: {
        ...baseFilter,
        firstResponseSlaBreached: false,
        firstResponseSlaDue: { not: null, lt: now },
        firstResponseAt: null,
      },
      select: { id: true },
    }),
  ]);

  const resolutionIds = resolutionBreached.map((ticket) => ticket.id);
  const firstResponseIds = firstResponseBreached.map((ticket) => ticket.id);
  const breachedIds = [...new Set([...resolutionIds, ...firstResponseIds])];

  if (breachedIds.length === 0) return 0;

  for (let index = 0; index < firstResponseIds.length; index += BREACH_BATCH_SIZE) {
    const batch = firstResponseIds.slice(index, index + BREACH_BATCH_SIZE);
    await prisma.ticket.updateMany({
      where: {
        id: { in: batch },
        ...baseFilter,
        firstResponseSlaBreached: false,
        firstResponseSlaDue: { not: null, lt: now },
        firstResponseAt: null,
      },
      data: { firstResponseSlaBreached: true, slaBreached: true },
    });
  }

  for (let index = 0; index < resolutionIds.length; index += BREACH_BATCH_SIZE) {
    const batch = resolutionIds.slice(index, index + BREACH_BATCH_SIZE);
    await prisma.ticket.updateMany({
      where: {
        id: { in: batch },
        ...baseFilter,
        resolutionSlaBreached: false,
        slaDueAt: { not: null, lt: now },
      },
      data: { resolutionSlaBreached: true, slaBreached: true },
    });
  }

  return breachedIds.length;
}

export async function getSlaBreachList(tenantId: string, page = 1, limit = 20) {
  const where = { tenantId, slaBreached: true };

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, email: true } },
        assignedTo: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.ticket.count({ where }),
  ]);

  return { tickets, total, page, limit };
}

export async function getDashboardStats(
  tenantId: string,
  userId: string,
  userRole: TicketRole,
) {
  const activeStatuses = [...ACTIVE_TICKET_STATUSES];
  const activeWhere = { tenantId, status: { in: activeStatuses } };

  const [
    statusBreakdown,
    priorityBreakdown,
    slaBreached,
    agentWorkload,
    myTickets,
    unassignedOpen,
    firstResponseBreached,
    resolutionBreached,
  ] = await Promise.all([
    prisma.ticket.groupBy({
      by: ['status'],
      where: activeWhere,
      _count: true,
    }),
    prisma.ticket.groupBy({
      by: ['priority'],
      where: activeWhere,
      _count: true,
    }),
    prisma.ticket.count({
      where: { ...activeWhere, slaBreached: true },
    }),
    prisma.ticket.groupBy({
      by: ['assignedToId'],
      where: { ...activeWhere, assignedToId: { not: null } },
      _count: true,
    }),
    userRole === 'agent'
      ? prisma.ticket.count({ where: { ...activeWhere, assignedToId: userId } })
      : Promise.resolve(0),
    prisma.ticket.count({ where: { ...activeWhere, assignedToId: null } }),
    prisma.ticket.count({ where: { ...activeWhere, firstResponseSlaBreached: true } }),
    prisma.ticket.count({ where: { ...activeWhere, resolutionSlaBreached: true } }),
  ]);

  return {
    statusBreakdown: Object.fromEntries(statusBreakdown.map((r) => [r.status, r._count])),
    priorityBreakdown: Object.fromEntries(priorityBreakdown.map((r) => [r.priority, r._count])),
    activeTotal: statusBreakdown.reduce((total, item) => total + item._count, 0),
    slaBreached,
    agentWorkload: Object.fromEntries(agentWorkload.map((r) => [r.assignedToId || '', r._count])),
    queueCounts: {
      myTickets,
      unassignedOpen,
      escalated: slaBreached,
    },
    slaBreachBreakdown: {
      firstResponse: firstResponseBreached,
      resolution: resolutionBreached,
    },
  };
}

export async function autoCloseResolvedTickets(tenantId?: string): Promise<number> {
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  const closedAt = new Date();

  const where: Record<string, unknown> = {
    status: 'resolved',
    lastActivityAt: { lt: fiveDaysAgo },
    ...(tenantId ? { tenantId } : {}),
  };

  return prisma.$transaction(async (tx) => {
    const candidates = await tx.ticket.findMany({
      where,
      select: { id: true, tenantId: true },
    });

    if (candidates.length === 0) return 0;

    const [firstClosures, repeatClosures] = await Promise.all([
      tx.ticket.updateMany({
      where: { ...where, firstClosedAt: null },
      data: { status: 'closed', firstClosedAt: closedAt, closedAt, lastActivityAt: closedAt },
      }),
      tx.ticket.updateMany({
      where: { ...where, firstClosedAt: { not: null } },
      data: { status: 'closed', closedAt, lastActivityAt: closedAt },
      }),
    ]);

    const updatedCount = firstClosures.count + repeatClosures.count;
    if (updatedCount !== candidates.length) {
      throw new Error('Otomatik kapanacak ticket durumları değişti');
    }

    await createTicketActivities(tx, candidates.map((ticket) => ({
      tenantId: ticket.tenantId,
      ticketId: ticket.id,
      actorId: null,
      type: 'status_changed',
      field: 'status',
      oldValue: 'resolved',
      newValue: 'closed',
      reason: 'Beş gün boyunca müşteri etkinliği olmadığı için otomatik kapatıldı',
      source: 'system',
      visibility: 'public',
      createdAt: closedAt,
    })));

    return updatedCount;
  });
}
