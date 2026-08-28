import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, closeTestServer } from '../test-setup';

describe('Error Validation Tests', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  describe('Settings Validation', () => {
    it('should reject missing provider in API key creation', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/settings/api-keys',
        payload: {
          key: 'test-key'
        }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('provider and key are required');
    });

    it('should reject missing key in API key creation', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/settings/api-keys',
        payload: {
          provider: 'deepseek'
        }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('provider and key are required');
    });

    it('should reject empty body in API key creation', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/settings/api-keys',
        payload: {}
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('provider and key are required');
    });
  });

  describe('Skills Validation', () => {
    it('should return 404 for non-existent skill', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/skills/nonexistent-skill'
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Skill not found');
    });
  });

  describe('Workspace Validation', () => {
    it('should return 404 for non-existent workspace file', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/workspaces/default/nonexistent.txt'
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Not Found');
    });
  });

  describe('Schedule Validation', () => {
    it('should reject task creation without required fields', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/schedule/tasks',
        payload: {
          cron: '0 * * * *'
          // missing workspaceId and prompt
        }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('workspaceId, cron, and prompt are required');
    });

    it('should reject task creation with empty workspaceId', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/schedule/tasks',
        payload: {
          workspaceId: '',
          cron: '0 * * * *',
          prompt: 'Test'
        }
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Workflow Validation', () => {
    it('should reject workflow creation without id', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/workflows',
        payload: {
          name: 'Test',
          steps: []
        }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('id, name, and steps array are required');
    });

    it('should reject workflow creation without name', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/workflows',
        payload: {
          id: 'test',
          steps: []
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject workflow creation without steps', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/workflows',
        payload: {
          id: 'test',
          name: 'Test'
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject workflow creation with non-array steps', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/workflows',
        payload: {
          id: 'test',
          name: 'Test',
          steps: 'not-array'
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 404 for non-existent workflow', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/workflows/nonexistent'
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Workflow not found');
    });
  });

  describe('Orchestrator Validation', () => {
    it('should reject task creation without name', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/orchestrator/tasks',
        payload: {
          nodes: [{ id: 'node1', type: 'test' }]
        }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('name and nodes array are required');
    });

    it('should reject task creation without nodes', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/orchestrator/tasks',
        payload: {
          name: 'Test'
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject task creation with non-array nodes', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/orchestrator/tasks',
        payload: {
          name: 'Test',
          nodes: 'not-array'
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 404 for non-existent task', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/orchestrator/tasks/nonexistent'
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Task not found');
    });
  });

  describe('Memory Validation', () => {
    it('should reject memory entry without text', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/memory',
        payload: {
          tags: ['test']
        }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('text is required');
    });
  });

  describe('Monitoring Validation', () => {
    it('should acknowledge non-existent alert', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/monitoring/alerts/nonexistent/acknowledge'
      });

      // Should not crash
      expect(response.statusCode).toBe(200);
    });
  });

  describe('General Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/unknown/route'
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 404 for unknown POST routes', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/unknown/route',
        payload: {}
      });

      expect(response.statusCode).toBe(404);
    });

    it('should handle invalid JSON body', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/settings/api-keys',
        headers: {
          'content-type': 'application/json'
        },
        payload: 'invalid json'
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
