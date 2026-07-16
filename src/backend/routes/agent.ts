import { FastifyInstance } from 'fastify';
import { requireRole } from '../lib/tenant-context';
import prisma from '../lib/prisma';

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/agents', async (request, _reply) => {
    const user = requireRole(request, ['agent', 'admin']);

    const agents = await prisma.user.findMany({
      where: { tenantId: user.tenantId, role: 'agent' },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });

    return agents;
  });
}
