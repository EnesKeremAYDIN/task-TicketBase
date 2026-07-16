import { FastifyRequest, FastifyReply } from 'fastify';
import { PUBLIC_ROUTES } from '../lib/constants';

export async function tenantMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const path = request.routeOptions?.url || request.url.split('?')[0];

  if (PUBLIC_ROUTES.includes(path)) {
    return;
  }

  const user = request.user as { tenantId?: string } | undefined;

  if (!user?.tenantId) {
    return reply.status(401).send({ message: 'Oturum bulunamadı' });
  }
}
