import { join } from 'path';
import { tmpdir } from 'os';

export const SANDBOX_DEFAULTS = {
  timeoutMs: 30_000,
  memoryLimitMb: 64,
} as const;

/**
 * 每个技能独立的沙箱数据根目录：<os-tmp>/skill-sandbox/<skillId>。
 * skillId 中的非法字符会被替换，防止 id 本身造成路径穿越。
 */
export function skillSandboxRoot(skillId: string): string {
  return join(tmpdir(), 'skill-sandbox', sanitizeSegment(skillId));
}

function sanitizeSegment(segment: string): string {
  const cleaned = String(segment).replace(/[^a-zA-Z0-9_-]/g, '_');
  return cleaned || 'unknown';
}

/** 路径安全校验：解析后的绝对路径必须落在 base 内（含 base 本身）。 */
export function isPathInsideBase(resolvedPath: string, base: string): boolean {
  if (resolvedPath === base) return true;
  return resolvedPath.startsWith(base.endsWith('\\') || base.endsWith('/') ? base : base + '\\') ||
    resolvedPath.startsWith(base + '/');
}
