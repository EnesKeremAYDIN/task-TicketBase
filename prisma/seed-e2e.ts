import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const E2E_DATABASE_URL = 'file:./e2e.db';

export const E2E_USERS = {
  admin: { email: 'admin@e2e.test', password: '123456', name: 'E2E Admin' },
  agent: { email: 'agent@e2e.test', password: '123456', name: 'E2E Agent' },
  customer: { email: 'customer@e2e.test', password: '123456', name: 'E2E Customer' },
  otherCustomer: {
    email: 'other-customer@e2e.test',
    password: '123456',
    name: 'E2E Other Customer',
  },
} as const;

export const E2E_TICKETS = {
  lifecycle: {
    id: 'e2e-ticket-lifecycle',
    displayId: 'E2E-1',
    title: 'E2E Yaşam Döngüsü',
  },
  agentWorkflow: {
    id: 'e2e-ticket-agent-workflow',
    displayId: 'E2E-2',
    title: 'E2E Agent İş Akışı',
  },
  assigned: {
    id: 'e2e-ticket-assigned',
    displayId: 'E2E-3',
    title: 'E2E Atanmış Ağ Kaydı',
  },
} as const;

export async function seedE2EDatabase() {
  const prisma = new PrismaClient({
    datasources: {
      db: { url: E2E_DATABASE_URL },
    },
  });

  try {
    const password = bcrypt.hashSync(E2E_USERS.admin.password, 10);
    const tenant = await prisma.tenant.create({
      data: {
        id: 'e2e-tenant',
        slug: 'e2e',
        name: 'E2E Tenant',
      },
    });

    await prisma.user.createMany({
      data: [
        {
          id: 'e2e-admin',
          tenantId: tenant.id,
          email: E2E_USERS.admin.email,
          password,
          name: E2E_USERS.admin.name,
          role: 'admin',
        },
        {
          id: 'e2e-agent',
          tenantId: tenant.id,
          email: E2E_USERS.agent.email,
          password,
          name: E2E_USERS.agent.name,
          role: 'agent',
        },
        {
          id: 'e2e-customer',
          tenantId: tenant.id,
          email: E2E_USERS.customer.email,
          password,
          name: E2E_USERS.customer.name,
          role: 'customer',
        },
        {
          id: 'e2e-other-customer',
          tenantId: tenant.id,
          email: E2E_USERS.otherCustomer.email,
          password,
          name: E2E_USERS.otherCustomer.name,
          role: 'customer',
        },
      ],
    });

    await prisma.sLAPolicy.createMany({
      data: [
        { tenantId: tenant.id, priority: 'urgent', firstResponseH: 1, resolutionH: 8 },
        { tenantId: tenant.id, priority: 'high', firstResponseH: 4, resolutionH: 24 },
        {
          tenantId: tenant.id,
          priority: 'normal',
          firstResponseH: 8,
          resolutionH: 3,
          resolutionIsBD: true,
        },
        {
          tenantId: tenant.id,
          priority: 'low',
          firstResponseH: 24,
          resolutionH: 5,
          resolutionIsBD: true,
        },
      ],
    });

    const now = new Date();
    const firstResponseSlaDue = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const slaDueAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    await prisma.ticket.createMany({
      data: [
        {
          id: E2E_TICKETS.lifecycle.id,
          tenantId: tenant.id,
          number: 1,
          displayId: E2E_TICKETS.lifecycle.displayId,
          title: E2E_TICKETS.lifecycle.title,
          description: 'Admin kapatma ve yeniden açma testi',
          status: 'new',
          priority: 'normal',
          category: 'Yazılım',
          customerId: 'e2e-customer',
          firstResponseSlaDue,
          slaDueAt,
          lastActivityAt: now,
        },
        {
          id: E2E_TICKETS.agentWorkflow.id,
          tenantId: tenant.id,
          number: 2,
          displayId: E2E_TICKETS.agentWorkflow.displayId,
          title: E2E_TICKETS.agentWorkflow.title,
          description: 'Agent pending ve makro testi',
          status: 'open',
          priority: 'normal',
          category: 'Donanım',
          customerId: 'e2e-customer',
          firstResponseSlaDue,
          slaDueAt,
          lastActivityAt: now,
        },
        {
          id: E2E_TICKETS.assigned.id,
          tenantId: tenant.id,
          number: 3,
          displayId: E2E_TICKETS.assigned.displayId,
          title: E2E_TICKETS.assigned.title,
          description: 'Kuyruk ve filtre testi',
          status: 'open',
          priority: 'high',
          category: 'Ağ',
          customerId: 'e2e-other-customer',
          assignedToId: 'e2e-agent',
          firstResponseSlaDue,
          slaDueAt,
          lastActivityAt: now,
        },
      ],
    });

    const initialActivities = [
      {
        ticket: E2E_TICKETS.lifecycle,
        actorId: 'e2e-customer',
        status: 'new',
      },
      {
        ticket: E2E_TICKETS.agentWorkflow,
        actorId: 'e2e-customer',
        status: 'open',
      },
      {
        ticket: E2E_TICKETS.assigned,
        actorId: 'e2e-other-customer',
        status: 'open',
      },
    ];

    await prisma.ticketActivity.createMany({
      data: initialActivities.map(({ ticket, actorId, status }) => ({
        tenantId: tenant.id,
        ticketId: ticket.id,
        actorId,
        type: 'ticket_created',
        field: 'status',
        newValue: status,
        source: 'seed',
        visibility: 'public',
        createdAt: now,
      })),
    });

    await prisma.ticketCounter.create({
      data: {
        tenantId: tenant.id,
        lastNumber: 3,
      },
    });

    await prisma.cannedResponse.create({
      data: {
        tenantId: tenant.id,
        name: 'E2E Bilgilendirme',
        body: 'Merhaba {{customer.name}}, kaydınız inceleniyor.',
        commentType: 'public_reply',
        createdById: 'e2e-admin',
      },
    });

    await prisma.ticketMacro.create({
      data: {
        tenantId: tenant.id,
        name: 'E2E Önceliklendir ve Yanıtla',
        description: 'Ticket önceliğini yükseltir ve müşteriye yanıt verir.',
        actions: JSON.stringify([
          {
            type: 'comment',
            commentType: 'public_reply',
            body: 'Merhaba {{customer.name}}, {{ticket.displayId}} öncelikli incelemeye alındı.',
          },
          { type: 'priority', priority: 'high' },
        ]),
        createdById: 'e2e-admin',
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}
