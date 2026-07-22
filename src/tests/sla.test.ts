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
import { AppError } from '../backend/lib/errors';
import { addBusinessMinutes, nextBusinessMinute } from '../backend/lib/business-hours';
import { calculateSLADeadlineValues } from '../backend/services/sla';
import prisma from '../backend/lib/prisma';

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
  await app.register(commentRoutes);
  await app.register(slaRoutes);
  await app.register(inboundEmailRoutes);

  return app;
}

async function loginAs(app: ReturnType<typeof Fastify>, email: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password: '123456' },
  });
  const body = JSON.parse(res.body);
  return { token: body.token, user: body.user };
}

describe('Business Hours Calculator', () => {
  const holidays = [
    new Date('2026-01-01'),
  ];

  it('hafta içi 10:00 da 4 saat SLA 14:00 olmalı', () => {
    const start = new Date(Date.UTC(2026, 0, 5, 7, 0, 0));
    const result = addBusinessMinutes(start, 4 * 60, holidays);
    expect(result.getUTCHours()).toBe(11);
    expect(result.getUTCMinutes()).toBe(0);
  });

  it('cuma 17:00 da 4 saat SLA pazartesi 12:00 olmalı', () => {
    const start = new Date(Date.UTC(2026, 0, 2, 14, 0, 0));
    const result = addBusinessMinutes(start, 4 * 60, holidays);
    expect(result.getUTCDate()).toBe(5);
    expect(result.getUTCHours()).toBe(9);
  });

  it('tatil öncesi son işgününde deadline tatili aşar', () => {
    const start = new Date(Date.UTC(2025, 11, 31, 7, 0, 0));
    const result = addBusinessMinutes(start, 8 * 60 + 60, holidays);
    expect(result.getUTCFullYear()).toBe(2026);
    expect(result.getUTCMonth()).toBe(0);
    expect(result.getUTCDate()).toBe(2);
  });

  it('hafta sonu başlangıcında deadline pazartesiye kayar', () => {
    const saturday = new Date(Date.UTC(2026, 0, 3, 7, 0, 0));
    const result = nextBusinessMinute(saturday, holidays);
    expect(result.getUTCDay()).toBe(1);
    expect(result.getUTCDate()).toBe(5);
    expect(result.getUTCHours()).toBe(6);
  });

  it('SLA tarihlerini veritabanı sorgusu olmadan hesaplamalı', () => {
    const createdAt = new Date(Date.UTC(2026, 0, 5, 7, 0, 0));
    const result = calculateSLADeadlineValues(
      createdAt,
      { firstResponseH: 4, resolutionH: 24, resolutionIsBD: false },
      holidays,
    );

    expect(result.firstResponseSlaDue).toEqual(new Date(Date.UTC(2026, 0, 5, 11, 0, 0)));
    expect(result.slaDueAt).toEqual(new Date(Date.UTC(2026, 0, 7, 13, 0, 0)));
  });
});

describe('Comment Routes', () => {
  let app: ReturnType<typeof Fastify>;
  let customerToken: string;
  let agentToken: string;
  let agentId: string;
  let ticketId: string;

  beforeAll(async () => {
    app = await buildApp();

    const customer = await loginAs(app, 'musteri1@acme.com');
    customerToken = customer.token;

    const agent = await loginAs(app, 'agent1@acme.com');
    agentToken = agent.token;
    agentId = agent.user.id;

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { title: 'SLA test ticket', description: 'Test' },
    });
    ticketId = JSON.parse(createRes.body).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('agent public_reply yazabilmeli', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticketId}/comments`,
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { type: 'public_reply', body: 'Sorun çözüldü, bilgi verildi.' },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.type).toBe('public_reply');
    expect(body.author.id).toBe(agentId);
  });

  it('agent internal_note yazabilmeli', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticketId}/comments`,
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { type: 'internal_note', body: 'İç not: takip gerekiyor.' },
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).type).toBe('internal_note');
  });

  it('müşteri public_reply yazabilmeli', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticketId}/comments`,
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { type: 'public_reply', body: 'Teşekkürler, çalışıyor.' },
    });
    expect(response.statusCode).toBe(200);
  });

  it('müşteri internal_note yazamamalı', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticketId}/comments`,
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { type: 'internal_note', body: 'Gizli not' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('müşteri yalnızca public_reply görebilmeli', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/tickets/${ticketId}/comments`,
      headers: { authorization: `Bearer ${customerToken}` },
    });
    const comments = JSON.parse(response.body);
    for (const c of comments) {
      expect(c.type).toBe('public_reply');
    }
  });

  it('agent tüm yorumları görebilmeli', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/tickets/${ticketId}/comments`,
      headers: { authorization: `Bearer ${agentToken}` },
    });
    const comments = JSON.parse(response.body);
    const types = comments.map((c: { type: string }) => c.type);
    expect(types).toContain('internal_note');
    expect(types).toContain('public_reply');
  });

  it('ilk public_reply firstResponseAt set etmeli', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { title: 'First response test', description: 'Test' },
    });
    const newTicketId = JSON.parse(createRes.body).id;

    await app.inject({
      method: 'POST',
      url: `/api/tickets/${newTicketId}/comments`,
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { type: 'public_reply', body: 'İlk yanıt.' },
    });

    const detail = await app.inject({
      method: 'GET',
      url: `/api/tickets/${newTicketId}`,
      headers: { authorization: `Bearer ${agentToken}` },
    });
    const ticket = JSON.parse(detail.body);
    expect(ticket.firstResponseAt).toBeDefined();
    expect(ticket.status).toBe('open');
  });
});

describe('SLA Dashboard', () => {
  let app: ReturnType<typeof Fastify>;
  let agentToken: string;

  beforeAll(async () => {
    app = await buildApp();
    const agent = await loginAs(app, 'agent1@acme.com');
    agentToken = agent.token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('dashboard stats dönmeli', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/sla/dashboard',
      headers: { authorization: `Bearer ${agentToken}` },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.statusBreakdown).toBeDefined();
    expect(body.priorityBreakdown).toBeDefined();
    expect(body.slaBreached).toBeDefined();
  });

  it('high önceliğin ilk yanıt hedefi 4 saat olmalı', async () => {
    const policy = await prisma.sLAPolicy.findFirst({
      where: {
        priority: 'high',
        tenant: { slug: 'acme' },
      },
    });

    expect(policy).not.toBeNull();
    expect(policy?.firstResponseH).toBe(4);
    expect(policy?.resolutionH).toBe(24);
  });

  it('SLA breach listesi dönmeli', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/sla/breaches',
      headers: { authorization: `Bearer ${agentToken}` },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.tickets).toBeDefined();
    expect(body.total).toBeDefined();
  });
});
