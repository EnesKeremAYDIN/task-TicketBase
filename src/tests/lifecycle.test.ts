import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fjwt from '@fastify/jwt';
import { authMiddleware } from '../backend/middleware/auth';
import { tenantMiddleware } from '../backend/middleware/tenant';
import { authRoutes } from '../backend/routes/auth';
import { ticketRoutes } from '../backend/routes/ticket';
import { commentRoutes } from '../backend/routes/comment';
import { inboundEmailRoutes } from '../backend/routes/inbound-email';
import { AppError } from '../backend/lib/errors';
import { reactivatePendingTickets } from '../backend/services/ticket';
import { autoCloseResolvedTickets } from '../backend/services/sla';
import prisma from '../backend/lib/prisma';

const TEST_WEBHOOK_SECRET = 'ticketbase-webhook-secret';

async function buildApp() {
  process.env.WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
  const app = Fastify({ logger: false });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ message: error.message });
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
  await app.register(inboundEmailRoutes);

  return app;
}

describe('Ticket Yaşam Döngüsü', () => {
  let app: ReturnType<typeof Fastify>;
  let adminToken: string;
  let agentToken: string;
  let customerToken: string;
  let customerId: string;
  let tenantId: string;

  beforeAll(async () => {
    app = await buildApp();

    const [adminLogin, agentLogin, customerLogin] = await Promise.all([
      app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@acme.com', password: '123456' } }),
      app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'agent1@acme.com', password: '123456' } }),
      app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'musteri1@acme.com', password: '123456' } }),
    ]);

    const admin = JSON.parse(adminLogin.body);
    const agent = JSON.parse(agentLogin.body);
    const customer = JSON.parse(customerLogin.body);
    adminToken = admin.token;
    agentToken = agent.token;
    customerToken = customer.token;
    customerId = customer.user.id;
    tenantId = customer.user.tenant.id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function createTicket(title: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { title, description: 'Yaşam döngüsü testi' },
    });
    expect(response.statusCode).toBe(201);
    return JSON.parse(response.body);
  }

  async function changeStatus(ticketId: string, token: string, status: string, extra: Record<string, string> = {}) {
    return app.inject({
      method: 'PATCH',
      url: `/api/tickets/${ticketId}/status`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status, ...extra },
    });
  }

  async function resolveTicket(ticketId: string) {
    expect((await changeStatus(ticketId, agentToken, 'open')).statusCode).toBe(200);
    expect((await changeStatus(ticketId, agentToken, 'resolved')).statusCode).toBe(200);
  }

  it('admin kapalı ticketı neden belirterek yeniden açabilmeli ve kapanma geçmişi korunmalı', async () => {
    const ticket = await createTicket(`Admin reopen ${crypto.randomUUID()}`);
    await resolveTicket(ticket.id);

    const closeResponse = await changeStatus(ticket.id, adminToken, 'closed');
    expect(closeResponse.statusCode).toBe(200);
    const firstClose = JSON.parse(closeResponse.body);
    expect(firstClose.firstClosedAt).toBeTruthy();
    expect(firstClose.closedAt).toBeTruthy();
    expect(firstClose.reopenCount).toBe(0);

    expect((await changeStatus(ticket.id, agentToken, 'open', { reason: 'Agent denemesi' })).statusCode).toBe(400);
    expect((await changeStatus(ticket.id, adminToken, 'open')).statusCode).toBe(400);

    const reopenResponse = await changeStatus(ticket.id, adminToken, 'open', { reason: 'Ek inceleme gerekiyor' });
    expect(reopenResponse.statusCode).toBe(200);
    const reopened = JSON.parse(reopenResponse.body);
    expect(reopened.status).toBe('open');
    expect(reopened.firstClosedAt).toBe(firstClose.firstClosedAt);
    expect(reopened.closedAt).toBe(firstClose.closedAt);
    expect(reopened.lastReopenedAt).toBeTruthy();
    expect(reopened.reopenCount).toBe(1);
  });

  it('müşteri resolved ticket için çözümü onaylayabilmeli', async () => {
    const ticket = await createTicket(`Çözüm onayı ${crypto.randomUUID()}`);
    await resolveTicket(ticket.id);

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/api/tickets/${ticket.id}`,
      headers: { authorization: `Bearer ${customerToken}` },
    });
    expect(JSON.parse(detailResponse.body).allowedActions).toEqual(['confirm_resolution', 'reject_resolution']);

    const response = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticket.id}/confirm-resolution`,
      headers: { authorization: `Bearer ${customerToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).status).toBe('closed');
  });

  it('müşteri çözümü reddettiğinde ticket açılmalı ve açıklaması yorum olarak kaydedilmeli', async () => {
    const ticket = await createTicket(`Çözüm reddi ${crypto.randomUUID()}`);
    await resolveTicket(ticket.id);

    const response = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticket.id}/reject-resolution`,
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { reason: 'Sorun yeniden oluştu' },
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).status).toBe('open');

    const commentsResponse = await app.inject({
      method: 'GET',
      url: `/api/tickets/${ticket.id}/comments`,
      headers: { authorization: `Bearer ${customerToken}` },
    });
    expect(JSON.parse(commentsResponse.body).some((comment: { body: string }) => comment.body === 'Sorun yeniden oluştu')).toBe(true);
  });

  it('pending tarihi ve nedeni zorunlu olmalı; müşteri cevabı ticketı açmalı', async () => {
    const ticket = await createTicket(`Pending cevap ${crypto.randomUUID()}`);
    await changeStatus(ticket.id, agentToken, 'open');

    expect((await changeStatus(ticket.id, agentToken, 'pending')).statusCode).toBe(400);

    const pendingResponse = await changeStatus(ticket.id, agentToken, 'pending', {
      pendingUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      pendingReason: 'Müşteriden log bekleniyor',
    });
    expect(pendingResponse.statusCode).toBe(200);
    expect(JSON.parse(pendingResponse.body).pendingReason).toBe('Müşteriden log bekleniyor');

    const commentResponse = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticket.id}/comments`,
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { type: 'public_reply', body: 'İstenen logları ekledim' },
    });
    expect(commentResponse.statusCode).toBe(200);

    const updated = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(updated?.status).toBe('open');
    expect(updated?.pendingUntil).toBeNull();
    expect(updated?.pendingReason).toBeNull();
  });

  it('süresi gelen pending ticket otomatik olarak yeniden açılmalı', async () => {
    const ticket = await createTicket(`Pending reminder ${crypto.randomUUID()}`);
    await changeStatus(ticket.id, agentToken, 'open');
    await changeStatus(ticket.id, agentToken, 'pending', {
      pendingUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      pendingReason: 'Planlı kontrol bekleniyor',
    });
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { pendingUntil: new Date(Date.now() - 1000) },
    });

    const count = await reactivatePendingTickets(tenantId);
    expect(count).toBeGreaterThanOrEqual(1);
    const updated = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(updated?.status).toBe('open');
  });

  it('beş gün hareketsiz resolved ticket kapanmalı ve ilk kapanma tarihi korunmalı', async () => {
    const suffix = crypto.randomUUID();
    const tenant = await prisma.tenant.create({
      data: { slug: `lifecycle-${suffix}`, name: 'Lifecycle Test' },
    });
    const customer = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `lifecycle-${suffix}@test.local`,
        password: 'test',
        name: 'Lifecycle Customer',
        role: 'customer',
      },
    });
    const ticket = await prisma.ticket.create({
      data: {
        tenantId: tenant.id,
        number: 1,
        displayId: 'LIFECYCLE-1',
        title: 'Otomatik kapanma',
        description: 'Test',
        status: 'resolved',
        priority: 'normal',
        customerId: customer.id,
        resolvedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        lastActivityAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
      },
    });

    try {
      expect(await autoCloseResolvedTickets(tenant.id)).toBe(1);
      const closed = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      expect(closed?.status).toBe('closed');
      expect(closed?.firstClosedAt).toBeTruthy();
      expect(closed?.closedAt).toEqual(closed?.firstClosedAt);
    } finally {
      await prisma.ticket.deleteMany({ where: { tenantId: tenant.id } });
      await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
      await prisma.tenant.delete({ where: { id: tenant.id } });
    }
  });

  it('resolved ticketta yeni yorum varsa otomatik kapanma ertelenmeli', async () => {
    const ticket = await createTicket(`Hareketsizlik yorumu ${crypto.randomUUID()}`);
    await changeStatus(ticket.id, agentToken, 'open');
    await changeStatus(ticket.id, agentToken, 'resolved');
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { lastActivityAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000) },
    });

    const commentResponse = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticket.id}/comments`,
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { type: 'internal_note', body: 'Çözüm sonrası kontrol devam ediyor' },
    });
    expect(commentResponse.statusCode).toBe(200);

    await autoCloseResolvedTickets(tenantId);
    const updated = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(updated.status).toBe('resolved');
    expect(updated.lastActivityAt.getTime()).toBeGreaterThan(Date.now() - 60 * 1000);
  });

  it('kapalı ticket için web follow-up yeni ve bağlantılı ticket oluşturmalı', async () => {
    const ticket = await createTicket(`Web follow-up ${crypto.randomUUID()}`);
    await resolveTicket(ticket.id);
    await changeStatus(ticket.id, adminToken, 'closed');

    const response = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticket.id}/follow-up`,
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { description: 'Kapalı kayıttan sonra yeni sorun' },
    });
    expect(response.statusCode).toBe(201);
    const followUp = JSON.parse(response.body);
    expect(followUp.id).not.toBe(ticket.id);
    expect(followUp.followUpOfId).toBe(ticket.id);
  });

  it('kapalı ticketa gelen e-posta yeni follow-up ticket oluşturmalı', async () => {
    const ticket = await createTicket(`E-posta follow-up ${crypto.randomUUID()}`);
    await resolveTicket(ticket.id);
    await changeStatus(ticket.id, adminToken, 'closed');

    const response = await app.inject({
      method: 'POST',
      url: '/api/webhook/inbound-email',
      headers: { 'x-webhook-secret': TEST_WEBHOOK_SECRET },
      payload: {
        messageId: crypto.randomUUID(),
        tenant: 'acme',
        from: 'musteri1@acme.com',
        subject: `Re: ${ticket.displayId}`,
        body: 'E-posta ile yeni takip mesajı',
      },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.followUpOfId).toBe(ticket.id);

    const followUp = await prisma.ticket.findUnique({ where: { id: body.ticketId } });
    expect(followUp?.followUpOfId).toBe(ticket.id);
    expect(followUp?.customerId).toBe(customerId);
    const followUpActivity = await prisma.ticketActivity.findFirst({
      where: {
        ticketId: ticket.id,
        type: 'follow_up_created',
        newValue: body.ticketId,
      },
    });
    expect(followUpActivity?.source).toBe('email');
  });

  it('müşteri yorumu ilk agent yanıtı olarak sayılmamalı', async () => {
    const ticket = await createTicket(`İlk yanıt ${crypto.randomUUID()}`);
    const response = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticket.id}/comments`,
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { type: 'public_reply', body: 'Ek bilgi paylaşıyorum' },
    });
    expect(response.statusCode).toBe(200);

    const updated = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(updated?.status).toBe('new');
    expect(updated?.firstResponseAt).toBeNull();
  });
});
