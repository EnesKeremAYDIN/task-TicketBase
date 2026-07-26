import { z } from 'zod';
import { ValidationError } from './errors';

export const COMMENT_TYPES = ['public_reply', 'internal_note'] as const;
export const MACRO_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const MACRO_STATUSES = ['open', 'pending', 'resolved', 'closed'] as const;

export const cannedResponseDataSchema = z.object({
  name: z.string().trim().min(1, 'Hazır yanıt adı zorunludur').max(120),
  body: z.string().trim().min(1, 'Hazır yanıt metni zorunludur').max(10000),
  commentType: z.enum(COMMENT_TYPES),
  isActive: z.boolean().optional(),
});

export const macroActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('comment'),
    commentType: z.enum(COMMENT_TYPES),
    body: z.string().trim().min(1, 'Makro yorum metni zorunludur').max(10000),
  }),
  z.object({
    type: z.literal('status'),
    status: z.enum(MACRO_STATUSES),
    reason: z.string().trim().max(1000).optional(),
    pendingOffsetHours: z.number().int().min(1).max(720).optional(),
  }),
  z.object({
    type: z.literal('priority'),
    priority: z.enum(MACRO_PRIORITIES),
  }),
  z.object({
    type: z.literal('assign_self'),
  }),
]);

export const macroActionsSchema = z.array(macroActionSchema)
  .min(1, 'Makro en az bir işlem içermelidir')
  .max(4, 'Makro en fazla dört işlem içerebilir')
  .superRefine((actions, ctx) => {
    const actionTypes = actions.map((action) => action.type);
    if (new Set(actionTypes).size !== actionTypes.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Aynı makro işlem türü birden fazla kez kullanılamaz',
      });
    }

    const statusAction = actions.find((action) => action.type === 'status');
    if (statusAction?.type === 'status' && statusAction.status === 'pending') {
      if (!statusAction.reason?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Pending makrosu için neden zorunludur',
          path: [actionTypes.indexOf('status'), 'reason'],
        });
      }
      if (!statusAction.pendingOffsetHours) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Pending makrosu için bekleme süresi zorunludur',
          path: [actionTypes.indexOf('status'), 'pendingOffsetHours'],
        });
      }
    }
  });

export const ticketMacroDataSchema = z.object({
  name: z.string().trim().min(1, 'Makro adı zorunludur').max(120),
  description: z.string().trim().max(500).optional(),
  actions: macroActionsSchema,
  isActive: z.boolean().optional(),
});

export type MacroAction = z.infer<typeof macroActionSchema>;

const ALLOWED_TEMPLATE_VARIABLES = new Set([
  'customer.name',
  'ticket.displayId',
  'ticket.title',
  'agent.name',
]);

export function validateTemplateVariables(template: string) {
  const matches = template.matchAll(/{{\s*([^{}]+?)\s*}}/g);
  for (const match of matches) {
    const variable = match[1].trim();
    if (!ALLOWED_TEMPLATE_VARIABLES.has(variable)) {
      throw new ValidationError(`Desteklenmeyen şablon değişkeni: ${variable}`);
    }
  }
}

export function renderTemplate(
  template: string,
  values: {
    customerName: string;
    ticketDisplayId: string;
    ticketTitle: string;
    agentName: string;
  },
) {
  const replacements: Record<string, string> = {
    'customer.name': values.customerName,
    'ticket.displayId': values.ticketDisplayId,
    'ticket.title': values.ticketTitle,
    'agent.name': values.agentName,
  };

  validateTemplateVariables(template);
  return template.replace(/{{\s*([^{}]+?)\s*}}/g, (_match, key: string) => (
    replacements[key.trim()] || ''
  ));
}

export function parseStoredMacroActions(actions: string): MacroAction[] {
  try {
    const parsed = macroActionsSchema.safeParse(JSON.parse(actions));
    if (!parsed.success) throw new Error(parsed.error.errors[0].message);
    return parsed.data;
  } catch {
    throw new ValidationError('Makro işlem tanımı geçersiz');
  }
}
