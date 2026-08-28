import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, closeTestServer } from '../test-setup';

describe('Workspace File Tests', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  describe('GET /api/workspaces/:id/preview', () => {
    it('should return 400 for missing path', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/workspaces/default/preview'
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('path is required');
    });

    it('should return file preview for valid path', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/workspaces/default/preview?path=test.txt'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('content');
      expect(body).toHaveProperty('type');
    });

    it('should return HTML content type for HTML files', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/workspaces/default/preview?path=test.html'
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
    });
  });

  describe('GET /api/workspaces/:id/files/content', () => {
    it('should return 400 for missing path', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/workspaces/default/files/content'
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('path is required');
    });

    it('should return file content for valid path', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/workspaces/default/files/content?path=test.txt'
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('mock file content');
    });

    it('should set correct content type for JavaScript files', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/workspaces/default/files/content?path=test.js'
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/javascript');
    });

    it('should set correct content type for JSON files', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/workspaces/default/files/content?path=test.json'
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
    });
  });

  describe('Version management', () => {
    it('should return versions for a file', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/workspaces/default/versions/test.txt'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
    });

    it('should return specific version', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/workspaces/default/versions/test.txt/version-1'
      });

      // Mock returns null, so expect 404
      expect(response.statusCode).toBe(404);
    });

    it('should rollback to a version', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/workspaces/default/versions/test.txt/version-1/rollback'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ok).toBe(true);
    });
  });
});
