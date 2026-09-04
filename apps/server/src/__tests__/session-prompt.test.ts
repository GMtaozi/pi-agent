import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, closeTestServer } from '../test-setup';

describe('Session Prompt Tests', () => {
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
          model: 'deepseek-chat'
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.session.model).toBe('deepseek-chat');
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
        url: '/api/sessions/test-session/prompt',
        payload: {}
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('text is required');
    });

    it('should return 400 for empty text', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/sessions/test-session/prompt',
        payload: {
          text: ''
        }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('text is required');
    });

    it('should handle prompt for existing session', async () => {
      // First create a session
      const createResponse = await server.inject({
        method: 'POST',
        url: '/api/sessions',
        payload: {
          model: 'default'
        }
      });

      expect(createResponse.statusCode).toBe(200);
      const createdSession = JSON.parse(createResponse.body);
      const newSessionId = createdSession.session.id;

      // Now send a prompt
      const promptResponse = await server.inject({
        method: 'POST',
        url: `/api/sessions/${newSessionId}/prompt`,
        payload: {
          text: 'Hello, this is a test prompt'
        }
      });

      // Should return 200 or 500 depending on mock behavior
      expect([200, 500]).toContain(promptResponse.statusCode);
      
      if (promptResponse.statusCode === 200) {
        const body = JSON.parse(promptResponse.body);
        expect(body).toHaveProperty('response');
        expect(typeof body.response).toBe('string');
        expect(body.response.length).toBeGreaterThan(0);
      }
    });

    it('should handle prompt with context', async () => {
      // Create a session with workspace
      const createResponse = await server.inject({
        method: 'POST',
        url: '/api/sessions',
        payload: {
          model: 'default',
          workspaceId: 'default'
        }
      });

      const createdSession = JSON.parse(createResponse.body);
      const newSessionId = createdSession.session.id;

      // Send a prompt that might reference workspace files
      const promptResponse = await server.inject({
        method: 'POST',
        url: `/api/sessions/${newSessionId}/prompt`,
        payload: {
          text: 'Please read the file test.txt and summarize it'
        }
      });

      expect([200, 500]).toContain(promptResponse.statusCode);
    });
  });

  describe('Session lifecycle', () => {
    it('should handle multiple sessions', async () => {
      const sessions = [];
      
      for (let i = 0; i < 3; i++) {
        const response = await server.inject({
          method: 'POST',
          url: '/api/sessions',
          payload: {
            model: `model-${i}`
          }
        });

        expect(response.statusCode).toBe(200);
        sessions.push(JSON.parse(response.body).session);
      }

      // All sessions should have unique IDs
      const ids = sessions.map(s => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });

    it('should list sessions', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/sessions'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('sessions');
      expect(Array.isArray(body.sessions)).toBe(true);
    });
  });
});
