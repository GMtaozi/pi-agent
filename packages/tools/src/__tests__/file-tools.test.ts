import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReadFileTool } from '../read-file-tool.js';
import { WriteFileTool } from '../write-file-tool.js';
import { EditFileTool } from '../edit-file-tool.js';
import { createWorkspaceTools } from '../workspace-tools.js';
import type { BaseToolOptions } from '../base-tool.js';

function makeOptions() {
  return {
    workspaceService: {
      readFile: vi.fn(async (_ws: string, p: string) => `content-of:${p}`),
      writeFile: vi.fn(async () => undefined),
    },
    workspaceId: 'ws-1',
    onToolCall: vi.fn(),
  } as unknown as BaseToolOptions & {
    workspaceService: {
      readFile: ReturnType<typeof vi.fn>;
      writeFile: ReturnType<typeof vi.fn>;
    };
    onToolCall: ReturnType<typeof vi.fn>;
  };
}

describe('ReadFileTool', () => {
  let opts: ReturnType<typeof makeOptions>;

  beforeEach(() => { opts = makeOptions(); });

  it('returns file content via workspaceService', async () => {
    const tool = new ReadFileTool(opts);
    const res = await tool.execute('c1', { path: 'a.txt' });
    expect(res.isError).toBeFalsy();
    expect(opts.workspaceService.readFile).toHaveBeenCalledWith('ws-1', 'a.txt');
    expect((res.details as { size: number }).size).toBe('content-of:a.txt'.length);
  });

  it('reports errors without throwing', async () => {
    (opts.workspaceService.readFile as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('boom'));
    const tool = new ReadFileTool(opts);
    const res = await tool.execute('c1', { path: 'x' });
    expect(res.isError).toBe(true);
    expect(String(res.details.error)).toBe('boom');
  });
});

describe('WriteFileTool', () => {
  it('delegates to workspaceService.writeFile', async () => {
    const opts = makeOptions();
    const tool = new WriteFileTool(opts);
    const res = await tool.execute('c1', { path: 'out.txt', content: 'hello' });
    expect(res.isError).toBeFalsy();
    expect(opts.workspaceService.writeFile).toHaveBeenCalledWith('ws-1', 'out.txt', 'hello');
  });
});

describe('EditFileTool', () => {
  it('replaces oldText with newText and writes back', async () => {
    const opts = makeOptions();
    (opts.workspaceService.readFile as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce('hello world');
    const tool = new EditFileTool(opts);
    const res = await tool.execute('c1', { path: 'f.txt', oldText: 'world', newText: 'there' });
    expect(res.isError).toBeFalsy();
    expect(opts.workspaceService.writeFile).toHaveBeenCalledWith('ws-1', 'f.txt', 'hello there');
  });

  it('fails gracefully when oldText is missing', async () => {
    const opts = makeOptions();
    (opts.workspaceService.readFile as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce('hello world');
    const tool = new EditFileTool(opts);
    const res = await tool.execute('c1', { path: 'f.txt', oldText: 'nope', newText: 'x' });
    expect(res.isError).toBe(true);
    expect(opts.workspaceService.writeFile).not.toHaveBeenCalled();
  });
});

describe('createWorkspaceTools filtering', () => {
  it('always exposes the basic file tools', () => {
    const tools = createWorkspaceTools(
      { validatePath: (id: string, p: string) => p } as unknown as Parameters<typeof createWorkspaceTools>[0],
      'ws',
    );
    const names = tools.map(t => t.name);
    expect(names).toEqual(expect.arrayContaining(['read_file', 'write_file', 'edit_file']));
  });
});
