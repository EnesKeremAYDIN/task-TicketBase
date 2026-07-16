import prisma from '../lib/prisma';
import { createTicket } from './ticket';
import { ValidationError, NotFoundError } from '../lib/errors';

interface InboundPayload {
  messageId: string;
  tenant: string;
  from: string;
  subject?: string;
  body: string;
}

const TICKET_PATTERN = /[A-Z]+-(\d+)/i;

export async function processInboundEmail(payload: InboundPayload) {
  const existing = await prisma.inboundMessage.findUnique({
    where: { messageId: payload.messageId },
  });

  if (existing) {
    return { status: 'duplicate', message: 'Bu mesaj daha önce işlenmiş' };
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: payload.tenant },
  });

  if (!tenant) {
    await saveInboundMessage(payload, null, 'failed');
    throw new ValidationError('Geçersiz tenant');
  }

  const inboundMessage = await saveInboundMessage(payload, tenant.id, 'processing');

  try {
    const subject = payload.subject || '';
    const match = subject.match(TICKET_PATTERN);

    if (match) {
      const ticketNumber = parseInt(match[1], 10);
      const ticket = await prisma.ticket.findFirst({
        where: { number: ticketNumber, tenantId: tenant.id },
      });

      if (!ticket) {
        await updateInboundStatus(inboundMessage.id, 'failed');
        throw new NotFoundError('Ticket bulunamadı');
      }

      const customer = await prisma.user.findFirst({
        where: { email: payload.from, tenantId: tenant.id, role: 'customer' },
      });

      const authorId = ticket.customerId;
      if (!customer) {
        await updateInboundStatus(inboundMessage.id, 'failed');
        throw new NotFoundError('Gönderen kullanıcı bulunamadı');
      }

      const comment = await prisma.comment.create({
        data: {
          ticketId: ticket.id,
          authorId,
          type: 'public_reply',
          body: payload.body,
        },
      });

      await updateInboundStatus(inboundMessage.id, 'processed', ticket.id);
      return { status: 'processed', message: 'Yorum eklendi', ticketId: ticket.id, commentId: comment.id };
    }

    const customer = await prisma.user.findFirst({
      where: { email: payload.from, tenantId: tenant.id, role: 'customer' },
    });

    if (!customer) {
      await updateInboundStatus(inboundMessage.id, 'failed');
      throw new NotFoundError('Gönderen kullanıcı bulunamadı');
    }

    const ticketTitle = subject || payload.body.substring(0, 50);
    const newTicket = await createTicket(
      { title: ticketTitle, description: payload.body },
      customer.id,
      tenant.id,
      tenant.slug,
    );

    await updateInboundStatus(inboundMessage.id, 'processed', newTicket.id);
    return { status: 'processed', message: 'Yeni ticket oluşturuldu', ticketId: newTicket.id };
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      await updateInboundStatus(inboundMessage.id, 'failed');
      throw error;
    }
    await updateInboundStatus(inboundMessage.id, 'failed');
    throw error;
  }
}

async function saveInboundMessage(payload: InboundPayload, tenantId: string | null, status: string) {
  return prisma.inboundMessage.create({
    data: {
      messageId: payload.messageId,
      tenantId,
      fromEmail: payload.from,
      subject: payload.subject || null,
      body: payload.body,
      raw: JSON.stringify(payload),
      status,
    },
  });
}

async function updateInboundStatus(id: string, status: string, ticketId?: string) {
  return prisma.inboundMessage.update({
    where: { id },
    data: { status, ...(ticketId ? { ticketId } : {}) },
  });
}
