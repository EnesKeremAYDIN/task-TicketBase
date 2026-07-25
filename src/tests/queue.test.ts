import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fjwt from '@fastify/jwt';
import bcrypt from 'bcryptjs';
import { authMiddleware } from '../backend/middleware/auth';
import { tenantMiddleware } from '../backend/middleware/tenant';
import { authRoutes } from '../backend/routes/auth';
import { ticketRoutes } from '../backend/routes/ticket';
import { slaRoutes } from '../backend/routes/sla';
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
  await app.register(slaRoutes);

  return app;
}

describe('Dashboard ve ticket kuyrukları', () => {
  const testKey = randomUUID();
  const emailSuffix = `${testKey}@queue.test`;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let tenantId: string;
  let agentOneId: string;
  let agentToken: string;
  let adminToken: string;
  let customerToken: string;
  let myActiveTicketId: string;
  let unassignedTicketId: string;

  beforeAll(async () => {
    app = await buildApp();
    const password = bcrypt.hashSync('123456', 10);
    const tenant = await prisma.tenant.create({
      data: { slug: `queue-${testKey}`, name: 'Queue Test Tenant' },
    });
    tenantId = tenant.id;

    const [admin, agentOne, agentTwo, customer] = await Promise.all([
      prisma.user.create({
        data: {
          tenantId,
          email: `admin-${emailSuffix}`,
          password,
          name: 'Queue Admin',
          role: 'admin',
        },
      }),
      prisma.user.create({
        data: {
          tenantId,
          email: `agent-one-${emailSuffix}`,
          password,
          name: 'Queue Agent One',
          role: 'agent',
        },
      }),
      prisma.user.create({
        data: {
          tenantId,
          email: `agent-two-${emailSuffix}`,
          password,
          name: 'Queue Agent Two',
          role: 'agent',
        },
      }),
      prisma.user.create({
        data: {
          tenantId,
          email: `customer-${emailSuffix}`,
          password,
          name: 'Queue Customer',
          role: 'customer',
        },
      }),
    ]);
    agentOneId = agentOne.id;

    const tickets = await Promise.all([
      prisma.ticket.create({
        data: {
          tenantId,
          number: 1,
          displayId: 'QUEUE-1',
          title: 'Agent one active',
          description: 'My Tickets kaydı',
          status: 'new',
          priority: 'normal',
          customerId: customer.id,
          assignedToId: agentOne.id,
        },
      }),
      prisma.ticket.create({
        data: {
          tenantId,
          number: 2,
          displayId: 'QUEUE-2',
          title: 'Unassigned escalated',
          description: 'Atanmamış ve SLA ihlalli kayıt',
          status: 'open',
          priority: 'high',
          customerId: customer.id,
          firstResponseSlaBreached: true,
          slaBreached: true,
        },
      }),
      prisma.ticket.create({
        data: {
          tenantId,
          number: 3,
          displayId: 'QUEUE-3',
          title: 'Agent two pending',
          description: 'Diğer ajanın aktif kaydı',
          status: 'pending',
          priority: 'urgent',
          customerId: customer.id,
          assignedToId: agentTwo.id,
        },
      }),
      prisma.ticket.create({
        data: {
          tenantId,
          number: 4,
          displayId: 'QUEUE-4',
          title: 'Resolved breached',
          description: 'Aktif kapsam dışında',
          status: 'resolved',
          priority: 'low',
          customerId: customer.id,
          assignedToId: agentOne.id,
          resolutionSlaBreached: true,
          slaBreached: true,
        },
      }),
      prisma.ticket.create({
        data: {
          tenantId,
          number: 5,
          displayId: 'QUEUE-5',
          title: 'Closed breached',
          description: 'Aktif kapsam dışında',
          status: 'closed',
          priority: 'normal',
          customerId: customer.id,
          firstResponseSlaBreached: true,
          resolutionSlaBreached: true,
          slaBreached: true,
        },
      }),
    ]);
    myActiveTicketId = tickets[0].id;
    unassignedTicketId = tickets[1].id;

    async function login(email: string) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email, password: '123456' },
      });
      return JSON.parse(response.body).token as string;
    }

    [adminToken, agentToken, customerToken] = await Promise.all([
      login(admin.email),
      login(agentOne.email),
      login(customer.email),
    ]);
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await app.close();
  });

  it('dashboard yalnızca aktif ticketları sayar', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/sla/dashboard',
      headers: { authorization: `Bearer ${agentToken}` },
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.statusBreakdown).toEqual({ new: 1, open: 1, pending: 1 });
    expect(body.priorityBreakdown).toEqual({ normal: 1, high: 1, urgent: 1 });
    expect(body.activeTotal).toBe(3);
    expect(body.slaBreached).toBe(1);
    expect(body.agentWorkload).toEqual(expect.objectContaining({ [agentOneId]: 1 }));
    expect(body.queueCounts).toEqual({
      myTickets: 1,
      unassignedOpen: 1,
      escalated: 1,
    });
    expect(body.slaBreachBreakdown).toEqual({
      firstResponse: 1,
      resolution: 0,
    });
  });

  it('My Tickets yalnızca ajana atanmış aktif kayıtları getirir', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tickets?queue=my',
      headers: { authorization: `Bearer ${agentToken}` },
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.total).toBe(1);
    expect(body.tickets[0].id).toBe(myActiveTicketId);
  });

  it('Unassigned & Open yalnızca atanmamış aktif kayıtları getirir', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tickets?queue=unassigned',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.total).toBe(1);
    expect(body.tickets[0].id).toBe(unassignedTicketId);
  });

  it('Escalated kuyruğu kapalı ve çözülmüş SLA ihlallerini dışarıda bırakır', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tickets?queue=escalated',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.total).toBe(1);
    expect(body.tickets[0].id).toBe(unassignedTicketId);
  });

  it('kuyruk ile mevcut filtreler birlikte çalışır', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tickets?queue=unassigned&priority=normal',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).total).toBe(0);
  });

  it('eski Atanmamış filtresini kuyruk davranışına dönüştürür', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tickets?assignedToId=unassigned',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.total).toBe(1);
    expect(body.tickets[0].id).toBe(unassignedTicketId);
  });

  it('admin kullanıcının My Tickets kuyruğunu açmasını reddeder', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tickets?queue=my',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(403);
  });

  it('müşterinin destek kuyruğunu açmasını reddeder', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tickets?queue=unassigned',
      headers: { authorization: `Bearer ${customerToken}` },
    });

    expect(response.statusCode).toBe(403);
  });

  it('tanımsız kuyruk değerini reddeder', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tickets?queue=unknown',
      headers: { authorization: `Bearer ${agentToken}` },
    });

    expect(response.statusCode).toBe(400);
  });
});
