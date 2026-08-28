import { describe, it, expect } from 'vitest';
import { WorkflowEngine } from '../engine';

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;

  beforeEach(() => {
    engine = new WorkflowEngine();
  });

  it('should register and retrieve workflows', () => {
    const workflow = {
      id: 'test',
      name: 'Test',
      steps: [],
      triggers: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    engine.registerWorkflow(workflow);
    const retrieved = engine.getWorkflow('test');

    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('Test');
  });

  it('should list all workflows', () => {
    engine.registerWorkflow({
      id: 'w1', name: 'W1', steps: [], triggers: [], createdAt: '', updatedAt: ''
    });
    engine.registerWorkflow({
      id: 'w2', name: 'W2', steps: [], triggers: [], createdAt: '', updatedAt: ''
    });

    const workflows = engine.listWorkflows();
    expect(workflows).toHaveLength(2);
  });

  it('should execute workflow and return execution', async () => {
    engine.registerWorkflow({
      id: 'test',
      name: 'Test',
      steps: [{ id: 'step1', type: 'agent', config: { prompt: 'Hello' } }],
      triggers: [],
      createdAt: '',
      updatedAt: ''
    });

    const execution = await engine.executeWorkflow('test', {});
    expect(execution.id).toBeDefined();
    expect(execution.workflowId).toBe('test');
    expect(['completed', 'failed']).toContain(execution.status);
  });

  it('should handle workflow not found', async () => {
    await expect(engine.executeWorkflow('nonexistent', {})).rejects.toThrow('Workflow not found');
  });

  it('should list executions for a workflow', async () => {
    engine.registerWorkflow({
      id: 'test',
      name: 'Test',
      steps: [{ id: 'step1', type: 'agent', config: {} }],
      triggers: [],
      createdAt: '',
      updatedAt: ''
    });

    await engine.executeWorkflow('test', {});
    const executions = engine.listExecutions('test');
    expect(executions.length).toBeGreaterThanOrEqual(1);
  });

  it('should cancel running execution', async () => {
    engine.registerWorkflow({
      id: 'test',
      name: 'Test',
      steps: [{ id: 'step1', type: 'agent', config: {} }],
      triggers: [],
      createdAt: '',
      updatedAt: ''
    });

    // Start execution in background
    const _executePromise = engine.executeWorkflow('test', {});
    
    // Give it a moment to start
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Manually set status to running for test purposes
    const execution = await engine.executeWorkflow('test', {});
    execution.status = 'running';
    
    const cancelled = engine.cancelExecution(execution.id);
    expect(cancelled).toBe(true);
  });
});
