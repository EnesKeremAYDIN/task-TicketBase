import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fjwt from '@fastify/jwt';
import { authMiddleware } from '../backend/middleware/auth';
import { tenantMiddleware } from '../backend/middleware/tenant';
import { authRoutes } from '../backend/routes/auth';
import { ticketRoutes } from '../backend/routes/ticket';
import { inboundEmailRoutes } from '../backend/routes/inbound-email';
import { AppError } from '../backend/lib/errors';

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
  await app.register(inboundEmailRoutes);

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

describe('Inbound Email - POST /api/webhook/inbound-email', () => {
  let app: ReturnType<typeof Fastify>;
  let knownTicketId: string;
  let customerToken: string;

  beforeAll(async () => {
    app = await buildApp();

    const login = await loginAs(app, 'musteri1@acme.com');
    customerToken = login.token;

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { title: 'Webhook test ticket', description: 'Test' },
    });
    knownTicketId = JSON.parse(createRes.body).id;
  });

  afterAll(async () => {
    await app.close();
  });

  function webhookHeaders() {
    return { 'x-webhook-secret': TEST_WEBHOOK_SECRET };
  }

  it('geçerli e-posta ile yeni ticket oluşturulmalı', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhook/inbound-email',
      headers: webhookHeaders(),
      payload: {
        messageId: crypto.randomUUID(),
        tenant: 'acme',
        from: 'musteri1@acme.com',
        subject: 'Yazıcı arızası',
        body: 'Yazıcı çalışmıyor, yardım eder misiniz?',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('processed');
    expect(body.message).toBe('Yeni ticket oluşturuldu');
    expect(body.ticketId).toBeDefined();
  });

  it('var olan ticket numarasına yorum eklenmeli', async () => {
    const ticketDetail = await app.inject({
      method: 'GET',
      url: `/api/tickets/${knownTicketId}`,
      headers: { authorization: `Bearer ${customerToken}` },
    });
    const ticket = JSON.parse(ticketDetail.body);

    const response = await app.inject({
      method: 'POST',
      url: '/api/webhook/inbound-email',
      headers: webhookHeaders(),
      payload: {
        messageId: crypto.randomUUID(),
        tenant: 'acme',
        from: 'musteri1@acme.com',
        subject: `Re: ${ticket.displayId} - Sorun devam ediyor`,
        body: 'Sorun hala çözülmedi, bakar mısınız?',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('processed');
    expect(body.message).toBe('Yorum eklendi');
    expect(body.commentId).toBeDefined();
  });

  it('tekrarlanan messageId duplicate dönmeli', async () => {
    const messageId = crypto.randomUUID();

    await app.inject({
      method: 'POST',
      url: '/api/webhook/inbound-email',
      headers: webhookHeaders(),
      payload: {
        messageId,
        tenant: 'acme',
        from: 'musteri1@acme.com',
        subject: 'Duplicate test',
        body: 'Bu mesaj iki kez gönderildi',
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/webhook/inbound-email',
      headers: webhookHeaders(),
      payload: {
        messageId,
        tenant: 'acme',
        from: 'musteri1@acme.com',
        subject: 'Duplicate test',
        body: 'Bu mesaj iki kez gönderildi',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('duplicate');
  });

  it('geçersiz tenant ile 400 dönmeli', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhook/inbound-email',
      headers: webhookHeaders(),
      payload: {
        messageId: crypto.randomUUID(),
        tenant: 'olmayan-tenant',
        from: 'musteri1@acme.com',
        subject: 'Test',
        body: 'Test mesajı',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('geçersiz from email ile 400 dönmeli', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhook/inbound-email',
      headers: webhookHeaders(),
      payload: {
        messageId: crypto.randomUUID(),
        tenant: 'acme',
        from: 'gecersiz-email',
        subject: 'Test',
        body: 'Test mesajı',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('eksik body ile 400 dönmeli', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhook/inbound-email',
      headers: webhookHeaders(),
      payload: {
        messageId: crypto.randomUUID(),
        tenant: 'acme',
        from: 'musteri1@acme.com',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('tanınmayan gönderen email ile hata dönmeli', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhook/inbound-email',
      headers: webhookHeaders(),
      payload: {
        messageId: crypto.randomUUID(),
        tenant: 'acme',
        from: 'taninmayan@mail.com',
        subject: 'Test',
        body: 'Test mesajı',
      },
    });

    expect(response.statusCode.toString()).toMatch(/^4\d\d$/);
    const body = JSON.parse(response.body);
    expect(body.message).toContain('Gönderen kullanıcı bulunamadı');
  });

  it('yanlış webhook secret ile 403 dönmeli', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhook/inbound-email',
      headers: { 'x-webhook-secret': 'wrong-secret' },
      payload: {
        messageId: crypto.randomUUID(),
        tenant: 'acme',
        from: 'musteri1@acme.com',
        subject: 'Auth test',
        body: 'Yetkisiz erişim',
      },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.message).toContain('webhook secret');
  });
});
