import prisma from '../lib/prisma';
import { NotFoundError, ValidationError } from '../lib/errors';
import { getAllowedActions, validateTransition, type TicketRole } from '../lib/state-machine';
import { tenantFilter } from '../lib/tenant-context';
import { calculateSLADeadlines, calculateTenantSLADeadlineValues } from './sla';

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
  auditNote?: string;
}

interface ListTicketsParams {
  tenantId: string;
  customerId?: string;
  status?: string;
  priority?: string;
  assignedToId?: string;
  category?: string;
  search?: string;
  page: number;
  limit: number;
}

export async function createTicket(data: CreateTicketData, customerId: string, tenantId: string, tenantSlug: string) {
  const ticket = await prisma.$transaction(async (tx) => {
    const counter = await tx.ticketCounter.upsert({
      where: { tenantId },
      create: { tenantId, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });

    const displayId = `${tenantSlug.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}-${counter.lastNumber}`;

    return tx.ticket.create({
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
  });

  await calculateSLADeadlines(ticket.id, tenantId);

  return ticket;
}

export async function listTickets(params: ListTicketsParams) {
  const where: Record<string, unknown> = { tenantId: params.tenantId };

  if (params.customerId) where.customerId = params.customerId;
  if (params.status) where.status = params.status;
  if (params.priority) where.priority = params.priority;
  if (params.assignedToId) where.assignedToId = params.assignedToId;
  if (params.category) where.category = params.category;

  if (params.search) {
    where.OR = [
      { title: { contains: params.search } },
      { description: { contains: params.search } },
    ];
  }

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
    updateData.resolvedAt = now;
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
      updateData.slaBreached = false;
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

    if (options.auditNote?.trim()) {
      await tx.comment.create({
        data: {
          ticketId,
          authorId: actorId,
          type: 'internal_note',
          body: options.auditNote.trim(),
        },
      });
    } else if (options.reason?.trim() && (isAdminReopen || isCustomerRejection)) {
      await tx.comment.create({
        data: {
          ticketId,
          authorId: actorId,
          type: isAdminReopen ? 'internal_note' : 'public_reply',
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
) {
  const ticket = await requireTicketOwnerWithStatus(ticketId, tenantId, customerId, 'closed');

  return createTicket(
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
  );
}

async function requireTicketOwnerWithStatus(
  ticketId: string,
  tenantId: string,
  customerId: string,
  status: string,
) {
  const ticket = await prisma.ticket.findFirst({
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
  const result = await prisma.ticket.updateMany({
    where: {
      status: 'pending',
      pendingUntil: { lte: now },
      ...(tenantId ? { tenantId } : {}),
    },
    data: {
      status: 'open',
      pendingUntil: null,
      pendingReason: null,
      lastActivityAt: now,
    },
  });

  return result.count;
}

export async function claimTicket(ticketId: string, tenantId: string, agentId: string) {
  const result = await prisma.ticket.updateMany({
    where: {
      id: ticketId,
      tenantId,
      assignedToId: null,
      status: { in: ['new', 'open', 'pending'] },
    },
    data: { assignedToId: agentId },
  });

  if (result.count === 0) {
    throw new ValidationError('Bu ticket atanmış veya üstlenmeye uygun değil');
  }

  return prisma.ticket.findFirst({
    where: { id: ticketId, ...tenantFilter(tenantId) },
    include: {
      assignedTo: { select: { id: true, name: true } },
    },
  });
}

export async function assignTicket(ticketId: string, tenantId: string, targetAgentId: string) {
  const agent = await prisma.user.findFirst({
    where: { id: targetAgentId, tenantId, role: 'agent' },
  });

  if (!agent) {
    throw new ValidationError('Geçersiz ajan');
  }

  const result = await prisma.ticket.updateMany({
    where: { id: ticketId, tenantId },
    data: { assignedToId: targetAgentId },
  });

  if (result.count === 0) {
    throw new NotFoundError('Ticket bulunamadı');
  }

  return prisma.ticket.findFirst({
    where: { id: ticketId, ...tenantFilter(tenantId) },
    include: {
      assignedTo: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true, email: true } },
    },
  });
}
