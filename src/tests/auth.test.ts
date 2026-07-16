import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fjwt from '@fastify/jwt';
import { authMiddleware } from '../backend/middleware/auth';
import { tenantMiddleware } from '../backend/middleware/tenant';
import { authRoutes } from '../backend/routes/auth';
import { AppError } from '../backend/lib/errors';

async function buildApp() {
  const app = Fastify({ logger: false });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ message: error.message });
    }

    const fastifyError = error as { validation?: unknown };
    if (fastifyError.validation) {
      return reply.status(400).send({ message: 'Geçersiz istek' });
    }

    return reply.status(500).send({ message: 'Sunucu hatası' });
  });

  await app.register(cors);
  await app.register(fjwt, {
    secret: 'test-secret',
    sign: { expiresIn: '7d' },
  });

  app.addHook('onRequest', authMiddleware);
  app.addHook('onRequest', tenantMiddleware);

  await app.register(authRoutes);

  return app;
}

describe('Auth - POST /api/auth/login', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('admin kullanıcı ile giriş yapılabilmeli', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'admin@acme.com', password: '123456' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.token).toBeDefined();
    expect(body.user.email).toBe('admin@acme.com');
    expect(body.user.role).toBe('admin');
    expect(body.user.tenant.slug).toBe('acme');
  });

  it('agent kullanıcı ile giriş yapılabilmeli', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'agent1@acme.com', password: '123456' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.user.role).toBe('agent');
  });

  it('müşteri kullanıcı ile giriş yapılabilmeli', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'musteri1@acme.com', password: '123456' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.user.role).toBe('customer');
  });

  it('yanlış şifre ile 401 dönmeli', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'admin@acme.com', password: 'wrong-password' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('var olmayan e-posta ile 401 dönmeli', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nonexistent@mail.com', password: '123456' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('boş şifre ile 400 dönmeli', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'admin@acme.com', password: '' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('geçersiz e-posta formatı ile 400 dönmeli', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'gecersiz-email', password: '123456' },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('Auth Middleware - Token kontrolü', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('token olmadan istek 401 dönmeli', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tickets',
    });

    expect(response.statusCode).toBe(401);
  });

  it('bozuk token ile istek 401 dönmeli', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tickets',
      headers: { authorization: 'Bearer invalid-token-here' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('geçerli token ile middleware geçilmeli', async () => {
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'admin@acme.com', password: '123456' },
    });

    const { token } = JSON.parse(loginResponse.body);

    const response = await app.inject({
      method: 'GET',
      url: '/api/tickets',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(404);
  });
});
