import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getAuthenticatedUser } from '../lib/tenant-context';
import { ValidationError } from '../lib/errors';
import { createComment, getTicketComments } from '../services/comment';

const createCommentSchema = z.object({
  type: z.enum(['public_reply', 'internal_note'], { message: 'Geçersiz yorum türü' }),
  body: z.string().min(1, 'Yorum içeriği zorunludur'),
});

export async function commentRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/tickets/:id/comments', async (request, _reply) => {
    const user = getAuthenticatedUser(request);
    const { id } = request.params as { id: string };

    const parsed = createCommentSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0].message);
    }

    const comment = await createComment(id, user.id, user.role, user.tenantId, parsed.data.type, parsed.data.body);
    return comment;
  });

  app.get('/api/tickets/:id/comments', async (request, _reply) => {
    const user = getAuthenticatedUser(request);
    const { id } = request.params as { id: string };

    const comments = await getTicketComments(id, user.tenantId, user.id, user.role);
    return comments;
  });
}
