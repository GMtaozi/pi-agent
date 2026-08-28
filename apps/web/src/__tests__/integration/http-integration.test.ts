import { describe, it, expect } from 'vitest';

// These tests require a running server at http://localhost:3001
// Run server separately: cd apps/server && npx tsx src/index.ts

describe('HTTP Integration Tests (requires running server)', () => {
  const BASE_URL = 'http://localhost:3001';
  async function request(method: string, path: string, body?: unknown) {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return response;
  }

  it('GET /api/health should return ok', async () => {
    const response = await request('GET', '/api/health');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  it('POST /api/sessions should create session', async () => {
    const response = await request('POST', '/api/sessions', {});
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.session).toBeDefined();
    expect(body.session.id).toBeDefined();
  });

  it('GET /api/sessions should list sessions', async () => {
    const response = await request('GET', '/api/sessions');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.sessions).toBeDefined();
  });


  it('GET /api/settings should return settings', async () => {
    const response = await request('GET', '/api/settings');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.settings).toBeDefined();
  });

  it('GET /api/workspaces/default/files should return files', async () => {
    const response = await request('GET', '/api/workspaces/default/files');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.files).toBeDefined();
  });

  it('GET /api/skills should return skills', async () => {
    const response = await request('GET', '/api/skills');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.skills).toBeDefined();
  });

  it('GET /api/monitoring/dashboard should return metrics', async () => {
    const response = await request('GET', '/api/monitoring/dashboard');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.metrics).toBeDefined();
  });

  it('POST /api/sessions/test/prompt with missing text should return 400', async () => {
    const response = await request('POST', '/api/sessions/test/prompt', {});
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('text is required');
  });

  it('POST /api/memory should create entry', async () => {
    const response = await request('POST', '/api/memory', {
      text: 'Integration test entry',
      tags: ['integration']
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.entry).toBeDefined();
    expect(body.entry.text).toBe('Integration test entry');
  });

  it('GET /api/audit/logs should return array', async () => {
    const response = await request('GET', '/api/audit/logs');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
