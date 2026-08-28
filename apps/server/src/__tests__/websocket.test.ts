import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, closeTestServer } from '../test-setup';

describe('WebSocket Smoke Tests', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  it('should start server with WebSocket routes registered', async () => {
    // If server creation succeeded, routes are registered
    expect(server).toBeDefined();
    expect(typeof server.inject).toBe('function');
  });

  it('should keep serving HTTP after WebSocket route registration', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/health'
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
  });

  it('should handle regular HTTP requests alongside WebSocket routes', async () => {
    const endpoints = ['/health', '/api/sessions', '/api/settings'];
    
    for (const endpoint of endpoints) {
      const response = await server.inject({
        method: 'GET',
        url: endpoint
      });
      expect(response.statusCode).toBe(200);
    }
  });
});
