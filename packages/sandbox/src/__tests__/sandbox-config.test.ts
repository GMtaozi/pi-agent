import { describe, it, expect } from 'vitest';
import { SANDBOX_DEFAULTS, skillSandboxRoot, isPathInsideBase } from '../skill-executor.js';

describe('SANDBOX_DEFAULTS', () => {
  it('exposes sane resource limits', () => {
    expect(SANDBOX_DEFAULTS.timeoutMs).toBeGreaterThan(0);
    expect(SANDBOX_DEFAULTS.memoryLimitMb).toBeGreaterThan(0);
  });
});

describe('skillSandboxRoot', () => {
  it('sanitizes path-hostile segments to prevent directory traversal', () => {
    const root = skillSandboxRoot('../../evil');
    expect(root).not.toContain('..');
    expect(root).toMatch(/skill-sandbox/);
  });

  it('maps to a stable location per skillId', () => {
    expect(skillSandboxRoot('abc')).toBe(skillSandboxRoot('abc'));
    expect(skillSandboxRoot('a')).not.toBe(skillSandboxRoot('b'));
  });

  it('replaces path-hostile characters with underscores', () => {
    // '///' 全部为非法字符 → 逐字符替换为下划线（非空, 不触发 unknown 回退）
    expect(skillSandboxRoot('///')).toContain('___');
  });
});

describe('isPathInsideBase', () => {
  const base = 'C:\\tmp\\sandbox';

  it('accepts the base itself', () => {
    expect(isPathInsideBase(base, base)).toBe(true);
  });

  it('accepts nested paths', () => {
    expect(isPathInsideBase(base + '\\sub\\file.txt', base)).toBe(true);
  });

  it('rejects sibling prefix tricks (base=/a vs /ab)', () => {
    expect(isPathInsideBase('C:\\tmp\\sandbox-evil', base)).toBe(false);
  });

  it('rejects paths outside the base', () => {
    expect(isPathInsideBase('D:\\elsewhere', base)).toBe(false);
  });

  it('handles forward-slash bases', () => {
    expect(isPathInsideBase('/tmp/sandbox/sub', '/tmp/sandbox')).toBe(true);
    expect(isPathInsideBase('/tmp/sandboxeer', '/tmp/sandbox')).toBe(false);
  });
});
