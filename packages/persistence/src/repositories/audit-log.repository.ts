import { BaseRepository } from './base.repository.js';
import { randomUUID } from 'crypto';

export interface AuditLogRecord {
  id: string;
  timestamp: string;
  action: string;
  userId?: string;
  sessionId?: string;
  details: Record<string, unknown>;
  result: 'success' | 'failure' | 'denied';
  error?: string;
}

export class AuditLogRepository extends BaseRepository<AuditLogRecord> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  constructor(db: any) {
    super(db, 'audit_logs');
  }

  async create(log: Omit<AuditLogRecord, 'id' | 'timestamp'>): Promise<AuditLogRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const newLog: AuditLogRecord = {
      id,
      timestamp: now,
      ...log
    };
    await this.db.query('audit_logs', 'INSERT INTO audit_logs (id, timestamp, action, userId, sessionId, details, result, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
      id, now, log.action, log.userId || null, log.sessionId || null, JSON.stringify(log.details), log.result, log.error || null
    ]);
    return newLog;
  }

  async findByAction(action: string, limit = 100): Promise<AuditLogRecord[]> {
    const result = await this.db.query('audit_logs', 'SELECT * FROM audit_logs WHERE action = ? ORDER BY timestamp DESC LIMIT ?', [action, limit]);
    return result.rows as AuditLogRecord[];
  }

  async findByUser(userId: string, limit = 100): Promise<AuditLogRecord[]> {
    const result = await this.db.query('audit_logs', 'SELECT * FROM audit_logs WHERE userId = ? ORDER BY timestamp DESC LIMIT ?', [userId, limit]);
    return result.rows as AuditLogRecord[];
  }
}