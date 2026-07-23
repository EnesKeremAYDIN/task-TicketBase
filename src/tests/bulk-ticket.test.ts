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

describe('Bulk Ticket İşlemleri', () => {
  let app: ReturnType<typeof Fastify>;
  let customerToken: string;
  let agentToken: string;
  let secondAgentId: string;
  let adminToken: string;
  let agentId: string;
  let globexCustomerToken: string;

  beforeAll(async () => {
    app = await buildApp();
    const logins = await Promise.all([
      login('musteri1@acme.com'),
      login('agent1@acme.com'),
      login('agent2@acme.com'),
      login('admin@acme.com'),
      login('musteri1@globex.com'),
    ]);

    customerToken = logins[0].token;
    agentToken = logins[1].token;
    agentId = logins[1].user.id;
    secondAgentId = logins[2].user.id;
    adminToken = logins[3].token;
    globexCustomerToken = logins[4].token;
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
    return JSON.parse(response.body);
  }

  async function createTicket(token = customerToken) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: `Bulk test ${crypto.randomUUID()}`,
        description: 'Toplu işlem testi',
      },
    });
    expect(response.statusCode).toBe(201);
    return JSON.parse(response.body);
  }

  async function bulk(token: string, ticketIds: string[], operation: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: '/api/tickets/bulk',
      headers: { authorization: `Bearer ${token}` },
      payload: { ticketIds, operation },
    });
  }

  it('müşteri bulk endpointine erişememeli', async () => {
    const ticket = await createTicket();
    const response = await bulk(customerToken, [ticket.id], {
      type: 'priority',
      priority: 'high',
    });
    expect(response.statusCode).toBe(403);
  });

  it('agent toplu durum değiştirirken state machine kurallarına uymalı', async () => {
    const first = await createTicket();
    const second = await createTicket();

    expect((await bulk(agentToken, [first.id, second.id], {
      type: 'status',
      status: 'open',
    })).statusCode).toBe(200);
    expect((await bulk(agentToken, [first.id, second.id], {
      type: 'status',
      status: 'resolved',
    })).statusCode).toBe(200);

    await app.inject({
      method: 'PATCH',
      url: `/api/tickets/${first.id}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'closed' },
    });

    const response = await bulk(agentToken, [first.id, second.id], {
      type: 'status',
      status: 'open',
    });
    const body = JSON.parse(response.body);

    expect(body.succeeded).toHaveLength(1);
    expect(body.succeeded[0].ticketId).toBe(second.id);
    expect(body.failed).toHaveLength(1);
    expect(body.failed[0].ticketId).toBe(first.id);
  });

  it('pending bulk işlemi için tarih ve neden zorunlu olmalı', async () => {
    const ticket = await createTicket();
    const response = await bulk(agentToken, [ticket.id], {
      type: 'status',
      status: 'pending',
    });
    expect(response.statusCode).toBe(400);
  });

  it('agent ticket önceliklerini topluca değiştirebilmeli ve SLA yeniden hesaplanmalı', async () => {
    const first = await createTicket();
    const second = await createTicket();

    const response = await bulk(agentToken, [first.id, second.id], {
      type: 'priority',
      priority: 'urgent',
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).succeeded).toHaveLength(2);

    const updated = await prisma.ticket.findMany({
      where: { id: { in: [first.id, second.id] } },
    });
    expect(updated.every((ticket) => ticket.priority === 'urgent')).toBe(true);
    expect(updated.every((ticket) => ticket.firstResponseSlaDue && ticket.slaDueAt)).toBe(true);

    const auditNotes = await prisma.comment.count({
      where: {
        ticketId: { in: [first.id, second.id] },
        type: 'internal_note',
        body: { contains: 'Toplu işlem: Öncelik' },
      },
    });
    expect(auditNotes).toBe(2);
  });

  it('agent yalnızca atanmamış ticketları kendine alabilmeli', async () => {
    const unassigned = await createTicket();
    const assigned = await createTicket();
    await app.inject({
      method: 'POST',
      url: `/api/tickets/${assigned.id}/assign`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { agentId: secondAgentId },
    });

    const response = await bulk(agentToken, [unassigned.id, assigned.id], {
      type: 'assign',
      agentId,
    });
    const body = JSON.parse(response.body);

    expect(body.succeeded).toHaveLength(1);
    expect(body.succeeded[0].ticketId).toBe(unassigned.id);
    expect(body.failed).toHaveLength(1);
    expect(body.failed[0].ticketId).toBe(assigned.id);
  });

  it('agent başka bir ajana toplu atama yapamamalı', async () => {
    const ticket = await createTicket();
    const response = await bulk(agentToken, [ticket.id], {
      type: 'assign',
      agentId: secondAgentId,
    });
    expect(response.statusCode).toBe(403);
  });

  it('admin toplu ajan ataması yapabilmeli ve atamayı kaldırabilmeli', async () => {
    const first = await createTicket();
    const second = await createTicket();

    const assignResponse = await bulk(adminToken, [first.id, second.id], {
      type: 'assign',
      agentId: secondAgentId,
    });
    expect(JSON.parse(assignResponse.body).succeeded).toHaveLength(2);

    const unassignResponse = await bulk(adminToken, [first.id, second.id], {
      type: 'assign',
      agentId: null,
    });
    expect(JSON.parse(unassignResponse.body).succeeded).toHaveLength(2);

    const updated = await prisma.ticket.findMany({
      where: { id: { in: [first.id, second.id] } },
    });
    expect(updated.every((ticket) => ticket.assignedToId === null)).toBe(true);
  });

  it('başka tenant ticketı değiştirilmemeli ve başarısız olarak dönmeli', async () => {
    const acmeTicket = await createTicket();
    const globexTicket = await createTicket(globexCustomerToken);

    const response = await bulk(agentToken, [acmeTicket.id, globexTicket.id], {
      type: 'priority',
      priority: 'high',
    });
    const body = JSON.parse(response.body);

    expect(body.succeeded).toHaveLength(1);
    expect(body.succeeded[0].ticketId).toBe(acmeTicket.id);
    expect(body.failed).toHaveLength(1);
    expect(body.failed[0].reason).toBe('Ticket bulunamadı');

    const untouched = await prisma.ticket.findUnique({ where: { id: globexTicket.id } });
    expect(untouched?.priority).toBe('normal');
  });

  it('tek istekte 100 adetten fazla ticket kabul edilmemeli', async () => {
    const response = await bulk(agentToken, Array.from({ length: 101 }, (_, index) => `ticket-${index}`), {
      type: 'priority',
      priority: 'high',
    });
    expect(response.statusCode).toBe(400);
  });
});
