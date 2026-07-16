import { FastifyRequest, FastifyReply } from 'fastify';

const PUBLIC_ROUTES = ['/api/auth/login'];

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (PUBLIC_ROUTES.includes(request.url)) {
    return;
  }

  try {
    await request.jwtVerify();
  } catch {
    reply.status(401).send({ message: 'Geçersiz veya süresi dolmuş token' });
  }
}
