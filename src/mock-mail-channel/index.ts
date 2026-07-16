import Fastify from 'fastify';

const app = Fastify({ logger: true });

const start = async () => {
  try {
    await app.listen({ port: Number(process.env.MOCK_MAIL_PORT) || 4000, host: '0.0.0.0' });
    app.log.info('Mock mail channel çalışıyor');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
