import Fastify from 'fastify';
import cors from '@fastify/cors';
import fjwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { authMiddleware } from './middleware/auth';
import { tenantMiddleware } from './middleware/tenant';
import { authRoutes } from './routes/auth';
import { ticketRoutes } from './routes/ticket';
import { inboundEmailRoutes } from './routes/inbound-email';
import { commentRoutes } from './routes/comment';
import { slaRoutes } from './routes/sla';
import { rulesRoutes } from './routes/rules';
import { agentRoutes } from './routes/agent';
import { AppError } from './lib/errors';
import { autoCloseResolvedTickets } from './services/sla';

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
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    app.log.error('JWT_SECRET ortam değişkeni zorunludur');
    process.exit(1);
  }

  await app.register(cors);

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await app.register(fjwt, {
    secret: jwtSecret,
    sign: { expiresIn: '7d' },
  });

  app.addHook('onRequest', authMiddleware);
  app.addHook('onRequest', tenantMiddleware);

  await app.register(authRoutes);
  await app.register(ticketRoutes);
  await app.register(inboundEmailRoutes);
  await app.register(commentRoutes);
  await app.register(slaRoutes);
  await app.register(rulesRoutes);
  await app.register(agentRoutes);

  const AUTO_CLOSE_INTERVAL = 60 * 60 * 1000;
  setInterval(async () => {
    try {
      const count = await autoCloseResolvedTickets();
      if (count > 0) app.log.info(`${count} ticket otomatik kapatıldı`);
    } catch (err) {
      app.log.error(err, 'Otomatik kapatma hatası');
    }
  }, AUTO_CLOSE_INTERVAL);

  try {
    await app.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' });
    app.log.info('Backend sunucusu çalışıyor');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
