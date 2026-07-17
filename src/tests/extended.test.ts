import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fjwt from '@fastify/jwt';
import { authMiddleware } from '../backend/middleware/auth';
import { tenantMiddleware } from '../backend/middleware/tenant';
import { authRoutes } from '../backend/routes/auth';
import { ticketRoutes } from '../backend/routes/ticket';
import { commentRoutes } from '../backend/routes/comment';
import { slaRoutes } from '../backend/routes/sla';
import { inboundEmailRoutes } from '../backend/routes/inbound-email';
import { rulesRoutes } from '../backend/routes/rules';
import { agentRoutes } from '../backend/routes/agent';
import { AppError } from '../backend/lib/errors';
import { addBusinessMinutes } from '../backend/lib/business-hours';

const TEST_WEBHOOK_SECRET = 'ticketbase-webhook-secret';

async function buildApp() {
  process.env.WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
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
  await app.register(commentRoutes);
  await app.register(slaRoutes);
  await app.register(inboundEmailRoutes);
  await app.register(rulesRoutes);
  await app.register(agentRoutes);

  return app;
}

async function loginAs(app: ReturnType<typeof Fastify>, email: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password: '123456' },
  });
  return JSON.parse(res.body);
}

// ---------- CROSS-TENANT LOGIN ----------

describe('Cross-Tenant Login', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('acme tenant kullanıcısı acme ticketlarını görebilmeli', async () => {
    const login = await loginAs(app, 'agent1@acme.com');
    expect(login.user.tenant.slug).toBe('acme');

    const res = await app.inject({
      method: 'GET',
      url: '/api/tickets?page=1&limit=1',
      headers: { authorization: `Bearer ${login.token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.tickets.length).toBeGreaterThan(0);
  });
});

// ---------- CLOSED TICKET COMMENT ----------

describe('Closed Ticket Comment', () => {
  let app: ReturnType<typeof Fastify>;
  let adminToken: string;
  let agentToken: string;
  let customerToken: string;
  let ticketId: string;

  beforeAll(async () => {
    app = await buildApp();
    const admin = await loginAs(app, 'admin@acme.com');
    adminToken = admin.token;
    const agent = await loginAs(app, 'agent1@acme.com');
    agentToken = agent.token;
    const customer = await loginAs(app, 'musteri1@acme.com');
    customerToken = customer.token;

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { title: 'Closed comment test', description: 'Test' },
    });
    ticketId = JSON.parse(createRes.body).id;

    await app.inject({
      method: 'PATCH',
      url: `/api/tickets/${ticketId}/status`,
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { status: 'open' },
    });

    await app.inject({
      method: 'PATCH',
      url: `/api/tickets/${ticketId}/status`,
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { status: 'resolved' },
    });

    await app.inject({
      method: 'PATCH',
      url: `/api/tickets/${ticketId}/status`,
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { status: 'closed' },
    });
  });

  afterAll(async () => { await app.close(); });

  it('admin closed ticket a yorum ekleyebilmeli', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticketId}/comments`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { type: 'public_reply', body: 'Admin yorumu' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('agent closed ticket a yorum ekleyememeli', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticketId}/comments`,
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { type: 'public_reply', body: 'Agent yorumu' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('müşteri closed ticket a yorum ekleyememeli', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticketId}/comments`,
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { type: 'public_reply', body: 'Müşteri yorumu' },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ---------- SEARCH WITH SPECIAL CHARS ----------

describe('Search Special Characters', () => {
  let app: ReturnType<typeof Fastify>;
  let token: string;

  beforeAll(async () => {
    app = await buildApp();
    const agent = await loginAs(app, 'agent1@acme.com');
    token = agent.token;
  });

  afterAll(async () => { await app.close(); });

  it('yüzde işareti ile arama yapılabilmeli', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/tickets?search=%&page=1&limit=5',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('alt çizgi ile arama yapılabilmeli', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/tickets?search=test_&page=1&limit=5',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('boşluk ile arama yapılabilmeli', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/tickets?search=ba%C4%9Flant%C4%B1+sorunu&page=1&limit=5',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });
});

// ---------- PAGINATION EDGE CASES ----------

describe('Pagination Edge Cases', () => {
  let app: ReturnType<typeof Fastify>;
  let token: string;

  beforeAll(async () => {
    app = await buildApp();
    const agent = await loginAs(app, 'agent1@acme.com');
    token = agent.token;
  });

  afterAll(async () => { await app.close(); });

  it('page=0 ile çağrı 1. sayfayı dönmeli', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/tickets?page=0&limit=5',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.page).toBe(1);
  });

  it('page=-1 ile çağrı 1. sayfayı dönmeli', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/tickets?page=-1&limit=5',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.page).toBe(1);
  });

  it('limit=999 ile çağrı 100 e kırpılmalı', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/tickets?page=1&limit=999',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.limit).toBe(100);
  });
});

// ---------- SLA HOLIDAY BOUNDARY ----------

describe('SLA Holiday Boundary', () => {
  const holidays = [new Date('2026-01-01'), new Date('2026-04-23')];

  it('31 Aralık 17:00 de 4 saat SLA 2 Ocak 11:00 olmalı (1 Ocak tatil)', () => {
    const start = new Date(Date.UTC(2025, 11, 31, 14, 0, 0));
    const result = addBusinessMinutes(start, 4 * 60, holidays);
    const dateStr = result.toISOString();
    expect(dateStr).toContain('2026-01-02');
  });

  it('23 Nisan tatil, 22 Nisan 17:00 de 2 saat SLA 24 Nisan 10:00', () => {
    const start = new Date(Date.UTC(2026, 3, 22, 14, 0, 0));
    const result = addBusinessMinutes(start, 2 * 60, holidays);
    const dateStr = result.toISOString();
    expect(dateStr).toContain('2026-04-24');
  });
});

// ---------- WEBHOOK CONCURRENT DUPLICATE ----------

describe('Webhook Concurrent Duplicate', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('10 paralel aynı messageId → 1 processed, 9 duplicate', async () => {
    const messageId = crypto.randomUUID();
    const payload = {
      messageId,
      tenant: 'acme',
      from: 'musteri1@acme.com',
      subject: 'Concurrent test',
      body: 'Eşzamanlı mesaj',
    };

    const requests = Array.from({ length: 10 }, () =>
      app.inject({
        method: 'POST',
        url: '/api/webhook/inbound-email',
        headers: { 'x-webhook-secret': TEST_WEBHOOK_SECRET },
        payload,
      }),
    );

    const results = await Promise.all(requests);
    const processed = results.filter((r) => JSON.parse(r.body).status === 'processed').length;
    const duplicates = results.filter((r) => JSON.parse(r.body).status === 'duplicate').length;

    expect(processed).toBe(1);
    expect(duplicates).toBe(9);
  });
});

// ---------- STATUS RACE CONDITION ----------

describe('Status Race Condition', () => {
  let app: ReturnType<typeof Fastify>;
  let agentToken: string;
  let customerToken: string;
  let ticketId: string;

  beforeAll(async () => {
    app = await buildApp();
    const agent = await loginAs(app, 'agent1@acme.com');
    agentToken = agent.token;
    const customer = await loginAs(app, 'musteri1@acme.com');
    customerToken = customer.token;

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { title: 'Race status test', description: 'Test' },
    });
    ticketId = JSON.parse(createRes.body).id;
  });

  afterAll(async () => { await app.close(); });

  it('5 paralel status değiştirme → sadece 1 başarılı', async () => {
    await app.inject({
      method: 'PATCH',
      url: `/api/tickets/${ticketId}/status`,
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { status: 'open' },
    });

    const closeRequests = Array.from({ length: 5 }, () =>
      app.inject({
        method: 'PATCH',
        url: `/api/tickets/${ticketId}/status`,
        headers: { authorization: `Bearer ${agentToken}` },
        payload: { status: 'closed' },
      }),
    );

    const results = await Promise.all(closeRequests);
    const successCount = results.filter((r) => r.statusCode === 200).length;

    expect(successCount).toBe(1);
  });
});

// ---------- CROSS-TENANT AGENT ACCESS ----------

describe('Cross-Tenant Agent Access', () => {
  let app: ReturnType<typeof Fastify>;
  let acmeTicketId: string;
  let acmeCustomerToken: string;

  beforeAll(async () => {
    app = await buildApp();
    const customer = await loginAs(app, 'musteri1@acme.com');
    acmeCustomerToken = customer.token;

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: { authorization: `Bearer ${acmeCustomerToken}` },
      payload: { title: 'Isolation test ticket', description: 'Test' },
    });
    acmeTicketId = JSON.parse(createRes.body).id;
  });

  afterAll(async () => { await app.close(); });

  it('globex agent acme ticket ını görememeli', async () => {
    const globexAgent = await loginAs(app, 'agent1@globex.com');
    const res = await app.inject({
      method: 'GET',
      url: `/api/tickets/${acmeTicketId}`,
      headers: { authorization: `Bearer ${globexAgent.token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('globex admin acme ticket ını görememeli', async () => {
    const globexAdmin = await loginAs(app, 'admin@globex.com');
    const res = await app.inject({
      method: 'GET',
      url: `/api/tickets/${acmeTicketId}`,
      headers: { authorization: `Bearer ${globexAdmin.token}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
