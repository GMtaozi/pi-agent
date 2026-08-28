import { migrations } from '../../migrations/index.js';
import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../../database';
import { ApprovalRepository } from '../approval.repository';

describe('ApprovalRepository Edge Cases', () => {
  let db: Database;
  let repo: ApprovalRepository;

  beforeEach(async () => {
    db = new Database({ inMemory: true });
    await db.initialize();
    await db.runMigrations(migrations);
    repo = new ApprovalRepository(db);
  });





  it('should return empty array when no pending approvals', async () => {
    await repo.create({ action: 'a1', details: {}, status: 'approved' });
    const pending = await repo.findPending();
    expect(pending).toEqual([]);
  });





  it('should handle multiple pending approvals ordered by createdAt', async () => {
    const a1 = await repo.create({ action: 'a1', details: {}, status: 'pending' });
    await new Promise(resolve => setTimeout(resolve, 10));
    const a2 = await repo.create({ action: 'a2', details: {}, status: 'pending' });
    
    const pending = await repo.findPending();
    expect(pending).toHaveLength(2);
    expect(pending[0].id).toBe(a1.id);
    expect(pending[1].id).toBe(a2.id);
  });

  it('should handle minimal approval creation', async () => {
    const approval = await repo.create({
      action: 'minimal',
      details: {},
      status: 'pending'
    });
    
    expect(approval.id).toBeDefined();
    expect(approval.action).toBe('minimal');
    expect(approval.status).toBe('pending');
    expect(approval.decidedAt).toBeUndefined();
  });
});
