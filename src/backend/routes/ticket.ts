import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getAuthenticatedUser, requireRole } from '../lib/tenant-context';
import { ForbiddenError, ValidationError } from '../lib/errors';
import {
  createTicket,
  listTickets,
  listTicketCategories,
  getTicketById,
  updateTicketStatus,
  confirmResolution,
  rejectResolution,
  createFollowUpTicket,
  claimTicket,
  assignTicket,
} from '../services/ticket';
import { bulkUpdateTickets } from '../services/bulk-ticket';
import { getTicketActivities } from '../services/ticket-activity';
import { markBreachedTickets } from '../services/sla';

const createTicketSchema = z.object({
  title: z.string().min(1, 'Başlık zorunludur').max(500),
  description: z.string().min(1, 'Açıklama zorunludur').max(10000),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  category: z.string().max(100).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['new', 'open', 'pending', 'resolved', 'closed']),
  pendingUntil: z.string().datetime({ message: 'Geçerli bir bekleme tarihi giriniz' }).optional(),
  pendingReason: z.string().min(1, 'Bekleme nedeni zorunludur').max(500).optional(),
  reason: z.string().min(1, 'İşlem nedeni zorunludur').max(1000).optional(),
});

const resolutionRejectionSchema = z.object({
  reason: z.string().min(1, 'Sorunun neden devam ettiğini açıklayın').max(1000),
});

const followUpSchema = z.object({
  description: z.string().min(1, 'Açıklama zorunludur').max(10000),
});

const assignSchema = z.object({
  agentId: z.string().min(1, 'Ajan ID zorunludur'),
});

const ticketQueueSchema = z.enum(['my', 'unassigned', 'escalated']);

const bulkTicketSchema = z.object({
  ticketIds: z.array(z.string().min(1))
    .min(1, 'En az bir ticket seçilmelidir')
    .max(100, 'Tek seferde en fazla 100 ticket güncellenebilir')
    .refine((ids) => new Set(ids).size === ids.length, 'Ticket listesinde tekrar eden kayıtlar var'),
  operation: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('status'),
      status: z.enum(['open', 'pending', 'resolved', 'closed']),
      pendingUntil: z.string().datetime({ message: 'Geçerli bir bekleme tarihi giriniz' }).optional(),
      reason: z.string().min(1, 'İşlem nedeni zorunludur').max(1000).optional(),
    }),
    z.object({
      type: z.literal('priority'),
      priority: z.enum(['low', 'normal', 'high', 'urgent']),
    }),
    z.object({
      type: z.literal('assign'),
      agentId: z.string().min(1).nullable(),
    }),
  ]),
}).superRefine((data, ctx) => {
  if (
    data.operation.type === 'status'
    && data.operation.status === 'pending'
    && (!data.operation.pendingUntil || !data.operation.reason?.trim())
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Pending işlemi için tarih ve neden zorunludur',
      path: ['operation'],
    });
  }
});

export async function ticketRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/tickets', async (request, reply) => {
    const user = requireRole(request, ['customer']);

    const parsed = createTicketSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0].message);
    }

    const ticket = await createTicket(parsed.data, user.id, user.tenantId, (user as { tenantSlug?: string }).tenantSlug || '');
    return reply.status(201).send(ticket);
  });

  app.get('/api/tickets', async (request, _reply) => {
    const user = requireRole(request, ['customer', 'agent', 'admin']);
    const query = request.query as Record<string, string>;

    const page = Math.max(1, parseInt(query.page || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20')));
    const requestedQueue = query.queue
      || (query.assignedToId === 'unassigned' ? 'unassigned' : undefined);
    const parsedQueue = requestedQueue
      ? ticketQueueSchema.safeParse(requestedQueue)
      : undefined;

    if (parsedQueue && !parsedQueue.success) {
      throw new ValidationError('Geçersiz ticket kuyruğu');
    }

    const queue = parsedQueue?.success ? parsedQueue.data : undefined;
    if (queue && user.role === 'customer') {
      throw new ForbiddenError('Ticket kuyrukları yalnızca destek ekibi içindir');
    }
    if (queue === 'my' && user.role !== 'agent') {
      throw new ForbiddenError('My Tickets kuyruğu yalnızca ajan kullanıcıları içindir');
    }
    if (queue === 'escalated') {
      await markBreachedTickets(user.tenantId);
    }

    const result = await listTickets({
      tenantId: user.tenantId,
      customerId: user.role === 'customer' ? user.id : undefined,
      queue,
      currentUserId: user.id,
      status: query.status,
      priority: query.priority,
      assignedToId: query.assignedToId === 'unassigned' ? undefined : query.assignedToId,
      category: query.category,
      search: query.search,
      page,
      limit,
    });

    return result;
  });

  app.get('/api/ticket-categories', async (request, _reply) => {
    const user = requireRole(request, ['customer', 'agent', 'admin']);
    return listTicketCategories(user.tenantId);
  });

  app.get('/api/tickets/:id', async (request, _reply) => {
    const user = getAuthenticatedUser(request);
    const { id } = request.params as { id: string };

    const ticket = await getTicketById(id, user.tenantId, user.id, user.role);
    return ticket;
  });

  app.get('/api/tickets/:id/activities', async (request, _reply) => {
    const user = requireRole(request, ['customer', 'agent', 'admin']);
    const { id } = request.params as { id: string };
    const query = request.query as Record<string, string>;
    const requestedPage = Number.parseInt(query.page || '1', 10);
    const requestedLimit = Number.parseInt(query.limit || '50', 10);
    const page = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1;
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(100, Math.max(1, requestedLimit))
      : 50;

    return getTicketActivities(id, user.tenantId, user.id, user.role, page, limit);
  });

  app.post('/api/tickets/bulk', async (request, _reply) => {
    const user = requireRole(request, ['agent', 'admin']);
    const parsed = bulkTicketSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0].message);
    }

    const operation = parsed.data.operation.type === 'status'
      ? {
        ...parsed.data.operation,
        pendingUntil: parsed.data.operation.pendingUntil
          ? new Date(parsed.data.operation.pendingUntil)
          : undefined,
      }
      : parsed.data.operation;

    return bulkUpdateTickets(
      parsed.data.ticketIds,
      user.tenantId,
      user.id,
      user.role as 'agent' | 'admin',
      operation,
    );
  });

  app.patch('/api/tickets/:id/status', async (request, _reply) => {
    const user = requireRole(request, ['agent', 'admin']);
    const { id } = request.params as { id: string };

    const parsed = updateStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0].message);
    }

    const ticket = await updateTicketStatus(
      id,
      user.tenantId,
      parsed.data.status,
      user.id,
      user.role,
      {
        pendingUntil: parsed.data.pendingUntil ? new Date(parsed.data.pendingUntil) : undefined,
        pendingReason: parsed.data.pendingReason,
        reason: parsed.data.reason,
      },
    );
    return ticket;
  });

  app.post('/api/tickets/:id/confirm-resolution', async (request, _reply) => {
    const user = requireRole(request, ['customer']);
    const { id } = request.params as { id: string };
    return confirmResolution(id, user.tenantId, user.id);
  });

  app.post('/api/tickets/:id/reject-resolution', async (request, _reply) => {
    const user = requireRole(request, ['customer']);
    const { id } = request.params as { id: string };
    const parsed = resolutionRejectionSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0].message);
    }
    return rejectResolution(id, user.tenantId, user.id, parsed.data.reason);
  });

  app.post('/api/tickets/:id/follow-up', async (request, reply) => {
    const user = requireRole(request, ['customer']);
    const { id } = request.params as { id: string };
    const parsed = followUpSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0].message);
    }
    const ticket = await createFollowUpTicket(
      id,
      user.tenantId,
      (user as { tenantSlug?: string }).tenantSlug || '',
      user.id,
      parsed.data.description,
    );
    return reply.status(201).send(ticket);
  });

  app.post('/api/tickets/:id/claim', async (request, _reply) => {
    const user = requireRole(request, ['agent']);
    const { id } = request.params as { id: string };

    const ticket = await claimTicket(id, user.tenantId, user.id);
    return ticket;
  });

  app.post('/api/tickets/:id/assign', async (request, _reply) => {
    const user = requireRole(request, ['admin']);
    const { id } = request.params as { id: string };

    const parsed = assignSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0].message);
    }

    const ticket = await assignTicket(id, user.tenantId, parsed.data.agentId, user.id);
    return ticket;
  });
}
