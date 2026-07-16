import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { processInboundEmail } from '../services/inbound-email';
import { ValidationError } from '../lib/errors';

const inboundSchema = z.object({
  messageId: z.string().min(1, 'messageId zorunludur'),
  tenant: z.string().min(1, 'Tenant zorunludur'),
  from: z.string().email('Geçerli bir e-posta adresi giriniz'),
  subject: z.string().optional(),
  body: z.string().min(1, 'Mesaj içeriği zorunludur'),
});

export async function inboundEmailRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/webhook/inbound-email', async (request, _reply) => {
    const parsed = inboundSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0].message);
    }

    const result = await processInboundEmail(parsed.data);
    return result;
  });
}
