import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('cron-parser', () => ({
  parseExpression: vi.fn().mockReturnValue({
    next: vi.fn().mockReturnValue({ toDate: () => new Date(Date.now() + 60000) }),
  }),
}));

import { ScheduleService } from '../src/schedule';

describe('ScheduleService', () => {
  let service: ScheduleService;

  beforeEach(() => {
    service = new ScheduleService();
  });

  it('should create scheduled task', () => {
    const task = service.createTask({
      workspaceId: 'ws_1',
      name: 'Daily Report',
      cron: '0 9 * * *',
      prompt: 'Generate daily report',
      enabled: true,
      status: 'pending',
    });

    expect(task.id).toMatch(/^schedule-/);
    expect(task.cron).toBe('0 9 * * *');
    expect(task.enabled).toBe(true);
  });

  it('should get task by id', () => {
    const task = service.createTask({
      workspaceId: 'ws_1',
      cron: '0 9 * * *',
      prompt: 'Test',
      enabled: true,
      status: 'pending',
    });

    const found = service.getTask(task.id);
    expect(found).toBeDefined();
    expect(found?.id).toBe(task.id);
  });

  it('should list tasks', () => {
    service.createTask({
      workspaceId: 'ws_1',
      cron: '0 9 * * *',
      prompt: 'Task 1',
      enabled: true,
      status: 'pending',
    });
    service.createTask({
      workspaceId: 'ws_2',
      cron: '0 10 * * *',
      prompt: 'Task 2',
      enabled: false,
      status: 'pending',
    });

    const tasks = service.listTasks();
    expect(tasks.length).toBeGreaterThanOrEqual(2);
  });

  it('should update task', () => {
    const task = service.createTask({
      workspaceId: 'ws_1',
      cron: '0 9 * * *',
      prompt: 'Original',
      enabled: true,
      status: 'pending',
    });

    const result = service.updateTask(task.id, { prompt: 'Updated' });
    expect(result).toBeDefined();
    expect(result?.prompt).toBe('Updated');
  });

  it('should delete task', () => {
    const task = service.createTask({
      workspaceId: 'ws_1',
      cron: '0 9 * * *',
      prompt: 'Delete me',
      enabled: true,
      status: 'pending',
    });

    const result = service.deleteTask(task.id);
    expect(result).toBe(true);
    expect(service.getTask(task.id)).toBeUndefined();
  });

  it('should enable/disable task', () => {
    const task = service.createTask({
      workspaceId: 'ws_1',
      cron: '0 9 * * *',
      prompt: 'Toggle',
      enabled: true,
      status: 'pending',
    });

    service.updateTask(task.id, { enabled: false });
    expect(service.getTask(task.id)?.enabled).toBe(false);

    service.updateTask(task.id, { enabled: true });
    expect(service.getTask(task.id)?.enabled).toBe(true);
  });

  it('should get task history', () => {
    const history = service.getTaskHistory('nonexistent');
    expect(history).toEqual([]);
  });
});
