import { BaseRepository } from './base.repository.js';
import { randomUUID } from 'crypto';

export interface TaskRecord {
  id: string;
  workspaceId: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  input: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  result?: any;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export class TaskRepository extends BaseRepository<TaskRecord> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  constructor(db: any) {
    super(db, 'tasks');
  }

  async create(task: Omit<TaskRecord, 'id'>): Promise<TaskRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const newTask: TaskRecord = {
      id,
      ...task,
      createdAt: now,
      updatedAt: now
    };
    await this.db.query('tasks', 'INSERT INTO tasks (id, workspaceId, type, status, input, result, error, createdAt, updatedAt, completedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      id, task.workspaceId, task.type, task.status, JSON.stringify(task.input), task.result ? JSON.stringify(task.result) : null, task.error || null, now, now, task.completedAt || null
    ]);
    return newTask;
  }

  async findByWorkspace(workspaceId: string): Promise<TaskRecord[]> {
    const result = await this.db.query('tasks', 'SELECT * FROM tasks WHERE workspaceId = ? ORDER BY createdAt DESC', [workspaceId]);
    return result.rows as TaskRecord[];
  }

  async findPending(): Promise<TaskRecord[]> {
    const result = await this.db.query('tasks', 'SELECT * FROM tasks WHERE status = ? ORDER BY createdAt ASC', ['pending']);
    return result.rows as TaskRecord[];
  }

  async updateStatus(id: string, status: TaskRecord['status']): Promise<TaskRecord | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    return this.update(id, { status, updatedAt: new Date().toISOString() } as any);
  }
}