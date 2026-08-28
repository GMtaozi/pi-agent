import { describe, it, expect } from 'vitest';
import { TaskGraphBuilder, TaskGraphExecutor } from '../task-graph';

describe('TaskGraphBuilder', () => {
  it('should build a valid task graph', () => {
    const builder = new TaskGraphBuilder('test', 'Test Graph');
    builder.addNode({ id: 'node1', type: 'agent', config: {}, dependencies: [] });
    builder.addNode({ id: 'node2', type: 'agent', config: {}, dependencies: ['node1'] });
    builder.addEdge('node1', 'node2');

    const graph = builder.build();
    expect(graph.nodes.size).toBe(2);
    expect(graph.edges).toHaveLength(1);
    expect(graph.status).toBe('idle');
  });

  it('should detect cycles', () => {
    const builder = new TaskGraphBuilder('test', 'Test Graph');
    builder.addNode({ id: 'node1', type: 'agent', config: {}, dependencies: ['node2'] });
    builder.addNode({ id: 'node2', type: 'agent', config: {}, dependencies: ['node1'] });

    expect(() => builder.build()).toThrow('contains a cycle');
  });

  it('should validate missing dependencies', () => {
    const builder = new TaskGraphBuilder('test', 'Test Graph');
    builder.addNode({ id: 'node1', type: 'agent', config: {}, dependencies: ['nonexistent'] });

    expect(() => builder.build()).toThrow('depends on non-existent node');
  });
});

describe('TaskGraphExecutor', () => {
  it('should execute nodes in topological order', async () => {
    const builder = new TaskGraphBuilder('test', 'Test Graph');
    builder.addNode({ id: 'node1', type: 'agent', config: {}, dependencies: [] });
    builder.addNode({ id: 'node2', type: 'agent', config: {}, dependencies: ['node1'] });
    const graph = builder.build();

    const executor = new TaskGraphExecutor(graph);
    const result = await executor.execute(async (node) => {
      return { executed: node.id };
    });

    expect(result.status).toBe('completed');
    expect(result.nodes.get('node1')?.status).toBe('completed');
    expect(result.nodes.get('node2')?.status).toBe('completed');
  });

  it('should handle execution failures', async () => {
    const builder = new TaskGraphBuilder('test', 'Test Graph');
    builder.addNode({ id: 'node1', type: 'agent', config: {}, dependencies: [] });
    const graph = builder.build();

    const executor = new TaskGraphExecutor(graph);
    const result = await executor.execute(async () => {
      throw new Error('Test failure');
    });

    expect(result.status).toBe('failed');
    expect(result.nodes.get('node1')?.status).toBe('failed');
  });

  it('should skip nodes with unsatisfied dependencies', async () => {
    const builder = new TaskGraphBuilder('test', 'Test Graph');
    builder.addNode({ id: 'node1', type: 'agent', config: {}, dependencies: [] });
    builder.addNode({ id: 'node2', type: 'agent', config: {}, dependencies: ['node1'] });
    const graph = builder.build();

    // Manually set node1 to failed to test skip logic
    graph.nodes.get('node1')!.status = 'failed';

    const executor = new TaskGraphExecutor(graph);
    const result = await executor.execute(async () => ({}));

    expect(result.status).toBe('completed');
    expect(result.nodes.get('node2')?.status).toBe('skipped');
  });
});
