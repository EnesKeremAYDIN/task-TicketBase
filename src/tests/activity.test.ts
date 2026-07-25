import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fjwt from '@fastify/jwt';
import { authMiddleware } from '../backend/middleware/auth';
import { tenantMiddleware } from '../backend/middleware/tenant';
import { authRoutes } from '../backend/routes/auth';
import { ticketRoutes } from '../backend/routes/ticket';
import { commentRoutes } from '../backend/routes/comment';
import { AppError } from '../backend/lib/errors';
import { reactivatePendingTickets } from '../backend/services/ticket';
import { autoCloseResolvedTickets } from '../backend/services/sla';
import prisma from '../backend/lib/prisma';

async function buildApp() {
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
  return app;
}

describe('Ticket Aktivite Geçmişi', () => {
  let app: ReturnType<typeof Fastify>;
  let adminToken: string;
  let agentToken: string;
  let customerToken: string;
  let secondCustomerToken: string;
  let globexToken: string;
  let agentId: string;
  let tenantId: string;

  beforeAll(async () => {
    app = await buildApp();
    const [admin, agent, customer, secondCustomer, globex] = await Promise.all([
      login('admin@acme.com'),
      login('agent1@acme.com'),
      login('musteri1@acme.com'),
      login('musteri2@acme.com'),
      login('musteri1@globex.com'),
    ]);

    adminToken = admin.token;
    agentToken = agent.token;
    customerToken = customer.token;
    secondCustomerToken = secondCustomer.token;
    globexToken = globex.token;
    agentId = agent.user.id;
    tenantId = customer.user.tenant.id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(email: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: '123456' },
    });
    expect(response.statusCode).toBe(200);
    return JSON.parse(response.body);
  }

  async function createTicket() {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: {
        title: `Aktivite testi ${crypto.randomUUID()}`,
        description: 'Audit trail doğrulaması',
      },
    });
    expect(response.statusCode).toBe(201);
    return JSON.parse(response.body);
  }

  async function getActivities(ticketId: string, token = adminToken) {
    return app.inject({
      method: 'GET',
      url: `/api/tickets/${ticketId}/activities`,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  async function changeStatus(
    ticketId: string,
    token: string,
    status: string,
    extra: Record<string, string> = {},
  ) {
    return app.inject({
      method: 'PATCH',
      url: `/api/tickets/${ticketId}/status`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status, ...extra },
    });
  }

  it('ticket oluşturulurken actor ve zaman bilgili public aktivite oluşturmalı', async () => {
    const ticket = await createTicket();
    const response = await getActivities(ticket.id, customerToken);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.total).toBe(1);
    expect(body.activities[0]).toMatchObject({
      type: 'ticket_created',
      newValue: 'new',
      source: 'web',
      visibility: 'public',
    });
    expect(body.activities[0].actor.name).toBeTruthy();
    expect(body.activities[0].createdAt).toBeTruthy();
  });

  it('durum değişikliklerinde eski ve yeni durum ile işlemi yapan kullanıcıyı saklamalı', async () => {
    const ticket = await createTicket();
    expect((await changeStatus(ticket.id, agentToken, 'open')).statusCode).toBe(200);

    const body = JSON.parse((await getActivities(ticket.id)).body);
    const statusActivity = body.activities.find((activity: { type: string }) => activity.type === 'status_changed');

    expect(statusActivity).toMatchObject({
      field: 'status',
      oldValue: 'new',
      newValue: 'open',
      source: 'web',
    });
    expect(statusActivity.actor.id).toBe(agentId);
  });

  it('admin yeniden açma nedenini iç ekip görmeli, müşteriye neden sızmamalı', async () => {
    const ticket = await createTicket();
    await changeStatus(ticket.id, agentToken, 'open');
    await changeStatus(ticket.id, agentToken, 'resolved');
    await changeStatus(ticket.id, adminToken, 'closed');
    await changeStatus(ticket.id, adminToken, 'open', { reason: 'İç denetim tekrar istedi' });

    const adminBody = JSON.parse((await getActivities(ticket.id)).body);
    const adminReopen = adminBody.activities.find((activity: { oldValue: string; newValue: string }) => (
      activity.oldValue === 'closed' && activity.newValue === 'open'
    ));
    expect(adminReopen.reason).toBe('İç denetim tekrar istedi');

    const customerBody = JSON.parse((await getActivities(ticket.id, customerToken)).body);
    const customerReopen = customerBody.activities.find((activity: { oldValue: string; newValue: string }) => (
      activity.oldValue === 'closed' && activity.newValue === 'open'
    ));
    expect(customerReopen.reason).toBeNull();
  });

  it('atama geçmişi agent/admin için görünmeli, müşteriden gizlenmeli', async () => {
    const ticket = await createTicket();
    const claimResponse = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticket.id}/claim`,
      headers: { authorization: `Bearer ${agentToken}` },
    });
    expect(claimResponse.statusCode).toBe(200);

    const adminBody = JSON.parse((await getActivities(ticket.id)).body);
    expect(adminBody.activities.some((activity: { type: string }) => activity.type === 'assignee_changed')).toBe(true);

    const customerBody = JSON.parse((await getActivities(ticket.id, customerToken)).body);
    expect(customerBody.activities.some((activity: { type: string }) => activity.type === 'assignee_changed')).toBe(false);
  });

  it('toplu öncelik değişikliğini structured activity olarak kaydetmeli', async () => {
    const ticket = await createTicket();
    const response = await app.inject({
      method: 'POST',
      url: '/api/tickets/bulk',
      headers: { authorization: `Bearer ${agentToken}` },
      payload: {
        ticketIds: [ticket.id],
        operation: { type: 'priority', priority: 'urgent' },
      },
    });
    expect(response.statusCode).toBe(200);

    const body = JSON.parse((await getActivities(ticket.id)).body);
    expect(body.activities).toContainEqual(expect.objectContaining({
      type: 'priority_changed',
      oldValue: 'normal',
      newValue: 'urgent',
      source: 'bulk',
    }));
  });

  it('pending süresi dolduğunda sistem actorüyle aktivite oluşturmalı', async () => {
    const ticket = await createTicket();
    await changeStatus(ticket.id, agentToken, 'open');
    await changeStatus(ticket.id, agentToken, 'pending', {
      pendingUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      pendingReason: 'Müşteri yanıtı bekleniyor',
    });
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { pendingUntil: new Date(Date.now() - 1000) },
    });

    expect(await reactivatePendingTickets(tenantId)).toBeGreaterThanOrEqual(1);
    const body = JSON.parse((await getActivities(ticket.id)).body);
    expect(body.activities).toContainEqual(expect.objectContaining({
      type: 'status_changed',
      oldValue: 'pending',
      newValue: 'open',
      source: 'system',
      actor: null,
    }));
  });

  it('otomatik kapanmayı sistem aktivitesi olarak kaydetmeli', async () => {
    const ticket = await createTicket();
    await changeStatus(ticket.id, agentToken, 'open');
    await changeStatus(ticket.id, agentToken, 'resolved');
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { lastActivityAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000) },
    });

    expect(await autoCloseResolvedTickets(tenantId)).toBeGreaterThanOrEqual(1);
    const body = JSON.parse((await getActivities(ticket.id)).body);
    expect(body.activities).toContainEqual(expect.objectContaining({
      type: 'status_changed',
      oldValue: 'resolved',
      newValue: 'closed',
      source: 'system',
      actor: null,
    }));
  });

  it('ticket sahibi olmayan müşteri ve farklı tenant geçmişe erişememeli', async () => {
    const ticket = await createTicket();

    expect((await getActivities(ticket.id, secondCustomerToken)).statusCode).toBe(404);
    expect((await getActivities(ticket.id, globexToken)).statusCode).toBe(404);
  });
});
