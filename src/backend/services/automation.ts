import type { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { ForbiddenError, NotFoundError, ValidationError } from '../lib/errors';
import type { TicketRole } from '../lib/state-machine';
import {
  parseStoredMacroActions,
  renderTemplate,
  validateTemplateVariables,
  type MacroAction,
} from '../lib/automation';
import {
  calculateTenantSLADeadlineValues,
  isFirstResponseSlaBreached,
  isResolutionSlaBreached,
} from './sla';
import { createCommentInTransaction } from './comment';
import { updateTicketStatusInTransaction } from './ticket';
import { recordTicketActivity } from './ticket-activity';

interface CannedResponseData {
  name: string;
  body: string;
  commentType: 'public_reply' | 'internal_note';
  isActive?: boolean;
}

interface TicketMacroData {
  name: string;
  description?: string;
  actions: MacroAction[];
  isActive?: boolean;
}

export async function listCannedResponses(tenantId: string, includeInactive: boolean) {
  return prisma.cannedResponse.findMany({
    where: {
      tenantId,
      ...(includeInactive ? {} : { isActive: true }),
    },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
}

export async function createCannedResponse(
  tenantId: string,
  actorId: string,
  data: CannedResponseData,
) {
  validateTemplateVariables(data.body);
  await ensureCannedResponseNameAvailable(tenantId, data.name);
  return prisma.cannedResponse.create({
    data: {
      tenantId,
      createdById: actorId,
      name: data.name,
      body: data.body,
      commentType: data.commentType,
      isActive: data.isActive ?? true,
    },
  });
}

export async function updateCannedResponse(
  id: string,
  tenantId: string,
  data: Partial<CannedResponseData>,
) {
  const current = await prisma.cannedResponse.findFirst({ where: { id, tenantId } });
  if (!current) throw new NotFoundError('Hazır yanıt bulunamadı');

  if (data.body !== undefined) validateTemplateVariables(data.body);
  if (data.name !== undefined && data.name !== current.name) {
    await ensureCannedResponseNameAvailable(tenantId, data.name, id);
  }

  return prisma.cannedResponse.update({
    where: { id },
    data,
  });
}

export async function listTicketMacros(tenantId: string, includeInactive: boolean) {
  const macros = await prisma.ticketMacro.findMany({
    where: {
      tenantId,
      ...(includeInactive ? {} : { isActive: true }),
    },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });

  return macros.map((macro) => ({
    ...macro,
    actions: parseStoredMacroActions(macro.actions),
  }));
}

export async function createTicketMacro(
  tenantId: string,
  actorId: string,
  data: TicketMacroData,
) {
  validateMacroTemplates(data.actions);
  await ensureMacroNameAvailable(tenantId, data.name);
  const macro = await prisma.ticketMacro.create({
    data: {
      tenantId,
      createdById: actorId,
      name: data.name,
      description: data.description || null,
      actions: JSON.stringify(data.actions),
      isActive: data.isActive ?? true,
    },
  });

  return { ...macro, actions: data.actions };
}

export async function updateTicketMacro(
  id: string,
  tenantId: string,
  data: Partial<TicketMacroData>,
) {
  const current = await prisma.ticketMacro.findFirst({ where: { id, tenantId } });
  if (!current) throw new NotFoundError('Makro bulunamadı');

  if (data.actions) validateMacroTemplates(data.actions);
  if (data.name !== undefined && data.name !== current.name) {
    await ensureMacroNameAvailable(tenantId, data.name, id);
  }

  const macro = await prisma.ticketMacro.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description === undefined ? undefined : data.description || null,
      actions: data.actions ? JSON.stringify(data.actions) : undefined,
      isActive: data.isActive,
    },
  });

  return {
    ...macro,
    actions: data.actions || parseStoredMacroActions(macro.actions),
  };
}

export async function applyTicketMacro(
  ticketId: string,
  macroId: string,
  tenantId: string,
  actorId: string,
  actorRole: Exclude<TicketRole, 'customer'>,
) {
  return prisma.$transaction(async (tx) => {
    const [macro, actor] = await Promise.all([
      tx.ticketMacro.findFirst({
        where: { id: macroId, tenantId, isActive: true },
      }),
      tx.user.findFirst({
        where: { id: actorId, tenantId, role: actorRole },
        select: { id: true, name: true },
      }),
    ]);

    if (!macro) throw new NotFoundError('Makro bulunamadı');
    if (!actor) throw new ForbiddenError();

    const actions = parseStoredMacroActions(macro.actions);
    let ticket = await getMacroTicket(tx, ticketId, tenantId);
    const statusAction = actions.find((action) => action.type === 'status');
    let statusApplied = false;

    if (
      statusAction?.type === 'status'
      && statusAction.status === 'open'
      && ['resolved', 'closed'].includes(ticket.status)
    ) {
      await applyStatusAction(
        tx,
        ticketId,
        tenantId,
        actorId,
        actorRole,
        statusAction,
      );
      statusApplied = true;
      ticket = await getMacroTicket(tx, ticketId, tenantId);
    }

    for (const action of actions) {
      if (action.type === 'comment') {
        const body = renderTemplate(action.body, {
          customerName: ticket.customer.name,
          ticketDisplayId: ticket.displayId,
          ticketTitle: ticket.title,
          agentName: actor.name,
        });
        await createCommentInTransaction(
          tx,
          ticketId,
          actorId,
          actorRole,
          tenantId,
          action.commentType,
          body,
          'macro',
        );
      } else if (action.type === 'priority') {
        await updatePriorityInTransaction(
          tx,
          ticketId,
          tenantId,
          action.priority,
          actorId,
        );
      } else if (action.type === 'assign_self') {
        await assignToSelfInTransaction(tx, ticketId, tenantId, actorId, actorRole, actor.name);
      }

      ticket = await getMacroTicket(tx, ticketId, tenantId);
    }

    if (statusAction?.type === 'status' && !statusApplied && ticket.status !== statusAction.status) {
      await applyStatusAction(
        tx,
        ticketId,
        tenantId,
        actorId,
        actorRole,
        statusAction,
      );
    }

    await recordTicketActivity(tx, {
      tenantId,
      ticketId,
      actorId,
      type: 'macro_applied',
      field: 'macroId',
      newValue: macro.id,
      newLabel: macro.name,
      source: 'macro',
      visibility: 'internal',
    });

    return getMacroTicket(tx, ticketId, tenantId);
  });
}

async function applyStatusAction(
  tx: Prisma.TransactionClient,
  ticketId: string,
  tenantId: string,
  actorId: string,
  actorRole: Exclude<TicketRole, 'customer'>,
  action: Extract<MacroAction, { type: 'status' }>,
) {
  const pendingUntil = action.status === 'pending' && action.pendingOffsetHours
    ? new Date(Date.now() + action.pendingOffsetHours * 60 * 60 * 1000)
    : undefined;

  return updateTicketStatusInTransaction(
    tx,
    ticketId,
    tenantId,
    action.status,
    actorId,
    actorRole,
    {
      pendingUntil,
      pendingReason: action.reason,
      reason: action.reason,
      source: 'macro',
    },
  );
}

async function updatePriorityInTransaction(
  tx: Prisma.TransactionClient,
  ticketId: string,
  tenantId: string,
  priority: 'low' | 'normal' | 'high' | 'urgent',
  actorId: string,
) {
  const ticket = await tx.ticket.findFirst({ where: { id: ticketId, tenantId } });
  if (!ticket) throw new NotFoundError('Ticket bulunamadı');
  if (ticket.priority === priority) return;

  const now = new Date();
  const deadlines = await calculateTenantSLADeadlineValues(
    tenantId,
    priority,
    ticket.createdAt,
    tx,
  );
  if (!deadlines) throw new ValidationError('Bu öncelik için SLA politikası bulunamadı');

  const firstResponseReference = ticket.firstResponseAt || now;
  const resolutionReference = ['resolved', 'closed'].includes(ticket.status)
    ? ticket.resolvedAt || now
    : now;
  const firstResponseSlaBreached = ticket.firstResponseSlaBreached
    || isFirstResponseSlaBreached(firstResponseReference, deadlines.firstResponseSlaDue);
  const resolutionSlaBreached = ticket.resolutionSlaBreached
    || isResolutionSlaBreached(resolutionReference, deadlines.slaDueAt);

  const result = await tx.ticket.updateMany({
    where: { id: ticketId, tenantId, priority: ticket.priority },
    data: {
      priority,
      ...deadlines,
      firstResponseSlaBreached,
      resolutionSlaBreached,
      slaBreached: firstResponseSlaBreached || resolutionSlaBreached,
      lastActivityAt: now,
    },
  });
  if (result.count === 0) {
    throw new ValidationError('Ticket önceliği değişti, işlem tekrar denenmeli');
  }

  await recordTicketActivity(tx, {
    tenantId,
    ticketId,
    actorId,
    type: 'priority_changed',
    field: 'priority',
    oldValue: ticket.priority,
    newValue: priority,
    source: 'macro',
    visibility: 'internal',
    createdAt: now,
  });
}

async function assignToSelfInTransaction(
  tx: Prisma.TransactionClient,
  ticketId: string,
  tenantId: string,
  actorId: string,
  actorRole: Exclude<TicketRole, 'customer'>,
  actorName: string,
) {
  if (actorRole !== 'agent') {
    throw new ForbiddenError('Kendime ata işlemi yalnızca ajanlar tarafından kullanılabilir');
  }

  const ticket = await tx.ticket.findFirst({ where: { id: ticketId, tenantId } });
  if (!ticket) throw new NotFoundError('Ticket bulunamadı');
  if (ticket.assignedToId === actorId) return;
  if (ticket.assignedToId) {
    throw new ValidationError('Ticket başka bir ajana atanmış');
  }

  const now = new Date();
  const result = await tx.ticket.updateMany({
    where: {
      id: ticketId,
      tenantId,
      assignedToId: null,
      status: { in: ['new', 'open', 'pending'] },
    },
    data: { assignedToId: actorId, lastActivityAt: now },
  });
  if (result.count === 0) {
    throw new ValidationError('Bu ticket üstlenmeye uygun değil');
  }

  await recordTicketActivity(tx, {
    tenantId,
    ticketId,
    actorId,
    type: 'assignee_changed',
    field: 'assignedToId',
    oldValue: null,
    newValue: actorId,
    oldLabel: 'Atanmamış',
    newLabel: actorName,
    source: 'macro',
    visibility: 'internal',
    createdAt: now,
  });
}

async function getMacroTicket(
  tx: Prisma.TransactionClient,
  ticketId: string,
  tenantId: string,
) {
  const ticket = await tx.ticket.findFirst({
    where: { id: ticketId, tenantId },
    include: {
      customer: { select: { id: true, name: true, email: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  });
  if (!ticket) throw new NotFoundError('Ticket bulunamadı');
  return ticket;
}

function validateMacroTemplates(actions: MacroAction[]) {
  actions.forEach((action) => {
    if (action.type === 'comment') validateTemplateVariables(action.body);
  });
}

async function ensureCannedResponseNameAvailable(
  tenantId: string,
  name: string,
  excludedId?: string,
) {
  const duplicate = await prisma.cannedResponse.findFirst({
    where: {
      tenantId,
      name,
      ...(excludedId ? { id: { not: excludedId } } : {}),
    },
    select: { id: true },
  });
  if (duplicate) throw new ValidationError('Bu isimde bir hazır yanıt zaten var');
}

async function ensureMacroNameAvailable(
  tenantId: string,
  name: string,
  excludedId?: string,
) {
  const duplicate = await prisma.ticketMacro.findFirst({
    where: {
      tenantId,
      name,
      ...(excludedId ? { id: { not: excludedId } } : {}),
    },
    select: { id: true },
  });
  if (duplicate) throw new ValidationError('Bu isimde bir makro zaten var');
}
