import Fastify from 'fastify';

const app = Fastify({ logger: true });

const start = async () => {
  try {
    await app.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' });
    app.log.info('Backend sunucusu çalışıyor');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
