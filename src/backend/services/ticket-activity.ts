import type { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { NotFoundError } from '../lib/errors';
import type { TicketRole } from '../lib/state-machine';

export const ACTIVITY_TYPES = [
  'ticket_created',
  'status_changed',
  'priority_changed',
  'assignee_changed',
  'follow_up_created',
] as const;

export type TicketActivityType = typeof ACTIVITY_TYPES[number];
export type TicketActivitySource = 'web' | 'email' | 'bulk' | 'system' | 'seed';
export type TicketActivityVisibility = 'public' | 'internal';

export interface TicketActivityData {
  tenantId: string;
  ticketId: string;
  actorId?: string | null;
  type: TicketActivityType;
  field?: string;
  oldValue?: string | null;
  newValue?: string | null;
  oldLabel?: string | null;
  newLabel?: string | null;
  reason?: string | null;
  source: TicketActivitySource;
  visibility?: TicketActivityVisibility;
  createdAt?: Date;
}

export async function recordTicketActivity(
  tx: Prisma.TransactionClient,
  data: TicketActivityData,
) {
  return tx.ticketActivity.create({
    data: {
      tenantId: data.tenantId,
      ticketId: data.ticketId,
      actorId: data.actorId || null,
      type: data.type,
      field: data.field || null,
      oldValue: data.oldValue ?? null,
      newValue: data.newValue ?? null,
      oldLabel: data.oldLabel ?? null,
      newLabel: data.newLabel ?? null,
      reason: data.reason?.trim() || null,
      source: data.source,
      visibility: data.visibility || 'internal',
      createdAt: data.createdAt,
    },
  });
}

export async function createTicketActivities(
  tx: Prisma.TransactionClient,
  activities: TicketActivityData[],
) {
  const batchSize = 500;

  for (let index = 0; index < activities.length; index += batchSize) {
    const batch = activities.slice(index, index + batchSize);
    await tx.ticketActivity.createMany({
      data: batch.map((activity) => ({
        tenantId: activity.tenantId,
        ticketId: activity.ticketId,
        actorId: activity.actorId || null,
        type: activity.type,
        field: activity.field || null,
        oldValue: activity.oldValue ?? null,
        newValue: activity.newValue ?? null,
        oldLabel: activity.oldLabel ?? null,
        newLabel: activity.newLabel ?? null,
        reason: activity.reason?.trim() || null,
        source: activity.source,
        visibility: activity.visibility || 'internal',
        createdAt: activity.createdAt,
      })),
    });
  }
}

export async function getTicketActivities(
  ticketId: string,
  tenantId: string,
  userId: string,
  userRole: TicketRole,
  page: number,
  limit: number,
) {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, tenantId },
    select: { id: true, customerId: true },
  });

  if (!ticket || (userRole === 'customer' && ticket.customerId !== userId)) {
    throw new NotFoundError('Ticket bulunamadı');
  }

  const where = {
    ticketId,
    tenantId,
    ...(userRole === 'customer' ? { visibility: 'public' } : {}),
  };

  const [activities, total] = await Promise.all([
    prisma.ticketActivity.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        actor: { select: { id: true, name: true, role: true } },
      },
    }),
    prisma.ticketActivity.count({ where }),
  ]);

  return {
    activities: activities.map((activity) => ({
      ...activity,
      reason: userRole === 'customer' ? null : activity.reason,
    })),
    total,
    page,
    limit,
  };
}
