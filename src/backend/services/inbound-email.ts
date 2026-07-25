import prisma from '../lib/prisma';
import { createTicket } from './ticket';
import { createComment } from './comment';
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
  const tenant = await prisma.tenant.findUnique({
    where: { slug: payload.tenant },
  });

  if (!tenant) {
    await saveInboundMessage(payload, null, 'failed');
    throw new ValidationError('Geçersiz tenant');
  }

  let inboundMessage = await saveInboundMessage(payload, tenant.id, 'processing').catch((err: { code?: string }) => {
    if (err?.code === 'P2002') {
      return null;
    }
    throw err;
  });

  if (!inboundMessage) {
    return { status: 'duplicate', message: 'Bu mesaj daha önce işlenmiş' };
  }

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

      if (!customer) {
        await updateInboundStatus(inboundMessage.id, 'failed');
        throw new NotFoundError('Gönderen kullanıcı bulunamadı');
      }

      if (customer.id !== ticket.customerId) {
        await updateInboundStatus(inboundMessage.id, 'failed');
        throw new ValidationError('Gönderen e-posta ticket sahibiyle eşleşmiyor');
      }

      if (ticket.status === 'closed') {
        const followUpTicket = await createTicket(
          {
            title: `Takip: ${ticket.title}`,
            description: payload.body,
            priority: ticket.priority,
            category: ticket.category || undefined,
            followUpOfId: ticket.id,
          },
          customer.id,
          tenant.id,
          tenant.slug,
          'email',
        );

        await updateInboundStatus(inboundMessage.id, 'processed', followUpTicket.id);
        return {
          status: 'processed',
          message: 'Kapalı ticket için yeni takip ticketı oluşturuldu',
          ticketId: followUpTicket.id,
          followUpOfId: ticket.id,
        };
      }

      const comment = await createComment(
        ticket.id,
        customer.id,
        'customer',
        tenant.id,
        'public_reply',
        payload.body,
        'email',
      );

      await updateInboundStatus(inboundMessage.id, 'processed', ticket.id);
      return {
        status: 'processed',
        message: ['pending', 'resolved'].includes(ticket.status) ? 'Yorum eklendi ve ticket yeniden açıldı' : 'Yorum eklendi',
        ticketId: ticket.id,
        commentId: comment.id,
      };
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
      'email',
    );

    await updateInboundStatus(inboundMessage.id, 'processed', newTicket.id);
    return { status: 'processed', message: 'Yeni ticket oluşturuldu', ticketId: newTicket.id };
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      await updateInboundStatus(inboundMessage.id, 'failed').catch(() => {});
      throw error;
    }
    await updateInboundStatus(inboundMessage.id, 'failed').catch(() => {});
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
