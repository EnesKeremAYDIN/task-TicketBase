import { FastifyRequest } from 'fastify';
import { ForbiddenError } from './errors';

export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  role: 'admin' | 'agent' | 'customer';
}

export function getAuthenticatedUser(request: FastifyRequest): AuthenticatedUser {
  const user = request.user as AuthenticatedUser | undefined;

  if (!user || !user.tenantId) {
    throw new ForbiddenError('Oturum bulunamadı');
  }

  return user;
}

export function requireRole(request: FastifyRequest, roles: string[]): AuthenticatedUser {
  const user = getAuthenticatedUser(request);

  if (!roles.includes(user.role)) {
    throw new ForbiddenError();
  }

  return user;
}

export function tenantFilter(tenantId: string): { tenantId: string } {
  return { tenantId };
}
