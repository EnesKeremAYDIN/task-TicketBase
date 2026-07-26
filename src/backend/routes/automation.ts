import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../lib/tenant-context';
import { ValidationError } from '../lib/errors';
import {
  cannedResponseDataSchema,
  macroActionsSchema,
  ticketMacroDataSchema,
} from '../lib/automation';
import {
  applyTicketMacro,
  createCannedResponse,
  createTicketMacro,
  listCannedResponses,
  listTicketMacros,
  updateCannedResponse,
  updateTicketMacro,
} from '../services/automation';

const cannedResponseUpdateSchema = cannedResponseDataSchema.partial()
  .refine((data) => Object.keys(data).length > 0, 'Güncellenecek alan bulunamadı');

const ticketMacroUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  actions: macroActionsSchema.optional(),
  isActive: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, 'Güncellenecek alan bulunamadı');

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);
  return parsed.data;
}

export async function automationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/canned-responses', async (request, _reply) => {
    const user = requireRole(request, ['agent', 'admin']);
    const query = request.query as { includeInactive?: string };
    const includeInactive = user.role === 'admin' && query.includeInactive === 'true';
    return listCannedResponses(user.tenantId, includeInactive);
  });

  app.post('/api/canned-responses', async (request, reply) => {
    const user = requireRole(request, ['admin']);
    const data = parseBody(cannedResponseDataSchema, request.body);
    return reply.status(201).send(await createCannedResponse(user.tenantId, user.id, data));
  });

  app.patch('/api/canned-responses/:id', async (request, _reply) => {
    const user = requireRole(request, ['admin']);
    const { id } = request.params as { id: string };
    const data = parseBody(cannedResponseUpdateSchema, request.body);
    return updateCannedResponse(id, user.tenantId, data);
  });

  app.get('/api/macros', async (request, _reply) => {
    const user = requireRole(request, ['agent', 'admin']);
    const query = request.query as { includeInactive?: string };
    const includeInactive = user.role === 'admin' && query.includeInactive === 'true';
    return listTicketMacros(user.tenantId, includeInactive);
  });

  app.post('/api/macros', async (request, reply) => {
    const user = requireRole(request, ['admin']);
    const data = parseBody(ticketMacroDataSchema, request.body);
    return reply.status(201).send(await createTicketMacro(user.tenantId, user.id, data));
  });

  app.patch('/api/macros/:id', async (request, _reply) => {
    const user = requireRole(request, ['admin']);
    const { id } = request.params as { id: string };
    const data = parseBody(ticketMacroUpdateSchema, request.body);
    return updateTicketMacro(id, user.tenantId, data);
  });

  app.post('/api/tickets/:ticketId/macros/:macroId/apply', async (request, _reply) => {
    const user = requireRole(request, ['agent', 'admin']);
    const { ticketId, macroId } = request.params as { ticketId: string; macroId: string };
    return applyTicketMacro(
      ticketId,
      macroId,
      user.tenantId,
      user.id,
      user.role as 'agent' | 'admin',
    );
  });
}
