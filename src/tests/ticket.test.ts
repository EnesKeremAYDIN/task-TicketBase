import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fjwt from '@fastify/jwt';
import { authMiddleware } from '../backend/middleware/auth';
import { tenantMiddleware } from '../backend/middleware/tenant';
import { authRoutes } from '../backend/routes/auth';
import { ticketRoutes } from '../backend/routes/ticket';
import { AppError } from '../backend/lib/errors';
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
  await app.register(fjwt, {
    secret: 'test-secret',
    sign: { expiresIn: '7d' },
  });

  app.addHook('onRequest', authMiddleware);
  app.addHook('onRequest', tenantMiddleware);

  await app.register(authRoutes);
  await app.register(ticketRoutes);

  return app;
}

describe('Ticket CRUD', () => {
  let app: ReturnType<typeof Fastify>;
  let customerToken: string;
  let agentToken: string;
  let adminToken: string;
  let customerId: string;
  let agentId: string;

  beforeAll(async () => {
    app = await buildApp();

    const customerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'musteri1@acme.com', password: '123456' },
    });
    customerToken = JSON.parse(customerLogin.body).token;
    customerId = JSON.parse(customerLogin.body).user.id;

    const agentLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'agent1@acme.com', password: '123456' },
    });
    agentToken = JSON.parse(agentLogin.body).token;
    agentId = JSON.parse(agentLogin.body).user.id;

    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'admin@acme.com', password: '123456' },
    });
    adminToken = JSON.parse(adminLogin.body).token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('müşteri ticket oluşturabilmeli', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { title: 'Test ticket', description: 'Test açıklama' },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.title).toBe('Test ticket');
    expect(body.status).toBe('new');
    expect(body.displayId).toMatch(/^ACME-/);
    expect(body.customerId).toBe(customerId);
  });

  it('müşteri öncelikli ticket oluşturabilmeli', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { title: 'Yüksek öncelik', description: 'Acil', priority: 'high' },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.priority).toBe('high');
  });

  it('kategoriyle ticket oluşturulabilmeli ve kategoriye göre filtrelenebilmeli', async () => {
    const title = `Kategori filtre testi ${Date.now()}`;
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { title, description: 'Ağ kategorisi testi', category: 'Ağ' },
    });

    expect(createResponse.statusCode).toBe(201);
    expect(JSON.parse(createResponse.body).category).toBe('Ağ');

    const listResponse = await app.inject({
      method: 'GET',
      url: `/api/tickets?category=${encodeURIComponent('Ağ')}&search=${encodeURIComponent(title)}`,
      headers: { authorization: `Bearer ${agentToken}` },
    });

    expect(listResponse.statusCode).toBe(200);
    const body = JSON.parse(listResponse.body);
    expect(body.total).toBe(1);
    expect(body.tickets[0].category).toBe('Ağ');
  });

  it('ticket numarası ardışık olmalı', async () => {
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { title: 'Numara test 1', description: 'Test' },
    });

    const res2 = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { title: 'Numara test 2', description: 'Test' },
    });

    const t1 = JSON.parse(res1.body);
    const t2 = JSON.parse(res2.body);

    expect(t2.number).toBeGreaterThan(t1.number);
  });

  it('agent ticket listesini görebilmeli', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tickets?page=1&limit=5',
      headers: { authorization: `Bearer ${agentToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.tickets).toBeDefined();
    expect(body.total).toBeGreaterThan(0);
    expect(body.tickets.length).toBeLessThanOrEqual(5);
  });

  it('müşteri yalnızca kendi ticket listesini görebilmeli', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tickets?page=1&limit=100',
      headers: { authorization: `Bearer ${customerToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.total).toBeGreaterThan(0);
    expect(body.tickets.every((ticket: { customerId: string }) => ticket.customerId === customerId)).toBe(true);
  });

  it('müşteri aynı tenant içindeki başka müşterinin ticketını listede görememeli', async () => {
    const secondCustomerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'musteri2@acme.com', password: '123456' },
    });
    const secondCustomerToken = JSON.parse(secondCustomerLogin.body).token;
    const uniqueTitle = `Başka müşteriye ait ${Date.now()}`;

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: { authorization: `Bearer ${secondCustomerToken}` },
      payload: { title: uniqueTitle, description: 'Yalnızca ikinci müşteri görebilir' },
    });
    expect(createResponse.statusCode).toBe(201);

    const response = await app.inject({
      method: 'GET',
      url: `/api/tickets?search=${encodeURIComponent(uniqueTitle)}`,
      headers: { authorization: `Bearer ${customerToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.total).toBe(0);
    expect(body.tickets).toHaveLength(0);
  });

  it('müşteri ticket listesinde iç not yerine son genel yanıtı görmeli', async () => {
    const uniqueTitle = `Yorum görünürlüğü ${Date.now()}`;
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { title: uniqueTitle, description: 'Yorum görünürlüğü testi' },
    });
    const ticketId = JSON.parse(createResponse.body).id;
    const now = Date.now();

    await prisma.comment.createMany({
      data: [
        {
          ticketId,
          authorId: agentId,
          type: 'public_reply',
          body: 'Müşterinin görebileceği yanıt',
          createdAt: new Date(now - 1000),
        },
        {
          ticketId,
          authorId: agentId,
          type: 'internal_note',
          body: 'Müşteriden gizli iç not',
          createdAt: new Date(now),
        },
      ],
    });

    const customerResponse = await app.inject({
      method: 'GET',
      url: `/api/tickets?search=${encodeURIComponent(uniqueTitle)}`,
      headers: { authorization: `Bearer ${customerToken}` },
    });
    const customerTicket = JSON.parse(customerResponse.body).tickets[0];
    expect(customerTicket.lastComment.body).toBe('Müşterinin görebileceği yanıt');

    const agentResponse = await app.inject({
      method: 'GET',
      url: `/api/tickets?search=${encodeURIComponent(uniqueTitle)}`,
      headers: { authorization: `Bearer ${agentToken}` },
    });
    const agentTicket = JSON.parse(agentResponse.body).tickets[0];
    expect(agentTicket.lastComment.body).toBe('Müşteriden gizli iç not');
  });

  it('ticket detayı görüntülenebilmeli', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { title: 'Detay test', description: 'Detay' },
    });
    const ticketId = JSON.parse(createRes.body).id;

    const response = await app.inject({
      method: 'GET',
      url: `/api/tickets/${ticketId}`,
      headers: { authorization: `Bearer ${agentToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.id).toBe(ticketId);
  });

  it('müşteri kendi ticketını görebilmeli', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { title: 'Kendi ticketım', description: 'Test' },
    });
    const ticketId = JSON.parse(createRes.body).id;

    const response = await app.inject({
      method: 'GET',
      url: `/api/tickets/${ticketId}`,
      headers: { authorization: `Bearer ${customerToken}` },
    });

    expect(response.statusCode).toBe(200);
  });

  it('başka tenant ticketına erişim 404 dönmeli', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { title: 'ACME ticket', description: 'Test' },
    });
    const ticketId = JSON.parse(createRes.body).id;

    const globexLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'agent1@globex.com', password: '123456' },
    });
    const globexToken = JSON.parse(globexLogin.body).token;

    const response = await app.inject({
      method: 'GET',
      url: `/api/tickets/${ticketId}`,
      headers: { authorization: `Bearer ${globexToken}` },
    });

    expect(response.statusCode).toBe(404);
  });

  it('status geçişi çalışmalı: new → open', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { title: 'Status test', description: 'Test' },
    });
    const ticketId = JSON.parse(createRes.body).id;

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/tickets/${ticketId}/status`,
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { status: 'open' },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).status).toBe('open');
  });

  it('geçersiz status geçişi reddedilmeli: closed → pending', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { title: 'Geçersiz geçiş', description: 'Test' },
    });
    const ticketId = JSON.parse(createRes.body).id;

    await app.inject({
      method: 'PATCH',
      url: `/api/tickets/${ticketId}/status`,
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { status: 'closed' },
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/tickets/${ticketId}/status`,
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { status: 'pending' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('agent ticket üstlenebilmeli', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { title: 'Üstlen test', description: 'Test' },
    });
    const ticketId = JSON.parse(createRes.body).id;

    const response = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticketId}/claim`,
      headers: { authorization: `Bearer ${agentToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).assignedTo.id).toBe(agentId);
  });

  it('zaten atanmış ticket üstlenilememeli', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { title: 'Çift üstlen', description: 'Test' },
    });
    const ticketId = JSON.parse(createRes.body).id;

    await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticketId}/claim`,
      headers: { authorization: `Bearer ${agentToken}` },
    });

    const secondClaim = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticketId}/claim`,
      headers: { authorization: `Bearer ${agentToken}` },
    });

    expect(secondClaim.statusCode).toBe(400);
  });

  it('admin atama yapabilmeli', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { title: 'Atama test', description: 'Test' },
    });
    const ticketId = JSON.parse(createRes.body).id;

    const response = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticketId}/assign`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { agentId },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).assignedTo.id).toBe(agentId);
  });
});
