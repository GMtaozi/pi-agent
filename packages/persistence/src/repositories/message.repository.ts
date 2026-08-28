import { BaseRepository } from './base.repository.js';
import { randomUUID } from 'crypto';

export interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system' | 'toolResult';
  content: string;
  artifacts?: Array<{ path: string; type: string; size?: number }>;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export class MessageRepository extends BaseRepository<Message> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  constructor(db: any) {
    super(db, 'messages');
  }

  async create(message: Omit<Message, 'id'> & { id?: string }): Promise<Message> {
    const id = message.id || randomUUID();
    const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const { id: _omit, ...rest } = message as any;
    await this.db.query('messages', 'INSERT INTO messages (id, sessionId, role, content, artifacts, createdAt, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      id, rest.sessionId, rest.role, rest.content, JSON.stringify(rest.artifacts || []), rest.createdAt || now, JSON.stringify(rest.metadata || {})
    ]);
    return { id, ...rest, createdAt: rest.createdAt || now } as Message;
  }

  async updateContent(id: string, content: string, metadata?: Record<string, unknown>): Promise<Message | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    const updated = { ...existing, content, metadata: metadata || existing.metadata };
    const keys = Object.keys(updated).filter(k => k !== 'id');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const values = keys.map(k => (updated as any)[k]);
    const setClause = keys.map(k => k + ' = ?').join(', ');
    const sql = 'UPDATE messages SET ' + setClause + ' WHERE id = ?';
    await this.db.query('messages', sql, [...values, id]);
    return updated;
  }

  async findBySession(sessionId: string): Promise<Message[]> {
    const result = await this.db.query('messages', 'SELECT * FROM messages WHERE sessionId = ? ORDER BY createdAt ASC', [sessionId]);
    return result.rows as Message[];
  }

  async findBySessionAndRole(sessionId: string, role: Message['role']): Promise<Message[]> {
    const result = await this.db.query('messages', 'SELECT * FROM messages WHERE sessionId = ? AND role = ? ORDER BY createdAt ASC', [sessionId, role]);
    return result.rows as Message[];
  }
}