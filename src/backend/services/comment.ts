import prisma from '../lib/prisma';
import { NotFoundError, ValidationError, ForbiddenError } from '../lib/errors';
import { tenantFilter } from '../lib/tenant-context';
import {
  calculateTenantSLADeadlineValues,
  isFirstResponseSlaBreached,
} from './sla';
import {
  recordTicketActivity,
  type TicketActivitySource,
} from './ticket-activity';

const VALID_TYPES = ['public_reply', 'internal_note'];

export async function createComment(
  ticketId: string,
  authorId: string,
  authorRole: string,
  authorTenantId: string,
  type: string,
  body: string,
  source: TicketActivitySource = 'web',
) {
  if (!VALID_TYPES.includes(type)) {
    throw new ValidationError('Geçersiz yorum türü');
  }

  if (authorRole === 'customer' && type !== 'public_reply') {
    throw new ForbiddenError('Müşteriler yalnızca herkese açık yorum yazabilir');
  }

  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, ...tenantFilter(authorTenantId) },
  });

  if (!ticket) {
    throw new NotFoundError('Ticket bulunamadı');
  }

  if (authorRole === 'customer' && ticket.customerId !== authorId) {
    throw new NotFoundError('Ticket bulunamadı');
  }

  if (ticket.status === 'closed' && authorRole !== 'admin') {
    throw new ValidationError('Kapalı ticket\'a yorum eklenemez');
  }

  const now = new Date();
  const isFirstAgentPublicReply = (
    type === 'public_reply'
    && ['agent', 'admin'].includes(authorRole)
    && !ticket.firstResponseAt
  );
  const shouldReopenForCustomerReply = (
    authorRole === 'customer'
    && type === 'public_reply'
    && ['pending', 'resolved'].includes(ticket.status)
  );
  const reopenDeadlines = shouldReopenForCustomerReply && ticket.status === 'resolved'
    ? await calculateTenantSLADeadlineValues(authorTenantId, ticket.priority, now)
    : null;
  const firstResponseBreached = isFirstAgentPublicReply
    ? ticket.firstResponseSlaBreached
      || isFirstResponseSlaBreached(now, ticket.firstResponseSlaDue)
    : ticket.firstResponseSlaBreached;

  const comment = await prisma.$transaction(async (tx) => {
    const ticketUpdate: Record<string, unknown> = { lastActivityAt: now };

    if (isFirstAgentPublicReply) {
      ticketUpdate.firstResponseAt = now;
      ticketUpdate.firstResponseSlaBreached = firstResponseBreached;
      if (firstResponseBreached) ticketUpdate.slaBreached = true;
      if (ticket.status === 'new') ticketUpdate.status = 'open';
    }

    if (shouldReopenForCustomerReply) {
      ticketUpdate.status = 'open';
      ticketUpdate.pendingUntil = null;
      ticketUpdate.pendingReason = null;
      if (reopenDeadlines) {
        ticketUpdate.slaDueAt = reopenDeadlines.slaDueAt;
        ticketUpdate.resolutionSlaBreached = false;
        ticketUpdate.slaBreached = ticket.firstResponseSlaBreached;
      }
    }

    const updateResult = await tx.ticket.updateMany({
      where: { id: ticketId, status: ticket.status },
      data: ticketUpdate,
    });

    if (updateResult.count === 0) {
      throw new ValidationError('Ticket durumu değişti, yorum tekrar gönderilmeli');
    }

    const newStatus = ticket.status === 'new' && isFirstAgentPublicReply
      ? 'open'
      : shouldReopenForCustomerReply ? 'open' : null;

    if (newStatus) {
      await recordTicketActivity(tx, {
        tenantId: authorTenantId,
        ticketId,
        actorId: authorId,
        type: 'status_changed',
        field: 'status',
        oldValue: ticket.status,
        newValue: newStatus,
        reason: shouldReopenForCustomerReply ? 'Müşteri yanıt verdi' : 'İlk agent yanıtı gönderildi',
        source,
        visibility: 'public',
        createdAt: now,
      });
    }

    return tx.comment.create({
      data: { ticketId, authorId, type, body, createdAt: now },
      include: {
        author: { select: { id: true, name: true, role: true } },
      },
    });
  });

  return comment;
}

export async function getTicketComments(ticketId: string, tenantId: string, userId?: string, userRole?: string) {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, ...tenantFilter(tenantId) },
    select: { id: true, customerId: true },
  });

  if (!ticket) {
    throw new NotFoundError('Ticket bulunamadı');
  }

  if (userRole === 'customer' && ticket.customerId !== userId) {
    throw new NotFoundError('Ticket bulunamadı');
  }

  const comments = await prisma.comment.findMany({
    where: {
      ticketId,
      ...(userRole === 'customer' ? { type: 'public_reply' } : {}),
    },
    orderBy: { createdAt: 'asc' },
    include: {
      author: { select: { id: true, name: true, role: true } },
    },
  });

  return comments;
}
