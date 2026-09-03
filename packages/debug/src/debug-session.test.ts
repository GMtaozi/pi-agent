import { describe, it, expect, beforeEach } from 'vitest';
import { DebugSessionManager } from '../src/debug-session';

describe('DebugSessionManager', () => {
  let manager: DebugSessionManager;

  beforeEach(() => {
    manager = new DebugSessionManager();
  });

  describe('createDebugSession', () => {
    it('should create a debug session with initial state', () => {
      const session = manager.createDebugSession('sess_123');

      expect(session.id).toMatch(/^dbg_/);
      expect(session.sessionId).toBe('sess_123');
      expect(session.status).toBe('running');
      expect(session.breakpoints).toEqual([]);
      expect(session.steps).toEqual([]);
      expect(session.currentStep).toBe(0);
      expect(session.variables).toEqual([]);
      expect(session.callStack).toEqual([]);
      expect(session.createdAt).toBeDefined();
      expect(session.updatedAt).toBeDefined();
    });
  });

  describe('getDebugSession', () => {
    it('should find session by debug id', () => {
      const created = manager.createDebugSession('sess_1');
      const found = manager.getDebugSession(created.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
    });

    it('should find session by agent session id', () => {
      manager.createDebugSession('sess_2');
      const found = manager.getDebugSessionBySessionId('sess_2');

      expect(found).toBeDefined();
      expect(found?.sessionId).toBe('sess_2');
    });

    it('should return undefined for non-existent session', () => {
      expect(manager.getDebugSession('nonexistent')).toBeUndefined();
    });
  });

  describe('breakpoints', () => {
    it('should add a breakpoint', () => {
      const session = manager.createDebugSession('sess_1');
      const bp = manager.addBreakpoint(session.id, {
        toolName: 'shell',
        enabled: true,
      });

      expect(bp).not.toBeNull();
      expect(bp?.id).toMatch(/^bp_/);
      expect(bp?.toolName).toBe('shell');
      expect(bp?.enabled).toBe(true);
    });

    it('should add a step breakpoint', () => {
      const session = manager.createDebugSession('sess_1');
      const bp = manager.addBreakpoint(session.id, {
        stepIndex: 5,
        enabled: true,
      });

      expect(bp?.stepIndex).toBe(5);
    });

    it('should remove a breakpoint', () => {
      const session = manager.createDebugSession('sess_1');
      const bp = manager.addBreakpoint(session.id, { toolName: 'shell', enabled: true });

      const removed = manager.removeBreakpoint(session.id, bp!.id);
      expect(removed).toBe(true);

      const updated = manager.getDebugSession(session.id);
      expect(updated?.breakpoints).toEqual([]);
    });

    it('should return null when adding to non-existent session', () => {
      const bp = manager.addBreakpoint('nonexistent', { toolName: 'shell', enabled: true });
      expect(bp).toBeNull();
    });
  });

  describe('recordStep', () => {
    it('should record a step and auto-assign index', () => {
      const session = manager.createDebugSession('sess_1');
      const result = manager.recordStep(session.id, {
        type: 'user_message',
        content: 'Hello',
      });

      expect(result.step.index).toBe(0);
      expect(result.step.type).toBe('user_message');
      expect(result.step.content).toBe('Hello');
      expect(result.step.timestamp).toBeDefined();
      expect(result.shouldBreak).toBe(false);
    });

    it('should increment step index', () => {
      const session = manager.createDebugSession('sess_1');
      manager.recordStep(session.id, { type: 'user_message', content: 'A' });
      const result = manager.recordStep(session.id, { type: 'user_message', content: 'B' });

      expect(result.step.index).toBe(1);
    });

    it('should trigger breakpoint on tool name match', () => {
      const session = manager.createDebugSession('sess_1');
      manager.addBreakpoint(session.id, { toolName: 'shell', enabled: true });

      const result = manager.recordStep(session.id, {
        type: 'tool_call',
        toolName: 'shell',
        toolInput: { cmd: 'ls' },
      });

      expect(result.shouldBreak).toBe(true);
      const updated = manager.getDebugSession(session.id);
      expect(updated?.status).toBe('paused');
    });

    it('should trigger breakpoint on step index match', () => {
      const session = manager.createDebugSession('sess_1');
      manager.addBreakpoint(session.id, { stepIndex: 1, enabled: true });

      const first = manager.recordStep(session.id, { type: 'user_message', content: 'A' });
      expect(first.shouldBreak).toBe(false);

      const second = manager.recordStep(session.id, { type: 'user_message', content: 'B' });
      expect(second.shouldBreak).toBe(true);
    });

    it('should not trigger disabled breakpoint', () => {
      const session = manager.createDebugSession('sess_1');
      manager.addBreakpoint(session.id, { toolName: 'shell', enabled: false });

      const result = manager.recordStep(session.id, {
        type: 'tool_call',
        toolName: 'shell',
      });

      expect(result.shouldBreak).toBe(false);
    });

    it('should collect variables from tool input', () => {
      const session = manager.createDebugSession('sess_1');
      manager.recordStep(session.id, {
        type: 'tool_call',
        toolName: 'shell',
        toolInput: { cmd: 'ls', path: '/tmp' },
      });

      const updated = manager.getDebugSession(session.id);
      expect(updated?.variables).toHaveLength(2);
      expect(updated?.variables[0].name).toBe('cmd');
      expect(updated?.variables[0].value).toBe('ls');
    });

    it('should update call stack on tool_call', () => {
      const session = manager.createDebugSession('sess_1');
      manager.recordStep(session.id, {
        type: 'tool_call',
        toolName: 'shell',
      });

      const updated = manager.getDebugSession(session.id);
      expect(updated?.callStack).toHaveLength(1);
      expect(updated?.callStack[0].toolName).toBe('shell');
    });
  });

  describe('state transitions', () => {
    it('should pause a running session', () => {
      const session = manager.createDebugSession('sess_1');
      expect(session.status).toBe('running');

      const ok = manager.pause(session.id);
      expect(ok).toBe(true);
      expect(manager.getDebugSession(session.id)?.status).toBe('paused');
    });

    it('should resume a paused session', () => {
      const session = manager.createDebugSession('sess_1');
      manager.pause(session.id);

      const ok = manager.resume(session.id);
      expect(ok).toBe(true);
      expect(manager.getDebugSession(session.id)?.status).toBe('running');
    });

    it('should set stepping mode', () => {
      const session = manager.createDebugSession('sess_1');
      manager.step(session.id);

      expect(manager.getDebugSession(session.id)?.status).toBe('stepping');
    });

    it('should abort a session', () => {
      const session = manager.createDebugSession('sess_1');
      manager.abort(session.id);

      expect(manager.getDebugSession(session.id)?.status).toBe('aborted');
    });

    it('should return false for non-existent session', () => {
      expect(manager.pause('nonexistent')).toBe(false);
      expect(manager.resume('nonexistent')).toBe(false);
      expect(manager.step('nonexistent')).toBe(false);
      expect(manager.abort('nonexistent')).toBe(false);
    });
  });

  describe('listDebugSessions', () => {
    it('should list all debug sessions', () => {
      manager.createDebugSession('sess_1');
      manager.createDebugSession('sess_2');

      const sessions = manager.listDebugSessions();
      expect(sessions).toHaveLength(2);
    });
  });
});
