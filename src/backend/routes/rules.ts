import { FastifyInstance } from 'fastify';
import { requireRole } from '../lib/tenant-context';

const OPERATING_RULES = [
  { kural: 'Otomatik kapanma (resolved → closed)', deger: '5 gün hareketsizlik' },
  { kural: 'high önceliğin ilk yanıt hedefi', deger: '4 saat' },
  { kural: 'Mesai saatleri', deger: 'Hafta içi 09:00-18:00' },
  { kural: 'Webhook yeniden deneme penceresi', deger: '24 saat' },
];

export async function rulesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/rules', async (request, _reply) => {
    requireRole(request, ['admin']);
    return { rules: OPERATING_RULES };
  });
}
