import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getAuthenticatedUser, requireRole } from '../lib/tenant-context';
import { ValidationError } from '../lib/errors';
import {
  createTicket,
  listTickets,
  getTicketById,
  updateTicketStatus,
  confirmResolution,
  rejectResolution,
  createFollowUpTicket,
  claimTicket,
  assignTicket,
} from '../services/ticket';

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

    const result = await listTickets({
      tenantId: user.tenantId,
      customerId: user.role === 'customer' ? user.id : undefined,
      status: query.status,
      priority: query.priority,
      assignedToId: query.assignedToId,
      category: query.category,
      search: query.search,
      page,
      limit,
    });

    return result;
  });

  app.get('/api/tickets/:id', async (request, _reply) => {
    const user = getAuthenticatedUser(request);
    const { id } = request.params as { id: string };

    const ticket = await getTicketById(id, user.tenantId, user.id, user.role);
    return ticket;
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

    const ticket = await assignTicket(id, user.tenantId, parsed.data.agentId);
    return ticket;
  });
}
