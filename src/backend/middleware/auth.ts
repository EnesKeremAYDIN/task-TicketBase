import { FastifyRequest, FastifyReply } from 'fastify';
import { PUBLIC_ROUTES } from '../lib/constants';

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const path = request.routeOptions?.url || request.url.split('?')[0];

  if (PUBLIC_ROUTES.includes(path)) {
    return;
  }

  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({ message: 'Geçersiz veya süresi dolmuş oturum' });
  }
}
