import { describe, it, expect } from 'vitest';
import { ModelRuntime } from '../model-runtime.js';

describe('ModelRuntime (smoke)', () => {
  it('constructs with an empty provider list', () => {
    const rt = new ModelRuntime({ providers: [], mockFallback: true });
    expect(rt).toBeDefined();
    expect(rt.config.providers).toEqual([]);
  });

  it('initializes without providers and without throwing', async () => {
    const rt = new ModelRuntime({ providers: [], mockFallback: true });
    await expect(rt.initialize()).resolves.toBeUndefined();
  });

  it('is idempotent on repeated initialize calls', async () => {
    const rt = new ModelRuntime({ providers: [], mockFallback: true });
    await rt.initialize();
    await expect(rt.initialize()).resolves.toBeUndefined();
  });
});
