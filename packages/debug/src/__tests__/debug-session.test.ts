import { describe, it, expect, beforeEach } from 'vitest';
import { DebugSessionManager } from '../debug-session.js';

describe('DebugSessionManager', () => {
  let manager: DebugSessionManager;

  beforeEach(() => {
    manager = new DebugSessionManager();
  });

  describe('session lifecycle', () => {
    it('should create a debug session linked to an agent session', () => {
      const dbg = manager.createDebugSession('sess-1');

      expect(dbg.id).toBeDefined();
      expect(dbg.sessionId).toBe('sess-1');
      expect(dbg.status).toBe('running');
      expect(dbg.steps).toEqual([]);
      expect(dbg.breakpoints).toEqual([]);
      expect(dbg.callStack).toEqual([]);
    });

    it('should retrieve by id and by sessionId', () => {
      const dbg = manager.createDebugSession('sess-1');

      expect(manager.getDebugSession(dbg.id)?.id).toBe(dbg.id);
      expect(manager.getDebugSessionBySessionId('sess-1')?.id).toBe(dbg.id);
    });

    it('should return undefined for unknown ids', () => {
      expect(manager.getDebugSession('nope')).toBeUndefined();
      expect(manager.getDebugSessionBySessionId('nope')).toBeUndefined();
    });

    it('should list all debug sessions', () => {
      manager.createDebugSession('sess-1');
      manager.createDebugSession('sess-2');

      expect(manager.listDebugSessions()).toHaveLength(2);
    });
  });

  describe('breakpoints', () => {
    it('should add and remove breakpoints', () => {
      const dbg = manager.createDebugSession('sess-1');
      const bp = manager.addBreakpoint(dbg.id, { toolName: 'bash', enabled: true });

      expect(bp).not.toBeNull();
      expect(manager.getDebugSession(dbg.id)?.breakpoints).toHaveLength(1);

      expect(manager.removeBreakpoint(dbg.id, bp!.id)).toBe(true);
      expect(manager.getDebugSession(dbg.id)?.breakpoints).toHaveLength(0);
    });

    it('should return null when adding to unknown session', () => {
      expect(manager.addBreakpoint('nope', { toolName: 'x', enabled: true })).toBeNull();
    });

    it('should return false when removing from unknown session', () => {
      expect(manager.removeBreakpoint('nope', 'bp-1')).toBe(false);
    });

    it('should pause execution when a tool-name breakpoint matches', () => {
      const dbg = manager.createDebugSession('sess-1');
      manager.addBreakpoint(dbg.id, { toolName: 'bash', enabled: true });

      const result = manager.recordStep(dbg.id, { type: 'tool_call', toolName: 'bash' });

      expect(result.shouldBreak).toBe(true);
      expect(manager.getDebugSession(dbg.id)?.status).toBe('paused');
    });

    it('should NOT break when tool name differs', () => {
      const dbg = manager.createDebugSession('sess-1');
      manager.addBreakpoint(dbg.id, { toolName: 'bash', enabled: true });

      const result = manager.recordStep(dbg.id, { type: 'tool_call', toolName: 'read' });

      expect(result.shouldBreak).toBe(false);
      expect(manager.getDebugSession(dbg.id)?.status).toBe('running');
    });

    it('should NOT break when the breakpoint is disabled', () => {
      const dbg = manager.createDebugSession('sess-1');
      manager.addBreakpoint(dbg.id, { toolName: 'bash', enabled: false });

      const result = manager.recordStep(dbg.id, { type: 'tool_call', toolName: 'bash' });

      expect(result.shouldBreak).toBe(false);
    });

    it('should break at or after a step index breakpoint', () => {
      const dbg = manager.createDebugSession('sess-1');
      manager.addBreakpoint(dbg.id, { stepIndex: 1, enabled: true });

      expect(manager.recordStep(dbg.id, { type: 'user_message' }).shouldBreak).toBe(false);
      expect(manager.recordStep(dbg.id, { type: 'tool_call' }).shouldBreak).toBe(true);
    });

    it('should support condition expressions against the step', () => {
      const dbg = manager.createDebugSession('sess-1');
      manager.addBreakpoint(dbg.id, { condition: 'toolName === "bash"', enabled: true });

      expect(manager.recordStep(dbg.id, { type: 'tool_call', toolName: 'read' }).shouldBreak).toBe(false);
      expect(manager.recordStep(dbg.id, { type: 'tool_call', toolName: 'bash' }).shouldBreak).toBe(true);
    });

    it('should ignore invalid condition expressions', () => {
      const dbg = manager.createDebugSession('sess-1');
      manager.addBreakpoint(dbg.id, { condition: '!!!not valid(((', enabled: true });

      expect(manager.recordStep(dbg.id, { type: 'tool_call', toolName: 'bash' }).shouldBreak).toBe(false);
    });

    it('should return shouldBreak false for unknown debug session', () => {
      const result = manager.recordStep('nope', { type: 'tool_call', toolName: 'bash' });

      expect(result.shouldBreak).toBe(false);
      expect(result.step.index).toBe(0);
    });
  });

  describe('step recording', () => {
    it('should assign incrementing indices and timestamps', () => {
      const dbg = manager.createDebugSession('sess-1');

      const s1 = manager.recordStep(dbg.id, { type: 'user_message', content: 'hi' }).step;
      const s2 = manager.recordStep(dbg.id, { type: 'assistant_message', content: 'yo' }).step;

      expect(s1.index).toBe(0);
      expect(s2.index).toBe(1);
      expect(s2.timestamp).toBeGreaterThanOrEqual(s1.timestamp);
      expect(manager.getDebugSession(dbg.id)?.currentStep).toBe(2);
    });

    it('should push tool calls onto the call stack', () => {
      const dbg = manager.createDebugSession('sess-1');
      manager.recordStep(dbg.id, { type: 'tool_call', toolName: 'bash' });
      manager.recordStep(dbg.id, { type: 'tool_call', toolName: 'read' });

      const stack = manager.getDebugSession(dbg.id)?.callStack;
      expect(stack).toHaveLength(2);
      expect(stack![0].toolName).toBe('bash');
      expect(stack![1].toolName).toBe('read');
    });

    it('should extract variables from tool input', () => {
      const dbg = manager.createDebugSession('sess-1');
      manager.recordStep(dbg.id, {
        type: 'tool_call',
        toolName: 'bash',
        toolInput: { command: 'ls -la', cwd: '/tmp' },
      });

      const vars = manager.getDebugSession(dbg.id)?.variables;
      expect(vars).toHaveLength(2);
      expect(vars!.map(v => v.name)).toEqual(['command', 'cwd']);
      expect(vars![0].type).toBe('string');
      expect(vars![0].scope).toBe('tool');
    });

    it('should not record variables for non-object tool input', () => {
      const dbg = manager.createDebugSession('sess-1');
      manager.recordStep(dbg.id, { type: 'tool_call', toolName: 'bash', toolInput: 'plain string' });

      expect(manager.getDebugSession(dbg.id)?.variables).toEqual([]);
    });

    it('should record error steps', () => {
      const dbg = manager.createDebugSession('sess-1');
      const { step } = manager.recordStep(dbg.id, { type: 'error', error: 'boom' });

      expect(step.error).toBe('boom');
    });
  });

  describe('execution control', () => {
    it('should pause, resume, step and abort', () => {
      const dbg = manager.createDebugSession('sess-1');

      expect(manager.pause(dbg.id)).toBe(true);
      expect(manager.getDebugSession(dbg.id)?.status).toBe('paused');

      expect(manager.resume(dbg.id)).toBe(true);
      expect(manager.getDebugSession(dbg.id)?.status).toBe('running');

      expect(manager.step(dbg.id)).toBe(true);
      expect(manager.getDebugSession(dbg.id)?.status).toBe('stepping');

      expect(manager.abort(dbg.id)).toBe(true);
      expect(manager.getDebugSession(dbg.id)?.status).toBe('aborted');
    });

    it('should return false for unknown session', () => {
      expect(manager.pause('nope')).toBe(false);
      expect(manager.resume('nope')).toBe(false);
      expect(manager.step('nope')).toBe(false);
      expect(manager.abort('nope')).toBe(false);
    });
  });
});
