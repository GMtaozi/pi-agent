import { migrations } from '../../migrations/index.js';
import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../../database';
import { AuditLogRepository } from '../audit-log.repository';

describe('AuditLogRepository Edge Cases', () => {
  let db: Database;
  let repo: AuditLogRepository;

  beforeEach(async () => {
    db = new Database({ inMemory: true });
    await db.initialize();
    await db.runMigrations(migrations);
    repo = new AuditLogRepository(db);
  });

  it('should return empty array for non-existent action', async () => {
    const logs = await repo.findByAction('nonexistent');
    expect(logs).toEqual([]);
  });

  it('should return empty array for non-existent user', async () => {
    const logs = await repo.findByUser('nonexistent');
    expect(logs).toEqual([]);
  });





  it('should limit results correctly', async () => {
    for (let i = 0; i < 10; i++) {
      await repo.create({ action: 'action1', details: { i }, result: 'success' });
    }
    
    const logs = await repo.findByAction('action1', 5);
    expect(logs).toHaveLength(5);
  });

  it('should handle all three result types', async () => {
    const success = await repo.create({ action: 'test', details: {}, result: 'success' });
    const failure = await repo.create({ action: 'test', details: {}, result: 'failure' });
    const denied = await repo.create({ action: 'test', details: {}, result: 'denied' });
    
    expect(success.result).toBe('success');
    expect(failure.result).toBe('failure');
    expect(denied.result).toBe('denied');
  });

  it('should handle log without optional fields', async () => {
    const log = await repo.create({
      action: 'minimal',
      details: {},
      result: 'success'
    });
    
    expect(log.userId).toBeUndefined();
    expect(log.sessionId).toBeUndefined();
    expect(log.error).toBeUndefined();
  });


  it('should find logs by multiple users independently', async () => {
    await repo.create({ action: 'login', userId: 'user1', details: {}, result: 'success' });
    await repo.create({ action: 'login', userId: 'user2', details: {}, result: 'success' });
    await repo.create({ action: 'login', userId: 'user1', details: {}, result: 'failure' });
    
    const user1Logs = await repo.findByUser('user1');
    const user2Logs = await repo.findByUser('user2');
    
    expect(user1Logs).toHaveLength(2);
    expect(user2Logs).toHaveLength(1);
  });

  it('should handle empty details object', async () => {
    const log = await repo.create({
      action: 'test',
      details: {},
      result: 'success'
    });
    
    expect(log.details).toEqual({});
  });
});
