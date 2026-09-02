/**
 * Debug session management — breakpoints, stepping, variable inspection.
 */

import { Logger } from '@workforge/logging';
import { randomUUID } from 'crypto';

export interface DebugBreakpoint {
  id: string;
  sessionId: string;
  toolName?: string;       // break on specific tool call
  stepIndex?: number;      // break at step number
  condition?: string;      // simple expression: toolName === "xxx"
  enabled: boolean;
}

export interface DebugVariable {
  name: string;
  value: unknown;
  type: string;
  scope: 'session' | 'tool' | 'message';
}

export interface DebugStep {
  index: number;
  type: 'user_message' | 'assistant_message' | 'tool_call' | 'tool_result' | 'error';
  timestamp: number;
  content?: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  error?: string;
  variables?: DebugVariable[];
}

export interface DebugSession {
  id: string;
  sessionId: string;       // links to agent session
  status: 'running' | 'paused' | 'stepping' | 'completed' | 'aborted';
  breakpoints: DebugBreakpoint[];
  steps: DebugStep[];
  currentStep: number;
  variables: DebugVariable[];
  callStack: Array<{ toolName: string; stepIndex: number }>;
  createdAt: number;
  updatedAt: number;
}

export class DebugSessionManager {
  private sessions = new Map<string, DebugSession>();
  private logger: Logger;

  constructor() {
    this.logger = new Logger({ service: 'debug-session', level: 'info' });
  }

  createDebugSession(sessionId: string): DebugSession {
    const id = `dbg_${randomUUID().slice(0, 8)}`;
    const now = Date.now();
    const debug: DebugSession = {
      id,
      sessionId,
      status: 'running',
      breakpoints: [],
      steps: [],
      currentStep: 0,
      variables: [],
      callStack: [],
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(id, debug);
    this.logger.info('Debug session created', { debugId: id, sessionId });
    return debug;
  }

  getDebugSession(id: string): DebugSession | undefined {
    return this.sessions.get(id);
  }

  getDebugSessionBySessionId(sessionId: string): DebugSession | undefined {
    for (const dbg of this.sessions.values()) {
      if (dbg.sessionId === sessionId) return dbg;
    }
    return undefined;
  }

  addBreakpoint(debugId: string, bp: Omit<DebugBreakpoint, 'id'>): DebugBreakpoint | null {
    const dbg = this.sessions.get(debugId);
    if (!dbg) return null;
    const breakpoint: DebugBreakpoint = {
      ...bp,
      id: `bp_${randomUUID().slice(0, 8)}`,
    };
    dbg.breakpoints.push(breakpoint);
    dbg.updatedAt = Date.now();
    return breakpoint;
  }

  removeBreakpoint(debugId: string, bpId: string): boolean {
    const dbg = this.sessions.get(debugId);
    if (!dbg) return false;
    dbg.breakpoints = dbg.breakpoints.filter(bp => bp.id !== bpId);
    dbg.updatedAt = Date.now();
    return true;
  }

  recordStep(debugId: string, step: Omit<DebugStep, 'index' | 'timestamp'>): { shouldBreak: boolean; step: DebugStep } {
    const dbg = this.sessions.get(debugId);
    if (!dbg) return { shouldBreak: false, step: { ...step, index: 0, timestamp: 0 } };

    const fullStep: DebugStep = {
      ...step,
      index: dbg.steps.length,
      timestamp: Date.now(),
    };
    dbg.steps.push(fullStep);
    dbg.currentStep = dbg.steps.length;
    dbg.updatedAt = Date.now();

    // Update call stack
    if (step.type === 'tool_call' && step.toolName) {
      dbg.callStack.push({ toolName: step.toolName, stepIndex: fullStep.index });
    }

    // Extract variables from tool calls
    if (step.toolInput && typeof step.toolInput === 'object') {
      for (const [key, value] of Object.entries(step.toolInput)) {
        dbg.variables.push({
          name: key,
          value,
          type: typeof value,
          scope: 'tool',
        });
      }
    }

    // Check breakpoints
    const shouldBreak = this.checkBreakpoints(dbg, fullStep);
    if (shouldBreak) {
      dbg.status = 'paused';
    }

    return { shouldBreak, step: fullStep };
  }

  private checkBreakpoints(dbg: DebugSession, step: DebugStep): boolean {
    for (const bp of dbg.breakpoints) {
      if (!bp.enabled) continue;
      if (bp.stepIndex !== undefined && step.index >= bp.stepIndex) return true;
      if (bp.toolName && step.toolName === bp.toolName) return true;
      if (bp.condition) {
        try {
          // Simple condition evaluation
          const fn = new Function('step', 'toolName', `return ${bp.condition}`);
          if (fn(step, step.toolName)) return true;
        } catch {
          // Invalid condition, skip
        }
      }
    }
    return false;
  }

  pause(debugId: string): boolean {
    const dbg = this.sessions.get(debugId);
    if (!dbg) return false;
    dbg.status = 'paused';
    dbg.updatedAt = Date.now();
    return true;
  }

  resume(debugId: string): boolean {
    const dbg = this.sessions.get(debugId);
    if (!dbg) return false;
    dbg.status = 'running';
    dbg.updatedAt = Date.now();
    return true;
  }

  step(debugId: string): boolean {
    const dbg = this.sessions.get(debugId);
    if (!dbg) return false;
    dbg.status = 'stepping';
    dbg.updatedAt = Date.now();
    return true;
  }

  abort(debugId: string): boolean {
    const dbg = this.sessions.get(debugId);
    if (!dbg) return false;
    dbg.status = 'aborted';
    dbg.updatedAt = Date.now();
    return true;
  }

  listDebugSessions(): DebugSession[] {
    return Array.from(this.sessions.values());
  }
}
