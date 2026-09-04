import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, closeTestServer } from '../test-setup';

describe('Security headers & CORS (P1#9/#10)', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  it('response includes X-Content-Type-Options: nosniff', async () => {
    const response = await server.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('response includes X-Frame-Options security header', async () => {
    const response = await server.inject({ method: 'GET', url: '/health' });
    expect(response.headers['x-frame-options']).toBeDefined();
  });

  it('non-whitelisted origin is not allowed (no CORS header)', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/sessions',
      headers: { origin: 'https://evil.example.com' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('whitelisted origin is allowed (CORS header present)', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/sessions',
      headers: { origin: 'http://localhost:5173' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});
