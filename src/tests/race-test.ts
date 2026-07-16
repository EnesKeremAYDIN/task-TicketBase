import Fastify from 'fastify';
import cors from '@fastify/cors';
import fjwt from '@fastify/jwt';
import { authMiddleware } from '../backend/middleware/auth';
import { tenantMiddleware } from '../backend/middleware/tenant';
import { authRoutes } from '../backend/routes/auth';
import { ticketRoutes } from '../backend/routes/ticket';
import { AppError } from '../backend/lib/errors';

async function buildApp() {
  const app = Fastify({ logger: false });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ message: error.message });
    }
    const fastifyError = error as { validation?: unknown };
    if (fastifyError.validation) {
      return reply.status(400).send({ message: 'Geçersiz istek' });
    }
    return reply.status(500).send({ message: 'Sunucu hatası' });
  });

  await app.register(cors);
  await app.register(fjwt, { secret: 'test-secret', sign: { expiresIn: '7d' } });
  app.addHook('onRequest', authMiddleware);
  app.addHook('onRequest', tenantMiddleware);
  await app.register(authRoutes);
  await app.register(ticketRoutes);

  return app;
}

async function loginCustomer(app: ReturnType<typeof Fastify>) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'musteri1@acme.com', password: '123456' },
  });
  return JSON.parse(res.body).token;
}

async function loginAgent(app: ReturnType<typeof Fastify>, id: number) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: `agent${id}@acme.com`, password: '123456' },
  });
  return JSON.parse(res.body).token;
}

async function main() {
  console.log('Race test başlıyor...\n');

  const app = await buildApp();
  const customerToken = await loginCustomer(app);
  const agent1Token = await loginAgent(app, 1);
  const agent2Token = await loginAgent(app, 2);

  const createRequests = Array.from({ length: 20 }, (_, i) =>
    app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { title: `Race ticket ${i + 1}`, description: 'Race condition test' },
    }),
  );

  console.log('1. Test: 20 paralel ticket oluşturma...');
  const createResults = await Promise.all(createRequests);

  const numbers: number[] = [];
  let failures = 0;

  for (const res of createResults) {
    if (res.statusCode === 201) {
      numbers.push(JSON.parse(res.body).number);
    } else {
      failures++;
    }
  }

  const uniqueNumbers = new Set(numbers);
  const isSuccess = uniqueNumbers.size === 20 && failures === 0;

  console.log(`   Başarılı: ${numbers.length}, Başarısız: ${failures}`);
  console.log(`   Benzersiz numara: ${uniqueNumbers.size}/20`);
  console.log(`   Sonuç: ${isSuccess ? '✅ BAŞARILI' : '❌ BAŞARISIZ'}`);

  if (!isSuccess) {
    console.log('   Hata: Tüm ticketlar benzersiz numara alamadı!');
    await app.close();
    process.exit(1);
  }

  const firstTicketId = JSON.parse(createResults[0].body).id;

  console.log('\n2. Test: 10 paralel üstlenme (aynı ticket)...');
  const claimRequests = Array.from({ length: 10 }, (_, i) =>
    app.inject({
      method: 'POST',
      url: `/api/tickets/${firstTicketId}/claim`,
      headers: {
        authorization: `Bearer ${i % 2 === 0 ? agent1Token : agent2Token}`,
      },
    }),
  );

  const claimResults = await Promise.all(claimRequests);
  const successClaims = claimResults.filter((r) => r.statusCode === 200).length;

  console.log(`   Başarılı üstlenme: ${successClaims}`);
  console.log(`   Sonuç: ${successClaims === 1 ? '✅ BAŞARILI' : '❌ BAŞARISIZ'}`);

  if (successClaims !== 1) {
    console.log(`   Hata: ${successClaims} agent aynı ticket'ı üstlendi!`);
    await app.close();
    process.exit(1);
  }

  console.log('\n🏁 Race test tamamlandı!');
  await app.close();
}

main().catch((e) => {
  console.error('Race test hatası:', e);
  process.exit(1);
});
