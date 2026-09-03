import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SkillRegistry } from '../src/skill-registry';
import type { SkillManifest } from '../src/skill-registry';

const sampleManifest: SkillManifest = {
  id: 'test-skill',
  name: 'Test Skill',
  version: '1.0.0',
  description: 'A test skill',
  capabilities: ['read', 'write'],
  tools: ['file-read'],
};

describe('SkillRegistry', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  it('should register skill', () => {
    registry.register({
      manifest: sampleManifest,
      config: { enabled: true },
      loadedAt: new Date().toISOString(),
    });

    expect(registry.list()).toHaveLength(1);
    expect(registry.get('test-skill')).toBeDefined();
  });

  it('should unregister skill', () => {
    registry.register({
      manifest: sampleManifest,
      config: { enabled: true },
      loadedAt: new Date().toISOString(),
    });

    registry.unregister('test-skill');
    expect(registry.list()).toHaveLength(0);
  });

  it('should list enabled skills', () => {
    registry.register({
      manifest: sampleManifest,
      config: { enabled: true },
      loadedAt: new Date().toISOString(),
    });
    registry.register({
      manifest: { ...sampleManifest, id: 'disabled-skill', name: 'Disabled' },
      config: { enabled: false },
      loadedAt: new Date().toISOString(),
    });

    expect(registry.listEnabled()).toHaveLength(1);
  });

  it('should enable/disable skill', () => {
    registry.register({
      manifest: sampleManifest,
      config: { enabled: false },
      loadedAt: new Date().toISOString(),
    });

    registry.enable('test-skill');
    expect(registry.get('test-skill')?.config.enabled).toBe(true);

    registry.disable('test-skill');
    expect(registry.get('test-skill')?.config.enabled).toBe(false);
  });
});
