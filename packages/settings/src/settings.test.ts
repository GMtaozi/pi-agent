import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  copyFileSync: vi.fn(),
  renameSync: vi.fn(),
}));

import { SettingsService } from '../src/settings';

describe('SettingsService', () => {
  let service: SettingsService;

  beforeEach(() => {
    service = new SettingsService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should get default settings', () => {
    const settings = service.getSettings();
    expect(settings.theme).toBe('dark');
    expect(settings.apiKeys).toEqual({});
  });

  it('should set theme', () => {
    service.setTheme('light');
    const settings = service.getSettings();
    expect(settings.theme).toBe('light');
  });

  it('should set and get API key', () => {
    service.setApiKey('openai', 'sk-test-123');
    const key = service.getApiKey('openai');
    expect(key).toBe('sk-test-123');
  });

  it('should remove API key', () => {
    service.setApiKey('openai', 'sk-test-123');
    const result = service.removeApiKey('openai');
    expect(result).toBe(true);
    expect(service.getApiKey('openai')).toBeUndefined();
  });

  it('should return false when removing non-existent key', () => {
    const result = service.removeApiKey('nonexistent');
    expect(result).toBe(false);
  });

  it('should return false when removing non-existent provider', () => {
    const result = service.removeCustomProvider('nonexistent');
    expect(result).toBe(false);
  });
});
