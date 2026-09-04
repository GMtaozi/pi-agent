import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, closeTestServer } from '../test-setup';

describe('Full Route Coverage Tests', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  describe('Schedule Task Actions', () => {
    it('POST /api/schedule/tasks/:id/run should return ok', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/schedule/tasks/task-1/run'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ok).toBe(true);
    });

    it('POST /api/schedule/tasks/:id/cancel should return ok', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/schedule/tasks/task-1/cancel'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ok).toBe(true);
    });

    it('DELETE /api/schedule/tasks/:id should return ok', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: '/api/schedule/tasks/task-1'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ok).toBe(true);
    });
  });

  describe('Audit Logs', () => {
    it('GET /api/audit/logs should return array', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/audit/logs'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
    });

    it('GET /api/audit/logs?action=test should return array', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/audit/logs?action=test'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
    });

    it('GET /api/audit/logs?limit=10 should return array', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/audit/logs?limit=10'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe('Orchestrator Task Actions', () => {
    it('POST /api/orchestrator/tasks/:id/run should return result', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/orchestrator/tasks/task-1/run'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.result).toBeDefined();
    });

    it('POST /api/orchestrator/tasks/:id/cancel should return ok', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/orchestrator/tasks/task-1/cancel'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ok).toBe(true);
    });
  });

  describe('Workflow Execution Actions', () => {
    it('GET /api/workflow/executions/:id should return 404 for unknown', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/workflow/executions/unknown-exec'
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Execution not found');
    });

    it('POST /api/workflow/executions/:id/cancel should return 404 for unknown', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/workflow/executions/unknown-exec/cancel'
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Execution not found or not running');
    });
  });

  describe('Memory Entry Creation', () => {
    it('POST /api/memory should create entry', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/memory',
        payload: {
          text: 'Test memory entry',
          tags: ['test']
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.entry).toBeDefined();
      expect(body.entry.text).toBe('Test memory entry');
    });

    it('POST /api/memory should reject empty text', async () => {
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

  describe('Monitoring Logs', () => {
    it('GET /api/monitoring/logs should return array', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/monitoring/logs'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
    });

    it('GET /api/monitoring/logs?level=info should return array', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/monitoring/logs?level=info'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
    });

    it('GET /api/monitoring/logs/search?q=test should return array', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/monitoring/logs/search?q=test'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
    });

    it('GET /api/monitoring/logs/search should return 400 for missing q', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/monitoring/logs/search'
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Query parameter q is required');
    });
  });
});
