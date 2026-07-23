import prisma from '../lib/prisma';
import { addBusinessMinutes } from '../lib/business-hours';

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
    slaBreached: false,
    status: { notIn: ['resolved', 'closed'] },
    ...(tenantId ? { tenantId } : {}),
  };

  const [resBreached, firstResBreached] = await Promise.all([
    prisma.ticket.findMany({
      where: { ...baseFilter, slaDueAt: { not: null, lt: now } },
      select: { id: true },
    }),
    prisma.ticket.findMany({
      where: { ...baseFilter, firstResponseSlaDue: { not: null, lt: now }, firstResponseAt: null },
      select: { id: true },
    }),
  ]);

  const breachedIds = [...new Set([...resBreached, ...firstResBreached].map((t) => t.id))];

  if (breachedIds.length === 0) return 0;

  for (let i = 0; i < breachedIds.length; i += BREACH_BATCH_SIZE) {
    const batch = breachedIds.slice(i, i + BREACH_BATCH_SIZE);
    await prisma.ticket.updateMany({
      where: { id: { in: batch } },
      data: { slaBreached: true },
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

export async function getDashboardStats(tenantId: string) {
  const [statusBreakdown, priorityBreakdown, slaBreached, agentWorkload] = await Promise.all([
    prisma.ticket.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: true,
    }),
    prisma.ticket.groupBy({
      by: ['priority'],
      where: { tenantId },
      _count: true,
    }),
    prisma.ticket.count({
      where: { tenantId, slaBreached: true },
    }),
    prisma.ticket.groupBy({
      by: ['assignedToId'],
      where: { tenantId, assignedToId: { not: null }, status: { notIn: ['resolved', 'closed'] } },
      _count: true,
    }),
  ]);

  return {
    statusBreakdown: Object.fromEntries(statusBreakdown.map((r) => [r.status, r._count])),
    priorityBreakdown: Object.fromEntries(priorityBreakdown.map((r) => [r.priority, r._count])),
    slaBreached,
    agentWorkload: Object.fromEntries(agentWorkload.map((r) => [r.assignedToId || '', r._count])),
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

  const [firstClosures, repeatClosures] = await prisma.$transaction([
    prisma.ticket.updateMany({
      where: { ...where, firstClosedAt: null },
      data: { status: 'closed', firstClosedAt: closedAt, closedAt, lastActivityAt: closedAt },
    }),
    prisma.ticket.updateMany({
      where: { ...where, firstClosedAt: { not: null } },
      data: { status: 'closed', closedAt, lastActivityAt: closedAt },
    }),
  ]);

  return firstClosures.count + repeatClosures.count;
}
