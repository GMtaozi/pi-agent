import { Logger } from '@workforge/logging';

export type PolicyAction = 'read' | 'write' | 'edit' | 'delete' | 'bash' | 'paid-api' | 'generate_image' | 'generate_video' | 'generate_audio';
export type PolicyLevel = 'do' | 'review' | 'approve' | 'deny';

export interface PolicyRule {
  action: PolicyAction;
  pattern?: string;
  level: PolicyLevel;
  description?: string;
}

export interface PolicyDecision {
  action: PolicyAction;
  level: PolicyLevel;
  allowed: boolean;
  reason?: string;
}

export interface ApprovalRequest {
  id: string;
  action: PolicyAction;
  details: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  reason?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: PolicyAction;
  userId?: string;
  sessionId?: string;
  details: Record<string, unknown>;
  result: 'success' | 'failure' | 'denied';
  error?: string;
}

export class GovernanceService {
  private rules: PolicyRule[] = [
    { action: 'read', level: 'do', description: 'Read files' },
    { action: 'write', level: 'do', description: 'Write files' },
    { action: 'edit', level: 'do', description: 'Edit files' },
    { action: 'delete', level: 'approve', description: 'Delete files requires approval' },
    { action: 'bash', level: 'review', description: 'Bash commands require review' },
    { action: 'paid-api', level: 'approve', description: 'Paid API calls require approval' },
    { action: 'generate_image', level: 'approve', description: 'Image generation requires approval' },
    { action: 'generate_video', level: 'approve', description: 'Video generation requires approval' },
    { action: 'generate_audio', level: 'approve', description: 'Audio generation requires approval' }
  ];

  private approvals = new Map<string, ApprovalRequest>();
  private auditLog: AuditLogEntry[] = [];
  private readonly maxAuditLogSize = 10000;
  private logger: Logger;

  constructor() {
    this.logger = new Logger({ service: 'governance', level: 'info' });
  }

  evaluate(action: PolicyAction, _context?: Record<string, unknown>): PolicyDecision {
    const rule = this.rules.find(r => r.action === action) || { action, level: 'deny' as PolicyLevel };
    const allowed = rule.level !== 'deny';
    
    const decision: PolicyDecision = {
      action,
      level: rule.level,
      allowed,
      reason: allowed ? undefined : 'Action denied by policy'
    };

    this.logger.info('Policy evaluated', { action, level: rule.level, allowed });
    return decision;
  }

  async requestApproval(action: PolicyAction, details: Record<string, unknown>): Promise<ApprovalRequest> {
    const id = 'approval-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const request: ApprovalRequest = {
      id,
      action,
      details,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    this.approvals.set(id, request);
    this.logger.info('Approval requested', { id, action });

    // In real implementation, this would send notification to approvers
    return request;
  }

  approveRequest(id: string, decidedBy: string, reason?: string): boolean {
    const request = this.approvals.get(id);
    if (!request || request.status !== 'pending') {
      return false;
    }

    request.status = 'approved';
    request.decidedAt = new Date().toISOString();
    request.decidedBy = decidedBy;
    request.reason = reason;

    this.logger.info('Approval granted', { id, decidedBy });
    return true;
  }

  rejectRequest(id: string, decidedBy: string, reason: string): boolean {
    const request = this.approvals.get(id);
    if (!request || request.status !== 'pending') {
      return false;
    }

    request.status = 'rejected';
    request.decidedAt = new Date().toISOString();
    request.decidedBy = decidedBy;
    request.reason = reason;

    this.logger.info('Approval rejected', { id, decidedBy, reason });
    return true;
  }

  getPendingApprovals(): ApprovalRequest[] {
    return Array.from(this.approvals.values()).filter(a => a.status === 'pending');
  }

  getApprovals(): ApprovalRequest[] {
    return Array.from(this.approvals.values());
  }

  getApproval(id: string): ApprovalRequest | undefined {
    return this.approvals.get(id);
  }

  logAudit(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): void {
    const logEntry: AuditLogEntry = {
      id: 'audit-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      timestamp: new Date().toISOString(),
      ...entry
    };

    this.auditLog.push(logEntry);

    // Trim old entries
    if (this.auditLog.length > this.maxAuditLogSize) {
      this.auditLog = this.auditLog.slice(-this.maxAuditLogSize);
    }

    this.logger.info('Audit log entry', { id: logEntry.id, action: entry.action, result: entry.result });
  }

  getAuditLog(limit = 100, offset = 0): AuditLogEntry[] {
    return this.auditLog.slice(-limit - offset, -offset || undefined);
  }

  getAuditLogByAction(action: PolicyAction, limit = 100): AuditLogEntry[] {
    return this.auditLog.filter(e => e.action === action).slice(-limit);
  }

  getAuditLogByUser(userId: string, limit = 100): AuditLogEntry[] {
    return this.auditLog.filter(e => e.userId === userId).slice(-limit);
  }

  addRule(rule: PolicyRule): void {
    this.rules.push(rule);
    this.logger.info('Policy rule added', { action: rule.action, level: rule.level });
  }

  removeRule(action: PolicyAction): void {
    this.rules = this.rules.filter(r => r.action !== action);
    this.logger.info('Policy rule removed', { action });
  }

  listRules(): PolicyRule[] {
    return [...this.rules];
  }
}
