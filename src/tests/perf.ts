import Fastify from 'fastify';
import cors from '@fastify/cors';
import fjwt from '@fastify/jwt';
import { authMiddleware } from '../backend/middleware/auth';
import { tenantMiddleware } from '../backend/middleware/tenant';
import { authRoutes } from '../backend/routes/auth';
import { ticketRoutes } from '../backend/routes/ticket';
import { slaRoutes } from '../backend/routes/sla';
import { inboundEmailRoutes } from '../backend/routes/inbound-email';
import { commentRoutes } from '../backend/routes/comment';
import { rulesRoutes } from '../backend/routes/rules';
import { AppError } from '../backend/lib/errors';

async function buildApp() {
  const app = Fastify({ logger: false });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ message: error.message });
    }
    return reply.status(500).send({ message: 'Sunucu hatası' });
  });

  await app.register(cors);
  await app.register(fjwt, { secret: 'perf-test-secret', sign: { expiresIn: '1h' } });
  app.addHook('onRequest', authMiddleware);
  app.addHook('onRequest', tenantMiddleware);
  await app.register(authRoutes);
  await app.register(ticketRoutes);
  await app.register(slaRoutes);
  await app.register(inboundEmailRoutes);
  await app.register(commentRoutes);
  await app.register(rulesRoutes);

  return app;
}

function measureP95(times: number[]): number {
  const sorted = [...times].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[idx] || 0;
}

function assertSuccessfulResponse(
  label: string,
  response: { statusCode: number; body: string },
) {
  if (response.statusCode !== 200) {
    const responsePreview = response.body.slice(0, 500);
    throw new Error(
      `${label} başarısız oldu: HTTP ${response.statusCode} - ${responsePreview}`,
    );
  }
}

async function main() {
  console.log('Performans testi başlıyor...\n');

  const app = await buildApp();

  try {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'agent1@acme.com', password: '123456' },
    });
    assertSuccessfulResponse('Performans testi girişi', loginRes);

    const token = (JSON.parse(loginRes.body) as { token?: unknown }).token;
    if (typeof token !== 'string' || !token) {
      throw new Error('Performans testi girişi geçerli bir token döndürmedi');
    }

    const listTimes: number[] = [];
    const dashboardTimes: number[] = [];

    for (let i = 0; i < 20; i++) {
      const start = Date.now();
      const response = await app.inject({
        method: 'GET',
        url: '/api/tickets?page=1&limit=20',
        headers: { authorization: `Bearer ${token}` },
      });
      assertSuccessfulResponse(`Ticket listesi isteği ${i + 1}`, response);
      listTimes.push(Date.now() - start);
    }

    for (let i = 0; i < 10; i++) {
      const start = Date.now();
      const response = await app.inject({
        method: 'GET',
        url: '/api/sla/dashboard',
        headers: { authorization: `Bearer ${token}` },
      });
      assertSuccessfulResponse(`Dashboard isteği ${i + 1}`, response);
      dashboardTimes.push(Date.now() - start);
    }

    const listP95 = measureP95(listTimes);
    const dashboardP95 = measureP95(dashboardTimes);

    const listAvg = listTimes.reduce((a, b) => a + b, 0) / listTimes.length;
    const dashboardAvg = dashboardTimes.reduce((a, b) => a + b, 0) / dashboardTimes.length;

    console.log('Ticket Listesi:');
    console.log(`   Ortalama: ${listAvg.toFixed(1)}ms`);
    console.log(`   P95: ${listP95}ms`);
    console.log(`   Durum: ${listP95 < 300 ? '✅ BAŞARILI (<300ms)' : '❌ BAŞARISIZ (>=300ms)'}`);

    console.log('\nDashboard:');
    console.log(`   Ortalama: ${dashboardAvg.toFixed(1)}ms`);
    console.log(`   P95: ${dashboardP95}ms`);
    console.log(`   Durum: ${dashboardP95 < 500 ? '✅ BAŞARILI (<500ms)' : '❌ BAŞARISIZ (>=500ms)'}`);

    const success = listP95 < 300 && dashboardP95 < 500;
    console.log(`\n🏁 Performans testi ${success ? 'BAŞARILI' : 'BAŞARISIZ'}`);
    if (!success) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error('Perf test hatası:', e);
  process.exitCode = 1;
});
