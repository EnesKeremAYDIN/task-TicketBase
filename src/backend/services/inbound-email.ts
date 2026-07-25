import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import {
  createFollowUpTicketInTransaction,
  createTicketInTransaction,
  getTenantTicketPrefix,
} from './ticket';
import { createCommentInTransaction } from './comment';
import { ValidationError, NotFoundError } from '../lib/errors';

export interface InboundPayload {
  messageId: string;
  tenant: string;
  from: string;
  subject?: string;
  body: string;
}

const TICKET_PATTERN = /\b([A-Z0-9]+)-(\d+)\b/gi;
const PROCESSING_LEASE_MS = 5 * 60 * 1000;
const RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;

type InboundClaim =
  | { claimed: true; id: string }
  | {
    claimed: false;
    ticketId: string | null;
    commentId: string | null;
  };

export async function recordInvalidInboundMessage(
  payload: unknown,
  validationError: string,
) {
  const raw = serializeRawPayload(payload);
  const partial = getPartialPayload(payload);
  const dedupKey = createDedupKey(partial.messageId, raw);
  const now = new Date();

  const data = {
    tenantSlug: partial.tenant,
    fromEmail: partial.from,
    subject: partial.subject,
    body: partial.body,
    raw,
    status: 'failed',
    lastAttemptAt: now,
    validationError,
    errorMessage: validationError,
  };

  try {
    return await prisma.inboundMessage.create({
      data: {
        ...data,
        messageId: partial.messageId,
        dedupKey,
        attemptCount: 1,
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
  }

  const existing = await prisma.inboundMessage.findFirst({
    where: {
      OR: [
        { dedupKey },
        ...(partial.messageId ? [{ messageId: partial.messageId }] : []),
      ],
    },
  });
  if (!existing) {
    throw new Error('Bozuk webhook idempotency kaydı bulunamadı');
  }

  if (existing.status === 'processed' || existing.status === 'processing') {
    return existing;
  }

  return prisma.inboundMessage.update({
    where: { id: existing.id },
    data: {
      ...data,
      dedupKey,
      attemptCount: { increment: 1 },
    },
  });
}

export async function processInboundEmail(payload: InboundPayload) {
  const claim = await claimInboundMessage(payload);
  if (!claim.claimed) {
    return {
      status: 'duplicate',
      message: 'Bu mesaj daha önce işlenmiş veya halen işleniyor',
      ...(claim.ticketId ? { ticketId: claim.ticketId } : {}),
      ...(claim.commentId ? { commentId: claim.commentId } : {}),
    };
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: payload.tenant },
  });

  if (!tenant) {
    const error = new ValidationError('Geçersiz tenant');
    await markInboundFailed(claim.id, error);
    throw error;
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const subject = payload.subject || '';
      const ticketNumber = await findTicketReference(tx, subject, tenant.slug);

      await tx.inboundMessage.update({
        where: { id: claim.id },
        data: { tenantId: tenant.id, tenantSlug: tenant.slug },
      });

      if (ticketNumber !== null) {
        const ticket = await tx.ticket.findFirst({
          where: { number: ticketNumber, tenantId: tenant.id },
        });

        if (!ticket) {
          throw new NotFoundError('Ticket bulunamadı');
        }

        const customer = await findCustomer(tx, payload.from, tenant.id);
        if (customer.id !== ticket.customerId) {
          throw new ValidationError('Gönderen e-posta ticket sahibiyle eşleşmiyor');
        }

        if (ticket.status === 'closed') {
          const followUpTicket = await createFollowUpTicketInTransaction(
            tx,
            ticket.id,
            tenant.id,
            tenant.slug,
            customer.id,
            payload.body,
            'email',
          );

          await markInboundProcessed(tx, claim.id, followUpTicket.id);
          return {
            status: 'processed',
            message: 'Kapalı ticket için yeni takip ticketı oluşturuldu',
            ticketId: followUpTicket.id,
            followUpOfId: ticket.id,
          };
        }

        const comment = await createCommentInTransaction(
          tx,
          ticket.id,
          customer.id,
          'customer',
          tenant.id,
          'public_reply',
          payload.body,
          'email',
        );

        await markInboundProcessed(tx, claim.id, ticket.id, comment.id);
        return {
          status: 'processed',
          message: ['pending', 'resolved'].includes(ticket.status)
            ? 'Yorum eklendi ve ticket yeniden açıldı'
            : 'Yorum eklendi',
          ticketId: ticket.id,
          commentId: comment.id,
        };
      }

      const customer = await findCustomer(tx, payload.from, tenant.id);
      const ticketTitle = subject || payload.body.substring(0, 50);
      const newTicket = await createTicketInTransaction(
        tx,
        { title: ticketTitle, description: payload.body },
        customer.id,
        tenant.id,
        tenant.slug,
        'email',
      );

      await markInboundProcessed(tx, claim.id, newTicket.id);
      return {
        status: 'processed',
        message: 'Yeni ticket oluşturuldu',
        ticketId: newTicket.id,
      };
    });
  } catch (error) {
    await markInboundFailed(claim.id, error, tenant.id);
    throw error;
  }
}

async function findTicketReference(
  tx: Prisma.TransactionClient,
  subject: string,
  tenantSlug: string,
) {
  const tenantPrefixes = new Set(
    (await tx.tenant.findMany({ select: { slug: true } }))
      .map((tenant) => getTenantTicketPrefix(tenant.slug)),
  );
  const expectedPrefix = getTenantTicketPrefix(tenantSlug);
  const references = [...subject.matchAll(TICKET_PATTERN)]
    .map((match) => ({
      prefix: match[1].toUpperCase(),
      number: Number.parseInt(match[2], 10),
    }))
    .filter((reference) => tenantPrefixes.has(reference.prefix));

  const foreignReference = references.find(
    (reference) => reference.prefix !== expectedPrefix,
  );
  if (foreignReference) {
    throw new ValidationError(
      `Ticket prefix'i tenant ile uyuşmuyor: ${foreignReference.prefix}`,
    );
  }

  return references.find((reference) => reference.prefix === expectedPrefix)?.number ?? null;
}

async function claimInboundMessage(payload: InboundPayload): Promise<InboundClaim> {
  const raw = serializeRawPayload(payload);
  const dedupKey = createDedupKey(payload.messageId, raw);
  const now = new Date();

  try {
    const inboundMessage = await prisma.inboundMessage.create({
      data: {
        tenantSlug: payload.tenant,
        messageId: payload.messageId,
        dedupKey,
        fromEmail: payload.from,
        subject: payload.subject || null,
        body: payload.body,
        raw,
        status: 'processing',
        attemptCount: 1,
        lastAttemptAt: now,
      },
    });
    return { claimed: true, id: inboundMessage.id };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
  }

  const existing = await prisma.inboundMessage.findFirst({
    where: {
      OR: [
        { dedupKey },
        { messageId: payload.messageId },
      ],
    },
  });

  if (!existing) {
    throw new Error('Webhook idempotency kaydı bulunamadı');
  }

  if (existing.status === 'processed') {
    return {
      claimed: false,
      ticketId: existing.ticketId,
      commentId: existing.commentId,
    };
  }

  const leaseExpired = (
    existing.status === 'processing'
    && (
      !existing.lastAttemptAt
      || existing.lastAttemptAt.getTime() <= now.getTime() - PROCESSING_LEASE_MS
    )
  );
  const isWithinRetryWindow = (
    existing.createdAt.getTime() >= now.getTime() - RETRY_WINDOW_MS
  );
  const canRetry = isWithinRetryWindow && (existing.status === 'failed' || leaseExpired);

  if (!canRetry) {
    return {
      claimed: false,
      ticketId: existing.ticketId,
      commentId: existing.commentId,
    };
  }

  const claimed = await prisma.inboundMessage.updateMany({
    where: {
      id: existing.id,
      status: existing.status,
      attemptCount: existing.attemptCount,
    },
    data: {
      tenantSlug: payload.tenant,
      dedupKey,
      fromEmail: payload.from,
      subject: payload.subject || null,
      body: payload.body,
      raw,
      status: 'processing',
      attemptCount: { increment: 1 },
      lastAttemptAt: now,
      processedAt: null,
      validationError: null,
      errorMessage: null,
    },
  });

  if (claimed.count === 0) {
    return {
      claimed: false,
      ticketId: existing.ticketId,
      commentId: existing.commentId,
    };
  }

  return { claimed: true, id: existing.id };
}

async function findCustomer(
  tx: Prisma.TransactionClient,
  email: string,
  tenantId: string,
) {
  const customer = await tx.user.findFirst({
    where: { email, tenantId, role: 'customer' },
  });

  if (!customer) {
    throw new NotFoundError('Gönderen kullanıcı bulunamadı');
  }

  return customer;
}

async function markInboundProcessed(
  tx: Prisma.TransactionClient,
  id: string,
  ticketId: string,
  commentId?: string,
) {
  return tx.inboundMessage.update({
    where: { id },
    data: {
      status: 'processed',
      ticketId,
      commentId: commentId || null,
      processedAt: new Date(),
      validationError: null,
      errorMessage: null,
    },
  });
}

async function markInboundFailed(
  id: string,
  error: unknown,
  tenantId?: string,
) {
  const message = error instanceof Error ? error.message : 'Webhook işlenemedi';
  return prisma.inboundMessage.update({
    where: { id },
    data: {
      status: 'failed',
      ...(tenantId ? { tenantId } : {}),
      errorMessage: message,
    },
  });
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && error.code === 'P2002',
  );
}

function createDedupKey(messageId: string | null, raw: string) {
  if (messageId) return `message:${messageId}`;
  return `payload:${createHash('sha256').update(raw).digest('hex')}`;
}

function serializeRawPayload(payload: unknown) {
  const serialized = JSON.stringify(payload ?? null);
  return serialized ?? 'null';
}

function getPartialPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      messageId: null,
      tenant: null,
      from: null,
      subject: null,
      body: null,
    };
  }

  const record = payload as Record<string, unknown>;
  return {
    messageId: getOptionalString(record.messageId),
    tenant: getOptionalString(record.tenant),
    from: getOptionalString(record.from),
    subject: getOptionalString(record.subject),
    body: getOptionalString(record.body),
  };
}

function getOptionalString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
