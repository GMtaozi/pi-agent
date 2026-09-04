import { describe, it, expect } from 'vitest';
import { WorkerPool, WorkerConfig } from '../worker-pool';

describe('WorkerPool', () => {
  let pool: WorkerPool;

  beforeEach(() => {
    pool = new WorkerPool();
  });

  it('should register and unregister workers', () => {
    const config: WorkerConfig = {
      id: 'worker-1',
      type: 'general',
      capabilities: ['read', 'write']
    };

    pool.registerWorker(config);
    expect(pool.getWorkers()).toHaveLength(1);
    expect(pool.getStats().total).toBe(1);

    pool.unregisterWorker('worker-1');
    expect(pool.getWorkers()).toHaveLength(0);
    expect(pool.getStats().total).toBe(0);
  });

  it('should execute tasks with available worker', async () => {
    pool.registerWorker({
      id: 'worker-1',
      type: 'general',
      capabilities: ['read', 'write']
    });

    const result = await pool.executeTask({
      id: 'task-1',
      config: { id: 'worker-1', type: 'general', capabilities: ['read', 'write'] },
      input: { prompt: 'test' }
    });

    expect(result.status).toBe('success');
    expect(result.workerId).toBe('worker-1');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('should queue tasks when no workers available', async () => {
    pool.registerWorker({
      id: 'worker-1',
      type: 'general',
      capabilities: ['read', 'write']
    });

    // Make worker busy by executing a task
    const _task1 = pool.executeTask({
      id: 'task-1',
      config: { id: 'worker-1', type: 'general', capabilities: ['read', 'write'] },
      input: { prompt: 'test' }
    });

    // Wait a bit to ensure worker is busy
    await new Promise(resolve => setTimeout(resolve, 100));

    const result = await pool.executeTask({
      id: 'task-2',
      config: { id: 'worker-1', type: 'general', capabilities: ['read', 'write'] },
      input: { prompt: 'test2' }
    });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('queued');
    expect(pool.getStats().queued).toBeGreaterThan(0);
  });

  it('should return worker stats', () => {
    pool.registerWorker({ id: 'w1', type: 'general', capabilities: [] });
    pool.registerWorker({ id: 'w2', type: 'code', capabilities: [] });

    const stats = pool.getStats();
    expect(stats.total).toBe(2);
    expect(stats.idle).toBe(2);
    expect(stats.busy).toBe(0);
    expect(stats.queued).toBe(0);
  });
});
