import { migrations } from '../../migrations/index.js';
import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../../database';
import { TaskRepository } from '../task.repository';

describe('TaskRepository', () => {
  let db: Database;
  let repo: TaskRepository;

  beforeEach(async () => {
    db = new Database({ inMemory: true });
    await db.initialize();
    await db.runMigrations(migrations);
    repo = new TaskRepository(db);
  });

  it('should create a task', async () => {
    const task = await repo.create({
      workspaceId: 'default',
      type: 'agent',
      status: 'pending',
      input: { prompt: 'test' }
    });

    expect(task.id).toBeDefined();
    expect(task.status).toBe('pending');
    expect(task.completedAt).toBeUndefined();
  });



  it('should find tasks by workspace', async () => {
    await repo.create({ workspaceId: 'ws1', type: 'agent', status: 'pending', input: {} });
    await repo.create({ workspaceId: 'ws2', type: 'tool', status: 'pending', input: {} });

    const tasks = await repo.findByWorkspace('ws1');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].workspaceId).toBe('ws1');
  });

  it('should find pending tasks ordered by createdAt ASC', async () => {
    const task1 = await repo.create({ workspaceId: 'default', type: 'agent', status: 'pending', input: {} });
    await new Promise(resolve => setTimeout(resolve, 10));
    const _task2 = await repo.create({ workspaceId: 'default', type: 'agent', status: 'pending', input: {} });

    const pending = await repo.findPending();
    expect(pending).toHaveLength(2);
    expect(pending[0].id).toBe(task1.id);
  });



});
