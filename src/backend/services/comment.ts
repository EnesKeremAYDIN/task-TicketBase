import prisma from '../lib/prisma';
import { NotFoundError, ValidationError, ForbiddenError } from '../lib/errors';
import { tenantFilter } from '../lib/tenant-context';

const VALID_TYPES = ['public_reply', 'internal_note'];

export async function createComment(
  ticketId: string,
  authorId: string,
  authorRole: string,
  authorTenantId: string,
  type: string,
  body: string,
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

  const comment = await prisma.$transaction(async (tx) => {
    const isFirstPublicReply = type === 'public_reply' && !ticket.firstResponseAt;

    if (isFirstPublicReply && ticket.status === 'new') {
      await tx.ticket.update({
        where: { id: ticketId },
        data: {
          status: 'open',
          firstResponseAt: new Date(),
        },
      });
    } else if (isFirstPublicReply && !ticket.firstResponseAt) {
      await tx.ticket.update({
        where: { id: ticketId },
        data: { firstResponseAt: new Date() },
      });
    }

    return tx.comment.create({
      data: { ticketId, authorId, type, body },
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
