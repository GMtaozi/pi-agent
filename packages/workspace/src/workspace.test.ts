import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('chokidar', () => ({
  watch: vi.fn().mockReturnValue({
    on: vi.fn().mockReturnThis(),
    close: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue('test content'),
  writeFile: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({ size: 100, isDirectory: () => false }),
  readdir: vi.fn().mockResolvedValue([]),
  unlink: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
}));

import { WorkspaceService } from '../src/workspace';

describe('WorkspaceService', () => {
  let service: WorkspaceService;

  beforeEach(() => {
    service = new WorkspaceService('/tmp/test-workspaces.json');
  });

  it('should create workspace', async () => {
    const ws = await service.create('/tmp/test-ws-1', 'Test Workspace');
    expect(ws.id).toBeDefined();
    expect(ws.title).toBe('Test Workspace');
  });

  it('should get workspace by id', async () => {
    const ws = await service.create('/tmp/test-ws-2', 'Test 2');
    const found = await service.getWorkspace(ws.id);
    expect(found).toBeDefined();
    expect(found?.id).toBe(ws.id);
  });

  it('should list workspaces', async () => {
    await service.create('/tmp/test-ws-3', 'A');
    await service.create('/tmp/test-ws-4', 'B');
    const all = await service.listWorkspaces();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it('should delete workspace', async () => {
    const ws = await service.create('/tmp/test-ws-5', 'Delete Me');
    const result = await service.deleteWorkspace(ws.id);
    expect(result).toBe(true);
  });

  it('should return null for non-existent workspace', async () => {
    const found = await service.getWorkspace('nonexistent');
    expect(found).toBeNull();
  });
});
