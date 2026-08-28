import { BaseRepository } from './base.repository.js';
import { randomUUID } from 'crypto';

export interface Session {
  id: string;
  model: string;
  workspaceId: string;
  mode: 'standard' | 'ptc';
  status: 'active' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

export class SessionRepository extends BaseRepository<Session> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  constructor(db: any) {
    super(db, 'sessions');
  }

  async create(session: Omit<Session, 'id'> | Session): Promise<Session> {
    const now = new Date().toISOString();
    const newSession: Session = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      ...(session as any),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      id: (session as any).id || randomUUID(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      createdAt: (session as any).createdAt || now,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      updatedAt: (session as any).updatedAt || now
    };
    
    await this.db.query('sessions', 'INSERT INTO sessions (id, model, workspaceId, mode, status, createdAt, updatedAt, metadata, title) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      newSession.id, newSession.model, newSession.workspaceId, newSession.mode, newSession.status, newSession.createdAt, newSession.updatedAt, JSON.stringify(newSession.metadata || {}), newSession.title || null
    ]);
    return newSession;
  }

  async updateTitle(id: string, title: string): Promise<Session | null> {
    return this.update(id, { title, updatedAt: new Date().toISOString() });
  }

  async findActiveByWorkspace(workspaceId: string): Promise<Session | null> {
    const result = await this.db.query('sessions', 'SELECT * FROM sessions WHERE workspaceId = ? AND status = ?', [workspaceId, 'active']);
    return (result.rows[0] as Session) || null;
  }

  async updateStatus(id: string, status: Session['status']): Promise<Session | null> {
    return this.update(id, { status, updatedAt: new Date().toISOString() });
  }

  async findByWorkspace(workspaceId: string): Promise<Session[]> {
    const result = await this.db.query('sessions', 'SELECT * FROM sessions WHERE workspaceId = ?', [workspaceId]);
    return result.rows as Session[];
  }
}