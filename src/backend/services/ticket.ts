import prisma from '../lib/prisma';
import { NotFoundError, ValidationError } from '../lib/errors';
import { validateTransition } from '../lib/state-machine';
import { tenantFilter } from '../lib/tenant-context';
import { calculateSLADeadlines } from './sla';

interface CreateTicketData {
  title: string;
  description: string;
  priority?: string;
  category?: string;
}

interface ListTicketsParams {
  tenantId: string;
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
    const counter = await tx.ticketCounter.update({
      where: { tenantId },
      data: { lastNumber: { increment: 1 } },
    });

    const displayId = `${tenantSlug.toUpperCase()}-${counter.lastNumber}`;

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
    where: { ticketId: { in: ticketIds } },
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
      comments: {
        orderBy: { createdAt: 'asc' },
        ...(userRole === 'customer' ? { where: { type: 'public_reply' } } : {}),
        include: {
          author: { select: { id: true, name: true, role: true } },
        },
      },
    },
  });

  if (!ticket) {
    throw new NotFoundError('Ticket bulunamadı');
  }

  if (userRole === 'customer' && ticket.customerId !== userId) {
    throw new NotFoundError('Ticket bulunamadı');
  }

  return ticket;
}

export async function updateTicketStatus(ticketId: string, tenantId: string, newStatus: string) {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, ...tenantFilter(tenantId) },
  });

  if (!ticket) {
    throw new NotFoundError('Ticket bulunamadı');
  }

  validateTransition(ticket.status, newStatus);

  const updateData: Record<string, unknown> = { status: newStatus };

  if (newStatus === 'resolved') {
    updateData.resolvedAt = new Date();
  }

  if (newStatus === 'closed') {
    updateData.closedAt = new Date();
  }

  if (newStatus === 'open' && !ticket.firstResponseAt) {
    updateData.firstResponseAt = new Date();
  }

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: updateData,
  });

  return updated;
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
