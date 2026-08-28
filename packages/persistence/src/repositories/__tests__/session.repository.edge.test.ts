import { migrations } from '../../migrations/index.js';
import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../../database';
import { SessionRepository } from '../session.repository';

describe('SessionRepository Edge Cases', () => {
  let db: Database;
  let repo: SessionRepository;

  beforeEach(async () => {
    db = new Database({ inMemory: true });
    await db.initialize();
    await db.runMigrations(migrations);
    repo = new SessionRepository(db);
  });

  it('should return null when finding non-existent id', async () => {
    const session = await repo.findById('nonexistent');
    expect(session).toBeNull();
  });

  it('should return null when no active session in workspace', async () => {
    await repo.create({ model: 'gpt-4', workspaceId: 'ws1', status: 'active' });
    const active = await repo.findActiveByWorkspace('ws2');
    expect(active).toBeNull();
  });

  it('should return first active session when multiple exist', async () => {
    await repo.create({ model: 'gpt-4', workspaceId: 'default', status: 'active' });
    await repo.create({ model: 'gpt-4o', workspaceId: 'default', status: 'active' });
    
    const active = await repo.findActiveByWorkspace('default');
    expect(active).toBeDefined();
    expect(active?.status).toBe('active');
  });

  it('should return empty array for empty workspace', async () => {
    const sessions = await repo.findByWorkspace('empty');
    expect(sessions).toEqual([]);
  });

  it('should update non-existent session', async () => {
    const result = await repo.updateStatus('nonexistent', 'completed');
    expect(result).toBeNull();
  });

  it('should handle multiple workspaces independently', async () => {
    const session1 = await repo.create({ model: 'gpt-4', workspaceId: 'ws1', status: 'active' });
    const session2 = await repo.create({ model: 'gpt-4', workspaceId: 'ws2', status: 'active' });
    
    const ws1Sessions = await repo.findByWorkspace('ws1');
    const ws2Sessions = await repo.findByWorkspace('ws2');
    
    expect(ws1Sessions).toHaveLength(1);
    expect(ws2Sessions).toHaveLength(1);
    expect(ws1Sessions[0].id).toBe(session1.id);
    expect(ws2Sessions[0].id).toBe(session2.id);
  });

  it('should handle concurrent status updates', async () => {
    const session = await repo.create({ model: 'gpt-4', workspaceId: 'default', status: 'active' });
    
    await repo.updateStatus(session.id, 'completed');
    const result = await repo.updateStatus(session.id, 'failed');
    
    expect(result?.status).toBe('failed');
  });
});
