import Fastify from 'fastify';

const app = Fastify({ logger: true });

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

app.post('/simulate', async (request, reply) => {
  const { tenant, from, subject, body } = request.body as Record<string, string | undefined>;

  if (!tenant || !from || !body) {
    return reply.status(400).send({ message: 'tenant, from ve body zorunludur' });
  }

  const messageId = crypto.randomUUID();

  const payload = {
    messageId,
    tenant,
    from,
    subject: subject || '',
    body,
  };

  try {
    const response = await fetch(`${BACKEND_URL}/api/webhook/inbound-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    return reply.status(response.status).send(result);
  } catch (error) {
    app.log.error({ err: error }, 'Backend webhook çağrısı başarısız');
    return reply.status(502).send({ message: 'Backend webhook çağrılamadı' });
  }
});

app.get('/health', async () => {
  return { status: 'ok' };
});

const start = async () => {
  try {
    await app.listen({ port: Number(process.env.MOCK_MAIL_PORT) || 4000, host: '0.0.0.0' });
    app.log.info(`Mock mail channel çalışıyor -> ${BACKEND_URL}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
