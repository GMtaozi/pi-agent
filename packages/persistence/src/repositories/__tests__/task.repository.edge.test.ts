import { migrations } from '../../migrations/index.js';
import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../../database';
import { TaskRepository } from '../task.repository';

describe('TaskRepository Edge Cases', () => {
  let db: Database;
  let repo: TaskRepository;

  beforeEach(async () => {
    db = new Database({ inMemory: true });
    await db.initialize();
    await db.runMigrations(migrations);
    repo = new TaskRepository(db);
  });

  it('should handle task with all optional fields', async () => {
    const task = await repo.create({
      workspaceId: 'default',
      type: 'agent',
      status: 'pending',
      input: { prompt: 'test' },
      result: { output: 'done' },
      error: 'none',
      completedAt: new Date().toISOString()
    });
    
    expect(task.result).toEqual({ output: 'done' });
    expect(task.error).toBe('none');
    expect(task.completedAt).toBeDefined();
  });

  it('should handle task with empty input', async () => {
    const task = await repo.create({
      workspaceId: 'default',
      type: 'agent',
      status: 'pending',
      input: {}
    });
    
    expect(task.input).toEqual({});
  });

  it('should return empty array for non-existent workspace', async () => {
    const tasks = await repo.findByWorkspace('nonexistent');
    expect(tasks).toEqual([]);
  });

  it('should return empty array when no pending tasks', async () => {
    await repo.create({ workspaceId: 'default', type: 'agent', status: 'completed', input: {} });
    const pending = await repo.findPending();
    expect(pending).toEqual([]);
  });






  it('should handle task cancellation with completedAt', async () => {
    const task = await repo.create({
      workspaceId: 'default',
      type: 'agent',
      status: 'running',
      input: {}
    });
    
    const updated = await repo.updateStatus(task.id, 'cancelled');
    expect(updated?.status).toBe('cancelled');
    expect(updated?.completedAt).toBeDefined();
  });

});
