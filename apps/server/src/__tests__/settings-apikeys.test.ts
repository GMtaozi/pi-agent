import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, closeTestServer } from '../test-setup';

describe('Settings API Keys (P1#6)', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  it('POST /api/settings/api-keys returns 200', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/settings/api-keys',
      payload: { provider: 'test-provider', key: 'sk-test' }
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.ok).toBe(true);
  });

  it('DELETE /api/settings/api-keys returns 200', async () => {
    const response = await server.inject({
      method: 'DELETE',
      url: '/api/settings/api-keys?provider=test-provider'
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.ok).toBe(true);
  });

  it('POST without key returns 400', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/settings/api-keys',
      payload: { provider: 'test-provider' }
    });
    expect(response.statusCode).toBe(400);
  });

  it('POST /api/settings/theme returns 200 for dark', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/settings/theme',
      payload: { theme: 'dark' }
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.ok).toBe(true);
    expect(body.theme).toBe('dark');
  });

  it('POST /api/settings/theme returns 400 for invalid theme', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/settings/theme',
      payload: { theme: 'blue' }
    });
    expect(response.statusCode).toBe(400);
  });

  it('DELETE with empty body and JSON content-type returns 200', async () => {
    // 浏览器 fetch 会携带 Content-Type: application/json 且无 body，
    // 服务端宽容解析器应将其按空对象处理而非 FST_ERR_CTP_EMPTY_JSON_BODY 400
    const response = await server.inject({
      method: 'DELETE',
      url: '/api/settings/api-keys?provider=empty-body-provider',
      headers: { 'content-type': 'application/json' }
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.ok).toBe(true);
  });
});
