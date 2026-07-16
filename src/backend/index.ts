import Fastify from 'fastify';
import cors from '@fastify/cors';
import fjwt from '@fastify/jwt';
import { authMiddleware } from './middleware/auth';
import { tenantMiddleware } from './middleware/tenant';
import { authRoutes } from './routes/auth';
import { AppError } from './lib/errors';

const app = Fastify({ logger: true });

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({ message: error.message });
  }

  const fastifyError = error as { validation?: unknown };
  if (fastifyError.validation) {
    return reply.status(400).send({ message: 'Geçersiz istek' });
  }

  app.log.error(error);
  return reply.status(500).send({ message: 'Sunucu hatası' });
});

const start = async () => {
  await app.register(cors);
  await app.register(fjwt, {
    secret: process.env.JWT_SECRET || 'fallback-dev-secret',
    sign: { expiresIn: '7d' },
  });

  app.addHook('onRequest', authMiddleware);
  app.addHook('onRequest', tenantMiddleware);

  await app.register(authRoutes);

  try {
    await app.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' });
    app.log.info('Backend sunucusu çalışıyor');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
