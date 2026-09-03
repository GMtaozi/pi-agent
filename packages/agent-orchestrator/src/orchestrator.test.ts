import { describe, it, expect, beforeEach } from 'vitest';
import { Orchestrator } from '../src/orchestrator';

describe('Orchestrator', () => {
  let orchestrator: Orchestrator;

  beforeEach(() => {
    orchestrator = new Orchestrator();
  });

  describe('createTask', () => {
    it('should create task with nodes and edges', () => {
      const task = orchestrator.createTask('Test Task', [
        { id: 'node_1', type: 'agent', config: { prompt: 'Hello' }, dependencies: [] },
        { id: 'node_2', type: 'tool', config: { action: 'read' }, dependencies: [] },
      ], [
        { from: 'node_1', to: 'node_2' },
      ]);

      expect(task.id).toMatch(/^orch-/);
      expect(task.name).toBe('Test Task');
      expect(task.status).toBe('idle');
      expect(task.graph.nodes.size).toBe(2);
      expect(task.graph.edges).toHaveLength(1);
    });

    it('should get task by id', () => {
      const task = orchestrator.createTask('Test', [
        { id: 'node_1', type: 'agent', config: {}, dependencies: [] },
      ], []);

      const found = orchestrator.getTask(task.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(task.id);
    });

    it('should list all tasks', () => {
      orchestrator.createTask('Task 1', [
        { id: 'node_1', type: 'agent', config: {}, dependencies: [] },
      ], []);
      orchestrator.createTask('Task 2', [
        { id: 'node_2', type: 'tool', config: {}, dependencies: [] },
      ], []);

      expect(orchestrator.listTasks()).toHaveLength(2);
    });
  });

  describe('cancelTask', () => {
    it('should cancel running task', async () => {
      const task = orchestrator.createTask('Test', [
        { id: 'node_1', type: 'agent', config: {}, dependencies: [] },
      ], []);

      // Manually set to running
      task.status = 'running';
      const result = orchestrator.cancelTask(task.id);

      expect(result).toBe(true);
      expect(orchestrator.getTask(task.id)?.status).toBe('cancelled');
    });

    it('should not cancel non-running task', () => {
      const task = orchestrator.createTask('Test', [
        { id: 'node_1', type: 'agent', config: {}, dependencies: [] },
      ], []);

      const result = orchestrator.cancelTask(task.id);
      expect(result).toBe(false);
    });

    it('should return false for non-existent task', () => {
      const result = orchestrator.cancelTask('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('worker management', () => {
    it('should register custom worker', () => {
      orchestrator.registerWorker({
        id: 'custom-worker',
        type: 'code',
        capabilities: ['read', 'write'],
      });

      const stats = orchestrator.getWorkerStats();
      expect(stats.total).toBe(4); // 3 default + 1 custom
    });

    it('should have default workers', () => {
      const stats = orchestrator.getWorkerStats();
      expect(stats.total).toBe(3);
      expect(stats.idle).toBe(3);
    });
  });
});
