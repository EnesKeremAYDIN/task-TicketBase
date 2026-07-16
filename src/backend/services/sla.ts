import prisma from '../lib/prisma';
import { addBusinessMinutes } from '../lib/business-hours';

export async function calculateSLADeadlines(ticketId: string, tenantId: string): Promise<void> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, priority: true, createdAt: true, tenantId: true },
  });

  if (!ticket) return;

  const slaPolicy = await prisma.sLAPolicy.findUnique({
    where: { tenantId_priority: { tenantId, priority: ticket.priority } },
  });

  if (!slaPolicy) return;

  const holidays = await prisma.holiday.findMany({
    where: { tenantId },
    select: { date: true },
  });

  const holidayDates = holidays.map((h) => h.date);

  const slaMinutes = slaPolicy.resolutionIsBD
    ? slaPolicy.resolutionH * 8 * 60
    : slaPolicy.resolutionH * 60;

  const slaDueAt = addBusinessMinutes(ticket.createdAt, slaMinutes, holidayDates);

  await prisma.ticket.update({
    where: { id: ticketId },
    data: { slaDueAt },
  });
}

export async function markBreachedTickets(tenantId?: string): Promise<number> {
  const where: Record<string, unknown> = {
    slaDueAt: { not: null },
    slaBreached: false,
    status: { notIn: ['resolved', 'closed'] },
    ...(tenantId ? { tenantId } : {}),
  };

  const now = new Date();

  const breached = await prisma.ticket.findMany({
    where: {
      ...where,
      slaDueAt: { lt: now },
    },
    select: { id: true },
  });

  if (breached.length === 0) return 0;

  await prisma.ticket.updateMany({
    where: { id: { in: breached.map((t) => t.id) } },
    data: { slaBreached: true },
  });

  return breached.length;
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
  const allTickets = await prisma.ticket.findMany({
    where: { tenantId },
    select: { status: true, priority: true, assignedToId: true, slaBreached: true },
  });

  const statusBreakdown: Record<string, number> = {};
  const priorityBreakdown: Record<string, number> = {};
  const agentWorkload: Record<string, number> = {};
  let slaBreached = 0;

  for (const ticket of allTickets) {
    statusBreakdown[ticket.status] = (statusBreakdown[ticket.status] || 0) + 1;
    priorityBreakdown[ticket.priority] = (priorityBreakdown[ticket.priority] || 0) + 1;

    if (ticket.assignedToId) {
      agentWorkload[ticket.assignedToId] = (agentWorkload[ticket.assignedToId] || 0) + 1;
    }

    if (ticket.slaBreached) {
      slaBreached++;
    }
  }

  return { statusBreakdown, priorityBreakdown, slaBreached, agentWorkload };
}
