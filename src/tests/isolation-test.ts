import Fastify from 'fastify';
import cors from '@fastify/cors';
import fjwt from '@fastify/jwt';
import { authMiddleware } from '../backend/middleware/auth';
import { tenantMiddleware } from '../backend/middleware/tenant';
import { authRoutes } from '../backend/routes/auth';
import { ticketRoutes } from '../backend/routes/ticket';
import { commentRoutes } from '../backend/routes/comment';
import { inboundEmailRoutes } from '../backend/routes/inbound-email';
import { slaRoutes } from '../backend/routes/sla';
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
  await app.register(fjwt, { secret: 'isolation-test-secret', sign: { expiresIn: '1h' } });
  app.addHook('onRequest', authMiddleware);
  app.addHook('onRequest', tenantMiddleware);
  await app.register(authRoutes);
  await app.register(ticketRoutes);
  await app.register(commentRoutes);
  await app.register(inboundEmailRoutes);
  await app.register(slaRoutes);
  await app.register(rulesRoutes);

  return app;
}

async function loginAs(app: ReturnType<typeof Fastify>, email: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password: '123456' },
  });
  return JSON.parse(res.body) as { token: string; user: { id: string } };
}

async function main() {
  console.log('İzolasyon testi başlıyor...\n');

  const app = await buildApp();

  const acmeLogin = await loginAs(app, 'agent1@acme.com');
  const globexLogin = await loginAs(app, 'agent1@globex.com');
  const customerLogin = await loginAs(app, 'musteri1@acme.com');
  const acmeToken = acmeLogin.token;
  const globexToken = globexLogin.token;
  const customerToken = customerLogin.token;

  let failed = 0;
  let passed = 0;

  function check(label: string, status: number, expected: number) {
    const ok = status === expected;
    console.log(`   ${ok ? '✅' : '❌'} ${label}: beklenen ${expected}, alınan ${status}`);
    if (ok) passed++; else failed++;
  }

  function checkCondition(label: string, condition: boolean) {
    console.log(`   ${condition ? '✅' : '❌'} ${label}`);
    if (condition) passed++; else failed++;
  }

  console.log('1. Çapraz tenant erişim:\n');

  const acmeTicketList = await app.inject({
    method: 'GET',
    url: '/api/tickets?page=1&limit=1',
    headers: { authorization: `Bearer ${acmeToken}` },
  });
  const acmeTicketId = JSON.parse(acmeTicketList.body).tickets?.[0]?.id;

  check('ACME tenant listesi (ACME token)', acmeTicketList.statusCode, 200);

  const globexTicketList = await app.inject({
    method: 'GET',
    url: '/api/tickets?page=1&limit=1',
    headers: { authorization: `Bearer ${globexToken}` },
  });
  check('Globex tenant listesi (Globex token)', globexTicketList.statusCode, 200);

  if (acmeTicketId) {
    const crossAccess = await app.inject({
      method: 'GET',
      url: `/api/tickets/${acmeTicketId}`,
      headers: { authorization: `Bearer ${globexToken}` },
    });
    check('ACME ticket ID ile Globex erişimi (404 olmalı)', crossAccess.statusCode, 404);
  }

  console.log('\n2. ID tahmini koruması:\n');

  const fakeId = 'nonexistent-id-12345';
  const fakeAccess = await app.inject({
    method: 'GET',
    url: `/api/tickets/${fakeId}`,
    headers: { authorization: `Bearer ${acmeToken}` },
  });
  check('Var olmayan ticket ID (404 olmalı)', fakeAccess.statusCode, 404);

  console.log('\n3. Rol bazlı yetkilendirme:\n');

  const customerListAccess = await app.inject({
    method: 'GET',
    url: '/api/tickets',
    headers: { authorization: `Bearer ${customerToken}` },
  });
  check('Müşteri kendi ticket listesini görebilmeli', customerListAccess.statusCode, 200);
  const customerTickets = JSON.parse(customerListAccess.body).tickets || [];
  checkCondition(
    'Müşteri listesinde yalnızca kendi ticketları bulunmalı',
    customerTickets.every((ticket: { customerId: string }) => ticket.customerId === customerLogin.user.id),
  );

  const dashboardAccess = await app.inject({
    method: 'GET',
    url: '/api/sla/dashboard',
    headers: { authorization: `Bearer ${customerToken}` },
  });
  check('Müşteri dashboard (403 olmalı)', dashboardAccess.statusCode, 403);

  const rulesAccess = await app.inject({
    method: 'GET',
    url: '/api/rules',
    headers: { authorization: `Bearer ${customerToken}` },
  });
  check('Müşteri rules (403 olmalı)', rulesAccess.statusCode, 403);

  console.log('\n4. Yorum görünürlüğü:\n');

  if (acmeTicketId) {
    const commentAsCustomer = await app.inject({
      method: 'POST',
      url: `/api/tickets/${acmeTicketId}/comments`,
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { type: 'internal_note', body: 'Gizli not' },
    });
    check('Müşteri internal_note (403 olmalı)', commentAsCustomer.statusCode, 403);
  }

  console.log(`\n🏁 Test sonucu: ${passed} başarılı, ${failed} başarısız`);
  const success = failed === 0;
  console.log(`   Genel: ${success ? '✅ BAŞARILI' : '❌ BAŞARISIZ'}`);

  await app.close();
  process.exit(success ? 0 : 1);
}

main().catch((e) => {
  console.error('İzolasyon test hatası:', e);
  process.exit(1);
});
