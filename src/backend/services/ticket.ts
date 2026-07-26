import type { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { NotFoundError, ValidationError } from '../lib/errors';
import {
  ACTIVE_TICKET_STATUSES,
  getAllowedActions,
  validateTransition,
  type TicketQueue,
  type TicketRole,
} from '../lib/state-machine';
import { tenantFilter } from '../lib/tenant-context';
import {
  calculateTenantSLADeadlineValues,
  isFirstResponseSlaBreached,
  isResolutionSlaBreached,
} from './sla';
import {
  createTicketActivities,
  recordTicketActivity,
  type TicketActivitySource,
} from './ticket-activity';

interface CreateTicketData {
  title: string;
  description: string;
  priority?: string;
  category?: string;
  followUpOfId?: string;
}

interface StatusUpdateOptions {
  pendingUntil?: Date;
  pendingReason?: string;
  reason?: string;
  source?: TicketActivitySource;
}

interface ListTicketsParams {
  tenantId: string;
  customerId?: string;
  status?: string;
  priority?: string;
  assignedToId?: string;
  category?: string;
  search?: string;
  queue?: TicketQueue;
  currentUserId?: string;
  page: number;
  limit: number;
}

export async function createTicket(
  data: CreateTicketData,
  customerId: string,
  tenantId: string,
  tenantSlug: string,
  source: TicketActivitySource = 'web',
) {
  return prisma.$transaction((tx) => createTicketInTransaction(
    tx,
    data,
    customerId,
    tenantId,
    tenantSlug,
    source,
  ));
}

export function getTenantTicketPrefix(tenantSlug: string) {
  return tenantSlug.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

export async function createTicketInTransaction(
  tx: Prisma.TransactionClient,
  data: CreateTicketData,
  customerId: string,
  tenantId: string,
  tenantSlug: string,
  source: TicketActivitySource = 'web',
) {
  const counter = await tx.ticketCounter.upsert({
    where: { tenantId },
    create: { tenantId, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });

  const displayId = `${getTenantTicketPrefix(tenantSlug)}-${counter.lastNumber}`;

  const createdTicket = await tx.ticket.create({
    data: {
      tenantId,
      number: counter.lastNumber,
      displayId,
      title: data.title,
      description: data.description,
      status: 'new',
      priority: data.priority || 'normal',
      category: data.category || null,
      customerId,
      followUpOfId: data.followUpOfId || null,
    },
    include: {
      customer: { select: { id: true, name: true, email: true } },
    },
  });

  const deadlines = await calculateTenantSLADeadlineValues(
    tenantId,
    createdTicket.priority,
    createdTicket.createdAt,
    tx,
  );
  if (deadlines) {
    await tx.ticket.update({
      where: { id: createdTicket.id },
      data: deadlines,
    });
  }

  await recordTicketActivity(tx, {
    tenantId,
    ticketId: createdTicket.id,
    actorId: customerId,
    type: 'ticket_created',
    field: 'status',
    newValue: 'new',
    source,
    visibility: 'public',
    createdAt: createdTicket.createdAt,
  });

  if (data.followUpOfId) {
    await recordTicketActivity(tx, {
      tenantId,
      ticketId: data.followUpOfId,
      actorId: customerId,
      type: 'follow_up_created',
      newValue: createdTicket.id,
      newLabel: createdTicket.displayId,
      source,
      visibility: 'public',
      createdAt: createdTicket.createdAt,
    });
  }

  return { ...createdTicket, ...deadlines };
}

export async function listTickets(params: ListTicketsParams) {
  const conditions: Prisma.TicketWhereInput[] = [];
  const activeStatuses = [...ACTIVE_TICKET_STATUSES];

  if (params.customerId) conditions.push({ customerId: params.customerId });
  if (params.queue === 'my') {
    if (!params.currentUserId) {
      throw new ValidationError('My Tickets kuyruğu için kullanıcı bilgisi zorunludur');
    }
    conditions.push({ status: { in: activeStatuses }, assignedToId: params.currentUserId });
  }
  if (params.queue === 'unassigned') {
    conditions.push({ status: { in: activeStatuses }, assignedToId: null });
  }
  if (params.queue === 'escalated') {
    conditions.push({ status: { in: activeStatuses }, slaBreached: true });
  }

  if (params.status) conditions.push({ status: params.status });
  if (params.priority) conditions.push({ priority: params.priority });
  if (params.assignedToId) conditions.push({ assignedToId: params.assignedToId });
  if (params.category) conditions.push({ category: params.category });

  if (params.search) {
    conditions.push({
      OR: [
        { title: { contains: params.search } },
        { description: { contains: params.search } },
      ],
    });
  }

  const where: Prisma.TicketWhereInput = {
    tenantId: params.tenantId,
    ...(conditions.length > 0 ? { AND: conditions } : {}),
  };

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, email: true } },
        assignedTo: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
    prisma.ticket.count({ where }),
  ]);

  const ticketIds = tickets.map((t) => t.id);

  const lastComments = await prisma.comment.findMany({
    where: {
      ticketId: { in: ticketIds },
      ...(params.customerId ? { type: 'public_reply' } : {}),
    },
    orderBy: { createdAt: 'desc' },
    distinct: ['ticketId'],
    include: { author: { select: { name: true } } },
  });

  const commentMap = new Map(lastComments.map((c) => [c.ticketId, c]));

  const ticketsWithLastComment = tickets.map((ticket) => {
    const lastComment = commentMap.get(ticket.id);
    return {
      ...ticket,
      lastComment: lastComment ? { body: lastComment.body, createdAt: lastComment.createdAt, author: { name: lastComment.author.name } } : null,
    };
  });

  return { tickets: ticketsWithLastComment, total, page: params.page, limit: params.limit };
}

export async function listTicketCategories(tenantId: string) {
  const categories = await prisma.ticket.findMany({
    where: { tenantId, category: { not: null } },
    select: { category: true },
    distinct: ['category'],
    orderBy: { category: 'asc' },
  });

  return categories
    .map((ticket) => ticket.category)
    .filter((category): category is string => Boolean(category));
}

export async function getTicketById(ticketId: string, tenantId: string, userId?: string, userRole?: string) {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, ...tenantFilter(tenantId) },
    include: {
      customer: { select: { id: true, name: true, email: true } },
      assignedTo: { select: { id: true, name: true } },
      followUpOf: { select: { id: true, displayId: true, title: true } },
    },
  });

  if (!ticket) {
    throw new NotFoundError('Ticket bulunamadı');
  }

  if (userRole === 'customer' && ticket.customerId !== userId) {
    throw new NotFoundError('Ticket bulunamadı');
  }

  const allowedActions = userRole
    ? getAllowedActions(ticket.status, userRole as TicketRole)
    : [];

  return { ...ticket, allowedActions };
}

export async function updateTicketStatus(
  ticketId: string,
  tenantId: string,
  newStatus: string,
  actorId: string,
  actorRole: TicketRole,
  options: StatusUpdateOptions = {},
) {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, ...tenantFilter(tenantId) },
  });

  if (!ticket) {
    throw new NotFoundError('Ticket bulunamadı');
  }

  validateTransition(ticket.status, newStatus, actorRole);

  const now = new Date();
  if (newStatus === 'pending') {
    if (!options.pendingUntil || options.pendingUntil <= now) {
      throw new ValidationError('Bekleme tarihi gelecekte olmalıdır');
    }
    if (!options.pendingReason?.trim()) {
      throw new ValidationError('Bekleme nedeni zorunludur');
    }
  }

  const isAdminReopen = ticket.status === 'closed' && newStatus === 'open';
  const isCustomerRejection = actorRole === 'customer' && ticket.status === 'resolved' && newStatus === 'open';

  if ((isAdminReopen || isCustomerRejection) && !options.reason?.trim()) {
    throw new ValidationError(isAdminReopen ? 'Yeniden açma nedeni zorunludur' : 'Sorunun neden devam ettiğini açıklayın');
  }

  const updateData: Record<string, unknown> = { status: newStatus, lastActivityAt: now };

  if (newStatus !== 'pending') {
    updateData.pendingUntil = null;
    updateData.pendingReason = null;
  }

  if (newStatus === 'pending') {
    updateData.pendingUntil = options.pendingUntil;
    updateData.pendingReason = options.pendingReason?.trim();
  }

  if (newStatus === 'resolved') {
    const firstResponseBreached = ticket.firstResponseSlaBreached
      || (
        !ticket.firstResponseAt
        && isFirstResponseSlaBreached(now, ticket.firstResponseSlaDue)
      );
    const resolutionBreached = ticket.resolutionSlaBreached
      || isResolutionSlaBreached(now, ticket.slaDueAt);
    updateData.resolvedAt = now;
    updateData.firstResponseSlaBreached = firstResponseBreached;
    updateData.resolutionSlaBreached = resolutionBreached;
    updateData.slaBreached = firstResponseBreached || resolutionBreached;
  }

  if (newStatus === 'closed') {
    updateData.firstClosedAt = ticket.firstClosedAt || now;
    updateData.closedAt = now;
  }

  if (isAdminReopen) {
    updateData.lastReopenedAt = now;
    updateData.reopenCount = { increment: 1 };
  }

  if (newStatus === 'open' && ['resolved', 'closed'].includes(ticket.status)) {
    const deadlines = await calculateTenantSLADeadlineValues(tenantId, ticket.priority, now);
    if (deadlines) {
      updateData.slaDueAt = deadlines.slaDueAt;
      updateData.resolutionSlaBreached = false;
      updateData.slaBreached = ticket.firstResponseSlaBreached;
    }
  }

  await prisma.$transaction(async (tx) => {
    const result = await tx.ticket.updateMany({
      where: { id: ticketId, tenantId, status: ticket.status },
      data: updateData,
    });

    if (result.count === 0) {
      throw new ValidationError('Ticket durumu değişti, işlem tekrar denenmeli');
    }

    await recordTicketActivity(tx, {
      tenantId,
      ticketId,
      actorId,
      type: 'status_changed',
      field: 'status',
      oldValue: ticket.status,
      newValue: newStatus,
      reason: options.reason || (newStatus === 'pending' ? options.pendingReason : undefined),
      source: options.source || 'web',
      visibility: 'public',
      createdAt: now,
    });

    if (options.reason?.trim() && isCustomerRejection) {
      await tx.comment.create({
        data: {
          ticketId,
          authorId: actorId,
          type: 'public_reply',
          body: options.reason.trim(),
        },
      });
    }
  });

  const updated = await prisma.ticket.findFirst({
    where: { id: ticketId, ...tenantFilter(tenantId) },
  });

  return updated;
}

export async function confirmResolution(ticketId: string, tenantId: string, customerId: string) {
  await requireTicketOwnerWithStatus(ticketId, tenantId, customerId, 'resolved');
  return updateTicketStatus(ticketId, tenantId, 'closed', customerId, 'customer');
}

export async function rejectResolution(ticketId: string, tenantId: string, customerId: string, reason: string) {
  await requireTicketOwnerWithStatus(ticketId, tenantId, customerId, 'resolved');
  return updateTicketStatus(ticketId, tenantId, 'open', customerId, 'customer', { reason });
}

export async function createFollowUpTicket(
  ticketId: string,
  tenantId: string,
  tenantSlug: string,
  customerId: string,
  description: string,
  source: TicketActivitySource = 'web',
) {
  return prisma.$transaction((tx) => createFollowUpTicketInTransaction(
    tx,
    ticketId,
    tenantId,
    tenantSlug,
    customerId,
    description,
    source,
  ));
}

export async function createFollowUpTicketInTransaction(
  tx: Prisma.TransactionClient,
  ticketId: string,
  tenantId: string,
  tenantSlug: string,
  customerId: string,
  description: string,
  source: TicketActivitySource = 'web',
) {
  const ticket = await requireTicketOwnerWithStatus(
    ticketId,
    tenantId,
    customerId,
    'closed',
    tx,
  );

  return createTicketInTransaction(
    tx,
    {
      title: `Takip: ${ticket.title}`,
      description,
      priority: ticket.priority,
      category: ticket.category || undefined,
      followUpOfId: ticket.id,
    },
    customerId,
    tenantId,
    tenantSlug,
    source,
  );
}

async function requireTicketOwnerWithStatus(
  ticketId: string,
  tenantId: string,
  customerId: string,
  status: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const ticket = await db.ticket.findFirst({
    where: { id: ticketId, tenantId, customerId },
  });

  if (!ticket) {
    throw new NotFoundError('Ticket bulunamadı');
  }

  if (ticket.status !== status) {
    throw new ValidationError(`Bu işlem yalnızca '${status}' durumundaki ticket için yapılabilir`);
  }

  return ticket;
}

export async function reactivatePendingTickets(tenantId?: string): Promise<number> {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const candidates = await tx.ticket.findMany({
      where: {
        status: 'pending',
        pendingUntil: { lte: now },
        ...(tenantId ? { tenantId } : {}),
      },
      select: { id: true, tenantId: true, pendingReason: true },
    });

    if (candidates.length === 0) return 0;

    const result = await tx.ticket.updateMany({
      where: { id: { in: candidates.map((ticket) => ticket.id) }, status: 'pending' },
      data: {
        status: 'open',
        pendingUntil: null,
        pendingReason: null,
        lastActivityAt: now,
      },
    });

    if (result.count !== candidates.length) {
      throw new ValidationError('Pending ticket durumları değişti, işlem tekrar denenmeli');
    }

    await createTicketActivities(tx, candidates.map((ticket) => ({
      tenantId: ticket.tenantId,
      ticketId: ticket.id,
      actorId: null,
      type: 'status_changed',
      field: 'status',
      oldValue: 'pending',
      newValue: 'open',
      reason: ticket.pendingReason || 'Bekleme süresi doldu',
      source: 'system',
      visibility: 'public',
      createdAt: now,
    })));

    return result.count;
  });
}

export async function claimTicket(ticketId: string, tenantId: string, agentId: string) {
  await prisma.$transaction(async (tx) => {
    const agent = await tx.user.findFirst({
      where: { id: agentId, tenantId, role: 'agent' },
      select: { name: true },
    });

    if (!agent) {
      throw new ValidationError('Geçersiz ajan');
    }

    const now = new Date();
    const result = await tx.ticket.updateMany({
      where: {
        id: ticketId,
        tenantId,
        assignedToId: null,
        status: { in: ['new', 'open', 'pending'] },
      },
      data: { assignedToId: agentId, lastActivityAt: now },
    });

    if (result.count === 0) {
      throw new ValidationError('Bu ticket atanmış veya üstlenmeye uygun değil');
    }

    await recordTicketActivity(tx, {
      tenantId,
      ticketId,
      actorId: agentId,
      type: 'assignee_changed',
      field: 'assignedToId',
      oldValue: null,
      newValue: agentId,
      oldLabel: 'Atanmamış',
      newLabel: agent.name,
      source: 'web',
      visibility: 'internal',
      createdAt: now,
    });
  });

  return prisma.ticket.findFirst({
    where: { id: ticketId, ...tenantFilter(tenantId) },
    include: {
      assignedTo: { select: { id: true, name: true } },
    },
  });
}

export async function assignTicket(
  ticketId: string,
  tenantId: string,
  targetAgentId: string,
  actorId: string,
) {
  await prisma.$transaction(async (tx) => {
    const [agent, ticket] = await Promise.all([
      tx.user.findFirst({
        where: { id: targetAgentId, tenantId, role: 'agent' },
        select: { id: true, name: true },
      }),
      tx.ticket.findFirst({
        where: { id: ticketId, tenantId },
        select: {
          id: true,
          assignedToId: true,
          assignedTo: { select: { name: true } },
        },
      }),
    ]);

    if (!agent) {
      throw new ValidationError('Geçersiz ajan');
    }

    if (!ticket) {
      throw new NotFoundError('Ticket bulunamadı');
    }

    if (ticket.assignedToId === targetAgentId) return;

    const now = new Date();
    const result = await tx.ticket.updateMany({
      where: { id: ticketId, tenantId, assignedToId: ticket.assignedToId },
      data: { assignedToId: targetAgentId, lastActivityAt: now },
    });

    if (result.count === 0) {
      throw new ValidationError('Ticket ataması değişti, işlem tekrar denenmeli');
    }

    await recordTicketActivity(tx, {
      tenantId,
      ticketId,
      actorId,
      type: 'assignee_changed',
      field: 'assignedToId',
      oldValue: ticket.assignedToId,
      newValue: targetAgentId,
      oldLabel: ticket.assignedTo?.name || 'Atanmamış',
      newLabel: agent.name,
      source: 'web',
      visibility: 'internal',
      createdAt: now,
    });
  });

  return prisma.ticket.findFirst({
    where: { id: ticketId, ...tenantFilter(tenantId) },
    include: {
      assignedTo: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true, email: true } },
    },
  });
}
