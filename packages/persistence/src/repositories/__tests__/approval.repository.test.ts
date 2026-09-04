import { migrations } from '../../migrations/index.js';
import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../../database';
import { ApprovalRepository } from '../approval.repository';
import { AuditLogRepository } from '../audit-log.repository';

describe('ApprovalRepository', () => {
  let db: Database;
  let repo: ApprovalRepository;

  beforeEach(async () => {
    db = new Database({ inMemory: true });
    await db.initialize();
    await db.runMigrations(migrations);
    repo = new ApprovalRepository(db);
  });

  it('should create an approval request', async () => {
    const approval = await repo.create({
      action: 'file_write',
      details: { path: '/tmp/test.txt', content: 'hello' },
      status: 'pending'
    });

    expect(approval.id).toBeDefined();
    expect(approval.status).toBe('pending');
    expect(approval.decidedAt).toBeUndefined();
  });





  it('should find pending approvals', async () => {
    await repo.create({ action: 'a1', details: {}, status: 'pending' });
    await repo.create({ action: 'a2', details: {}, status: 'pending' });
    await repo.create({ action: 'a3', details: {}, status: 'approved' });

    const pending = await repo.findPending();
    expect(pending).toHaveLength(2);
  });


});

describe('AuditLogRepository', () => {

describe('AuditLogRepository', () => {
  let db: Database;
  let repo: AuditLogRepository;

  beforeEach(async () => {
    db = new Database({ inMemory: true });
    await db.initialize();
    await db.runMigrations(migrations);
    repo = new AuditLogRepository(db);
  });

  it('should create an audit log', async () => {
    const log = await repo.create({
      action: 'file_read',
      details: { path: '/tmp/test.txt' },
      result: 'success'
    });

    expect(log.id).toBeDefined();
    expect(log.action).toBe('file_read');
    expect(log.result).toBe('success');
    expect(log.timestamp).toBeDefined();
  });

  it('should create audit log with user and session', async () => {
    const log = await repo.create({
      action: 'login',
      userId: 'user-1',
      sessionId: 'session-1',
      details: { ip: '127.0.0.1' },
      result: 'success'
    });

    expect(log.userId).toBe('user-1');
    expect(log.sessionId).toBe('session-1');
  });

  it('should create audit log with error', async () => {
    const log = await repo.create({
      action: 'api_call',
      details: { endpoint: '/test' },
      result: 'failure',
      error: 'timeout'
    });

    expect(log.result).toBe('failure');
    expect(log.error).toBe('timeout');
  });

  it('should find logs by action', async () => {
    await repo.create({ action: 'login', details: {}, result: 'success' });
    await repo.create({ action: 'logout', details: {}, result: 'success' });
    await repo.create({ action: 'login', details: {}, result: 'failure' });

    const logs = await repo.findByAction('login');
    expect(logs).toHaveLength(2);
    expect(logs.every(l => l.action === 'login')).toBe(true);
  });

  it('should find logs by user', async () => {
    await repo.create({ action: 'login', userId: 'user-1', details: {}, result: 'success' });
    await repo.create({ action: 'login', userId: 'user-2', details: {}, result: 'success' });
    await repo.create({ action: 'login', userId: 'user-1', details: {}, result: 'failure' });

    const logs = await repo.findByUser('user-1');
    expect(logs).toHaveLength(2);
    expect(logs.every(l => l.userId === 'user-1')).toBe(true);
  });



});
});
