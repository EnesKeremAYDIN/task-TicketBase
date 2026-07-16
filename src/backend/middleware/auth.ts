import { FastifyRequest, FastifyReply } from 'fastify';
import { PUBLIC_ROUTES } from '../lib/constants';

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (PUBLIC_ROUTES.includes(request.url)) {
    return;
  }

  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({ message: 'Geçersiz veya süresi dolmuş oturum' });
  }
}
