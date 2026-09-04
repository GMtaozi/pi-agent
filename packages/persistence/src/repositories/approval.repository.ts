import { BaseRepository } from './base.repository.js';
import { randomUUID } from 'crypto';

export interface ApprovalRecord {
  id: string;
  action: string;
  details: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  reason?: string;
}

export class ApprovalRepository extends BaseRepository<ApprovalRecord> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  constructor(db: any) {
    super(db, 'approvals');
  }

  async create(approval: Omit<ApprovalRecord, 'id'>): Promise<ApprovalRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const newApproval: ApprovalRecord = {
      id,
      ...approval,
      createdAt: now
    };
    await this.db.query('approvals', 'INSERT INTO approvals (id, action, details, status, createdAt, decidedAt, decidedBy, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
      id, approval.action, JSON.stringify(approval.details), approval.status, now, approval.decidedAt || null, approval.decidedBy || null, approval.reason || null
    ]);
    return newApproval;
  }

  async findPending(): Promise<ApprovalRecord[]> {
    const result = await this.db.query('approvals', 'SELECT * FROM approvals WHERE status = ? ORDER BY createdAt ASC', ['pending']);
    return result.rows as ApprovalRecord[];
  }
}