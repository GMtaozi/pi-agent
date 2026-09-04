import { describe, it, expect } from 'vitest';

// Typed alias for patching the global fetch in tests.
const g = globalThis as typeof globalThis & { fetch: unknown };
import { renderHook } from '@testing-library/react';
import { useSettingsApi } from '../hooks/useSettingsApi';

describe('useSettingsApi API paths (P1#6/P1#8)', () => {
  const mockFetch = () => {
    const calls: string[] = [];
    g.fetch = async (url: string) => {
      calls.push(String(url));
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => '',
        headers: new Headers()
      } as Response;
    };
    return calls;
  };

  it('saveApiKey posts to /api/settings/api-keys', async () => {
    const calls = mockFetch();
    const { result } = renderHook(() => useSettingsApi());
    await result.current.saveApiKey('openai', 'sk-test');
    expect(calls).toContain('/api/settings/api-keys');
  });

  it('deleteApiKey deletes /api/settings/api-keys', async () => {
    const calls = mockFetch();
    const { result } = renderHook(() => useSettingsApi());
    await result.current.deleteApiKey('openai');
    expect(calls.some(u => u.startsWith('/api/settings/api-keys'))).toBe(true);
  });
});
