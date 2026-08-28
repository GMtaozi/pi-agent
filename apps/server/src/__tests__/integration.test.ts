import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, closeTestServer } from '../test-setup';

describe('Server Integration Tests', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  describe('Health', () => {
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

  describe('Sessions', () => {
    it('should return empty sessions list', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/sessions'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.sessions).toEqual([]);
    });
  });


  describe('Settings', () => {
    it('should return settings', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/settings'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.theme).toBe('dark');
      expect(body.notifications).toBe(true);
    });

    it('should set API key', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/settings/api-keys',
        payload: {
          provider: 'test-provider',
          key: 'test-api-key'
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ok).toBe(true);
    });
  });

  describe('Skills', () => {
    it('should return empty skills list', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/skills'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual([]);
    });

    it('should return 404 for non-existent skill', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/skills/nonexistent'
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Skill not found');
    });
  });

  describe('Governance', () => {
    it('should return empty rules list', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/governance/rules'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual([]);
    });
  });

  describe('Monitoring', () => {
    it('should return metrics summary', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/monitoring/metrics'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('requests');
      expect(body).toHaveProperty('errors');
      expect(body).toHaveProperty('avgResponseTime');
    });

    it('should return empty alerts', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/monitoring/alerts'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual([]);
    });

    it('should return health status', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/monitoring/health'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
    });
  });

  describe('Memory', () => {
    it('should return empty memory entries', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/memory'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.entries).toEqual([]);
    });
  });

  describe('Orchestrator', () => {
    it('should return empty tasks list', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/orchestrator/tasks'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual([]);
    });

    it('should return empty workers list', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/orchestrator/workers'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual([]);
    });
  });

  describe('Workflows', () => {
    it('should return empty workflows list', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/workflows'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual([]);
    });
  });
});
