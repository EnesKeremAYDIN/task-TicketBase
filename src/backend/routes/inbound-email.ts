import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { processInboundEmail } from '../services/inbound-email';
import { ValidationError, ForbiddenError } from '../lib/errors';

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'ticketbase-webhook-secret';

const inboundSchema = z.object({
  messageId: z.string().min(1),
  tenant: z.string().min(1),
  from: z.string().email(),
  subject: z.string().optional(),
  body: z.string().min(1).max(50000),
});

export async function inboundEmailRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/webhook/inbound-email', async (request, _reply) => {
    const secret = request.headers['x-webhook-secret'];
    if (secret !== WEBHOOK_SECRET) {
      throw new ForbiddenError('Geçersiz webhook secret');
    }

    const parsed = inboundSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0].message);
    }

    const result = await processInboundEmail(parsed.data);
    return result;
  });
}
