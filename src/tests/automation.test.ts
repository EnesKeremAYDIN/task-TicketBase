import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fjwt from '@fastify/jwt';
import { authMiddleware } from '../backend/middleware/auth';
import { tenantMiddleware } from '../backend/middleware/tenant';
import { authRoutes } from '../backend/routes/auth';
import { ticketRoutes } from '../backend/routes/ticket';
import { commentRoutes } from '../backend/routes/comment';
import { automationRoutes } from '../backend/routes/automation';
import { AppError } from '../backend/lib/errors';
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
  await app.register(automationRoutes);
  return app;
}

describe('Hazır Yanıtlar ve Makrolar', () => {
  let app: ReturnType<typeof Fastify>;
  let adminToken: string;
  let agentToken: string;
  let customerToken: string;
  let globexAgentToken: string;
  let agentId: string;

  beforeAll(async () => {
    app = await buildApp();
    const [admin, agent, customer, globexAgent] = await Promise.all([
      login('admin@acme.com'),
      login('agent1@acme.com'),
      login('musteri1@acme.com'),
      login('agent1@globex.com'),
    ]);
    adminToken = admin.token;
    agentToken = agent.token;
    customerToken = customer.token;
    globexAgentToken = globexAgent.token;
    agentId = agent.user.id;
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
        title: `Otomasyon testi ${crypto.randomUUID()}`,
        description: 'Hazır yanıt ve makro doğrulaması',
      },
    });
    expect(response.statusCode).toBe(201);
    return JSON.parse(response.body);
  }

  async function createMacro(actions: unknown[], name = `Makro ${crypto.randomUUID()}`) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/macros',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name, actions, isActive: true },
    });
    expect(response.statusCode).toBe(201);
    return JSON.parse(response.body);
  }

  it('müşteri hazır yanıt ve makro listelerine erişememeli', async () => {
    const [responses, macros] = await Promise.all([
      app.inject({
        method: 'GET',
        url: '/api/canned-responses',
        headers: { authorization: `Bearer ${customerToken}` },
      }),
      app.inject({
        method: 'GET',
        url: '/api/macros',
        headers: { authorization: `Bearer ${customerToken}` },
      }),
    ]);
    expect(responses.statusCode).toBe(403);
    expect(macros.statusCode).toBe(403);
  });

  it('admin hazır yanıt oluşturabilmeli, agent yalnızca aktif yanıtı görmeli', async () => {
    const name = `Hazır yanıt ${crypto.randomUUID()}`;
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/canned-responses',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name,
        body: 'Merhaba {{customer.name}}, {{ticket.displayId}} inceleniyor.',
        commentType: 'public_reply',
        isActive: true,
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const created = JSON.parse(createResponse.body);

    const agentList = await app.inject({
      method: 'GET',
      url: '/api/canned-responses',
      headers: { authorization: `Bearer ${agentToken}` },
    });
    expect(JSON.parse(agentList.body).some((response: { id: string }) => response.id === created.id))
      .toBe(true);

    await app.inject({
      method: 'PATCH',
      url: `/api/canned-responses/${created.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { isActive: false },
    });
    const activeList = await app.inject({
      method: 'GET',
      url: '/api/canned-responses',
      headers: { authorization: `Bearer ${agentToken}` },
    });
    expect(JSON.parse(activeList.body).some((response: { id: string }) => response.id === created.id))
      .toBe(false);
  });

  it('desteklenmeyen şablon değişkenini reddetmeli', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/canned-responses',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: `Geçersiz ${crypto.randomUUID()}`,
        body: 'Merhaba {{customer.password}}',
        commentType: 'public_reply',
      },
    });
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toContain('Desteklenmeyen');
  });

  it('hazır yanıt ve makrolar tenantlar arasında görünmemeli', async () => {
    const name = `ACME özel ${crypto.randomUUID()}`;
    await createMacro([{ type: 'priority', priority: 'high' }], name);

    const response = await app.inject({
      method: 'GET',
      url: '/api/macros',
      headers: { authorization: `Bearer ${globexAgentToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).some((macro: { name: string }) => macro.name === name))
      .toBe(false);
  });

  it('makro yorum, öncelik, atama ve pending işlemlerini atomik uygulamalı', async () => {
    const ticket = await createTicket();
    const macro = await createMacro([
      {
        type: 'comment',
        commentType: 'public_reply',
        body: 'Merhaba {{customer.name}}, {{ticket.displayId}} için {{agent.name}} incelemeye başladı.',
      },
      { type: 'priority', priority: 'urgent' },
      { type: 'assign_self' },
      {
        type: 'status',
        status: 'pending',
        reason: 'Müşteriden bilgi bekleniyor',
        pendingOffsetHours: 24,
      },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticket.id}/macros/${macro.id}/apply`,
      headers: { authorization: `Bearer ${agentToken}` },
    });
    expect(response.statusCode).toBe(200);

    const [updated, comments, activities] = await Promise.all([
      prisma.ticket.findUnique({ where: { id: ticket.id } }),
      prisma.comment.findMany({ where: { ticketId: ticket.id } }),
      prisma.ticketActivity.findMany({ where: { ticketId: ticket.id, source: 'macro' } }),
    ]);
    expect(updated?.status).toBe('pending');
    expect(updated?.priority).toBe('urgent');
    expect(updated?.assignedToId).toBe(agentId);
    expect(updated?.pendingUntil).not.toBeNull();
    expect(comments.some((comment) => (
      comment.body.includes(ticket.displayId) && !comment.body.includes('{{')
    ))).toBe(true);
    expect(activities.some((activity) => activity.type === 'macro_applied')).toBe(true);
    expect(activities.some((activity) => activity.type === 'priority_changed')).toBe(true);
    expect(activities.some((activity) => activity.type === 'assignee_changed')).toBe(true);
    expect(activities.some((activity) => activity.type === 'status_changed')).toBe(true);
  });

  it('geçersiz durum geçişinde makronun bütün işlemlerini geri almalı', async () => {
    const ticket = await createTicket();
    const macro = await createMacro([
      {
        type: 'comment',
        commentType: 'internal_note',
        body: 'Bu yorum rollback ile silinmeli',
      },
      {
        type: 'status',
        status: 'pending',
        reason: 'Geçersiz geçiş',
        pendingOffsetHours: 12,
      },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticket.id}/macros/${macro.id}/apply`,
      headers: { authorization: `Bearer ${agentToken}` },
    });
    expect(response.statusCode).toBe(400);

    const [updated, commentCount, macroActivityCount] = await Promise.all([
      prisma.ticket.findUnique({ where: { id: ticket.id } }),
      prisma.comment.count({
        where: { ticketId: ticket.id, body: 'Bu yorum rollback ile silinmeli' },
      }),
      prisma.ticketActivity.count({
        where: { ticketId: ticket.id, type: 'macro_applied' },
      }),
    ]);
    expect(updated?.status).toBe('new');
    expect(commentCount).toBe(0);
    expect(macroActivityCount).toBe(0);
  });

  it('pasif makro uygulanamamalı', async () => {
    const ticket = await createTicket();
    const macro = await createMacro([{ type: 'priority', priority: 'high' }]);
    await app.inject({
      method: 'PATCH',
      url: `/api/macros/${macro.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { isActive: false },
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticket.id}/macros/${macro.id}/apply`,
      headers: { authorization: `Bearer ${agentToken}` },
    });
    expect(response.statusCode).toBe(404);
  });

  it('admin kendime ata makrosunu kullanarak agent yetkisini aşamamalı', async () => {
    const ticket = await createTicket();
    const macro = await createMacro([
      { type: 'assign_self' },
      { type: 'priority', priority: 'high' },
    ]);
    const response = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticket.id}/macros/${macro.id}/apply`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(403);

    const updated = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(updated?.assignedToId).toBeNull();
    expect(updated?.priority).toBe('normal');
  });
});
