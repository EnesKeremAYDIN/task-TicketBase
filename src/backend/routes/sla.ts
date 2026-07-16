import { FastifyInstance } from 'fastify';
import { requireRole } from '../lib/tenant-context';
import { getDashboardStats, getSlaBreachList, markBreachedTickets } from '../services/sla';

export async function slaRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/sla/dashboard', async (request, _reply) => {
    const user = requireRole(request, ['agent', 'admin']);
    await markBreachedTickets(user.tenantId);
    const stats = await getDashboardStats(user.tenantId);
    return stats;
  });

  app.get('/api/sla/breaches', async (request, _reply) => {
    const user = requireRole(request, ['agent', 'admin']);
    const query = request.query as Record<string, string>;
    const page = Math.max(1, parseInt(query.page || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20')));

    await markBreachedTickets(user.tenantId);
    const result = await getSlaBreachList(user.tenantId, page, limit);
    return result;
  });
}
