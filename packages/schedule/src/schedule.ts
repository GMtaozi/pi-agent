import * as cronParser from 'cron-parser';
const parseExpression = cronParser.parseExpression;
import { Logger } from '@workforge/logging';

export interface ScheduledTask {
  id: string;
  workspaceId: string;
  name?: string;
  cron: string;
  prompt: string;
  enabled: boolean;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  lastRunAt?: number;
  nextRunAt?: number;
  createdAt: string;
  updatedAt: string;
  retryCount?: number;
  maxRetries?: number;
  result?: string;
  error?: string;
}

export interface TaskHistory {
  id: string;
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  finishedAt?: string;
  result?: string;
  error?: string;
}

export class ScheduleService {
  private tasks = new Map<string, ScheduledTask>();
  private intervals = new Map<string, NodeJS.Timeout>();
  private history = new Map<string, TaskHistory[]>();
  private logger: Logger;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  private agentEngine: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  constructor(agentEngine?: any) {
    this.logger = new Logger({ service: 'schedule', level: 'info' });
    this.agentEngine = agentEngine;
  }

  createTask(task: Omit<ScheduledTask, 'id' | 'createdAt' | 'updatedAt'>): ScheduledTask {
    const id = 'schedule-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const now = new Date().toISOString();
    const newTask: ScheduledTask = {
      id,
      createdAt: now,
      updatedAt: now,
      ...task
    };

    this.tasks.set(id, newTask);
    this.logger.info('Task created', { id, workspaceId: newTask.workspaceId, cron: newTask.cron });

    if (newTask.enabled) {
      this.scheduleTask(newTask);
    }

    return newTask;
  }

  listTasks(workspaceId?: string): ScheduledTask[] {
    const all = Array.from(this.tasks.values());
    if (workspaceId) {
      return all.filter(t => t.workspaceId === workspaceId);
    }
    return all;
  }

  getTask(id: string): ScheduledTask | undefined {
    return this.tasks.get(id);
  }

  async runTask(id: string): Promise<void> {
    const task = this.tasks.get(id);
    if (!task || !task.enabled) {
      throw new Error('Task not found or disabled: ' + id);
    }

    const historyId = 'hist-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const startedAt = new Date().toISOString();
    task.status = 'running';
    task.updatedAt = startedAt;
    this.recordHistory(id, { id: historyId, taskId: id, status: 'running', startedAt });
    this.logger.info('Task started', { id, prompt: task.prompt });

    try {
      if (this.agentEngine && typeof this.agentEngine.prompt === 'function') {
        const sessionId = await this.agentEngine.createSession('deepseek-chat', 'standard', task.workspaceId || 'default');
        const response = await this.agentEngine.prompt(sessionId, task.prompt);
        task.result = response || 'Task completed';
        task.status = 'completed';
      } else {
        await this.executeTask(task);
        task.result = 'Task completed successfully';
        task.status = 'completed';
      }

      task.lastRunAt = Date.now();
      task.updatedAt = new Date().toISOString();
      this.updateLastHistory(id, historyId, { status: 'completed', finishedAt: task.updatedAt, result: task.result });
      this.logger.info('Task completed', { id });
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : String(error);
      task.retryCount = (task.retryCount || 0) + 1;
      task.updatedAt = new Date().toISOString();
      this.updateLastHistory(id, historyId, { status: 'failed', finishedAt: task.updatedAt, error: task.error });
      this.logger.error('Task failed', { id, error: task.error });

      if (task.retryCount < (task.maxRetries || 3)) {
        this.logger.info('Retrying task', { id, attempt: task.retryCount });
        setTimeout(() => this.runTask(id), 5000);
      }
    }

    // Schedule next run
    this.scheduleNextRun(task);
  }

  updateTask(id: string, patch: Partial<Pick<ScheduledTask, 'name' | 'cron' | 'prompt' | 'enabled'>>): ScheduledTask | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;

    const updated: ScheduledTask = {
      ...task,
      ...patch,
      updatedAt: new Date().toISOString()
    };

    this.tasks.set(id, updated);

    // Reschedule if cron or enabled changed
    if (this.intervals.has(id)) {
      clearTimeout(this.intervals.get(id)!);
      this.intervals.delete(id);
    }
    if (updated.enabled) {
      this.scheduleTask(updated);
    }

    this.logger.info('Task updated', { id, patch });
    return updated;
  }

  getTaskHistory(taskId: string): TaskHistory[] {
    return this.history.get(taskId) || [];
  }

  private recordHistory(taskId: string, entry: TaskHistory): void {
    const list = this.history.get(taskId) || [];
    list.push(entry);
    this.history.set(taskId, list);
  }

  private updateLastHistory(taskId: string, historyId: string, patch: Partial<TaskHistory>): void {
    const list = this.history.get(taskId) || [];
    const idx = list.findIndex(h => h.id === historyId);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...patch };
      this.history.set(taskId, list);
    }
  }

  cancelTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;

    task.status = 'cancelled';
    task.enabled = false;
    task.updatedAt = new Date().toISOString();

    if (this.intervals.has(id)) {
      clearTimeout(this.intervals.get(id)!);
      this.intervals.delete(id);
    }

    this.logger.info('Task cancelled', { id });
    return true;
  }

  deleteTask(id: string): boolean {
    if (this.intervals.has(id)) {
      clearTimeout(this.intervals.get(id)!);
      this.intervals.delete(id);
    }
    return this.tasks.delete(id);
  }

  private scheduleTask(task: ScheduledTask): void {
    try {
      const cron = parseExpression(task.cron, { currentDate: new Date() });
      const nextRun = cron.next().toDate();
      const delay = nextRun.getTime() - Date.now();

      task.nextRunAt = nextRun.getTime();
      this.logger.info('Task scheduled', { id: task.id, nextRun: nextRun.toISOString() });

      const timeout = setTimeout(() => {
        this.intervals.delete(task.id);
        if (task.enabled) {
          this.runTask(task.id);
        }
      }, delay);

      this.intervals.set(task.id, timeout);
    } catch (error) {
      this.logger.error('Failed to schedule task', { id: task.id, cron: task.cron, error });
    }
  }

  private scheduleNextRun(task: ScheduledTask): void {
    if (this.intervals.has(task.id)) {
      clearTimeout(this.intervals.get(task.id)!);
      this.intervals.delete(task.id);
    }

    if (task.enabled && task.status !== 'cancelled') {
      this.scheduleTask(task);
    }
  }

  private async executeTask(_task: ScheduledTask): Promise<void> {
    // Simulate task execution
    // In real implementation, this would call AgentEngine.prompt()
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Simulate occasional failures for testing
    if (Math.random() < 0.1) {
      throw new Error('Simulated task failure');
    }
  }

  shutdown(): void {
    for (const [_id, interval] of this.intervals) {
      clearTimeout(interval);
    }
    this.intervals.clear();
    this.logger.info('Schedule service shutdown');
  }
}