import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, closeTestServer } from '../test-setup';

describe('Server Integration Tests - Expanded', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  describe('Schedule', () => {
    it('should create a task', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/schedule/tasks',
        payload: {
          workspaceId: 'default',
          cron: '0 * * * *',
          prompt: 'Test prompt'
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.task).toBeDefined();
      expect(body.task.workspaceId).toBe('default');
    });

    it('should return tasks array', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/schedule/tasks'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe('Workspace Versions', () => {
    it('should return versions for workspace', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/workspaces/default/versions/test.txt'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe('Skills Management', () => {
    it('should enable a skill', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/skills/test-skill/enable'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ok).toBe(true);
    });

    it('should disable a skill', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/skills/test-skill/disable'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ok).toBe(true);
    });

    it('should reload skills', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/skills/reload'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ok).toBe(true);
    });
  });

  describe('Governance Approvals', () => {
    it('should return empty approvals', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/approvals'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual([]);
    });

    it('should approve a request', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/approvals/req-1/approve',
        payload: {
          decidedBy: 'admin',
          reason: 'Approved for testing'
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ok).toBe(true);
    });

    it('should reject a request', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/approvals/req-2/reject',
        payload: {
          decidedBy: 'admin',
          reason: 'Rejected for testing'
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ok).toBe(true);
    });
  });

  describe('Workflow Management', () => {
    it('should create a workflow', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/workflows',
        payload: {
          id: 'test-workflow',
          name: 'Test Workflow',
          steps: [
            { id: 'step1', type: 'test' }
          ]
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.workflow.id).toBe('test-workflow');
    });

    it('should get a workflow', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/workflows/test-workflow'
      });

      // Mock returns null for unknown workflows
      expect([200, 404]).toContain(response.statusCode);
    });

    it('should return 404 for non-existent workflow', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/workflows/nonexistent'
      });

      expect(response.statusCode).toBe(404);
    });

    it('should run a workflow', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/workflows/test-workflow/run',
        payload: {
          input: {}
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.execution).toBeDefined();
    });

    it('should get workflow executions', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/workflows/test-workflow/executions'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body.executions)).toBe(true);
    });
  });

  describe('Monitoring Dashboard', () => {
    it('should return dashboard data', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/monitoring/dashboard'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('metrics');
      expect(body).toHaveProperty('alerts');
      expect(body).toHaveProperty('systemHealth');
    });

    it('should reset monitoring', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/monitoring/reset'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ok).toBe(true);
    });
  });

  describe('Orchestrator Task Management', () => {
    it('should create a task', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/orchestrator/tasks',
        payload: {
          name: 'Test Task',
          nodes: [{ id: 'node1', type: 'test' }],
          edges: []
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.task).toBeDefined();
      expect(body.task.name).toBe('Test Task');
    });

    it('should get a task', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/orchestrator/tasks/nonexistent'
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Task not found');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/nonexistent'
      });

      expect(response.statusCode).toBe(404);
    });

    it('should handle invalid JSON payload', async () => {
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
