import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, closeTestServer } from '../test-setup';

describe('Session Tests', () => {
  let server: FastifyInstance;
  let _sessionId: string;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  describe('POST /api/sessions', () => {
    it('should create a session with default model', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/sessions',
        payload: {}
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.session).toBeDefined();
      expect(body.session.id).toBeDefined();
      expect(body.session.model).toBe('default');
      _sessionId = body.session.id;
    });

    it('should create a session with custom model', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/sessions',
        payload: {
          model: 'deepseek'
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.session.model).toBe('deepseek');
    });

    it('should create a session with workspaceId', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/sessions',
        payload: {
          workspaceId: 'default'
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.session.id).toBeDefined();
    });
  });

  describe('POST /api/sessions/:id/prompt', () => {
    it('should return 400 for missing text', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/sessions/test-session-id/prompt',
        payload: {}
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('text is required');
    });

    it('should return 404 for unknown session', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/sessions/nonexistent-session/prompt',
        payload: {
          text: 'Hello'
        }
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Session not found');
    });
  });
});
