import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, closeTestServer } from '../test-setup';

describe('Health Endpoint', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  it('should return health status', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/health'
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });
});
