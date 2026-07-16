import { FastifyRequest, FastifyReply } from 'fastify';

const PUBLIC_ROUTES = ['/api/auth/login'];

export async function tenantMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (PUBLIC_ROUTES.includes(request.url)) {
    return;
  }

  const user = request.user as { tenantId?: string } | undefined;

  if (!user?.tenantId) {
    reply.status(401).send({ message: 'Oturum bulunamadı' });
  }
}
