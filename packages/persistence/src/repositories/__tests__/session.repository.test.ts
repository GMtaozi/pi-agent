import { migrations } from '../../migrations/index.js';
import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../../database';
import { SessionRepository } from '../session.repository';

describe('SessionRepository', () => {
  let db: Database;
  let repo: SessionRepository;

  beforeEach(async () => {
    db = new Database({ inMemory: true });
    await db.initialize();
    await db.runMigrations(migrations);
    repo = new SessionRepository(db);
  });

  it('should create a session', async () => {
    const session = await repo.create({
      model: 'gpt-4',
      workspaceId: 'default',
      status: 'active'
    });

    expect(session.id).toBeDefined();
    expect(session.model).toBe('gpt-4');
    expect(session.status).toBe('active');
  });

  it('should find session by id', async () => {
    const created = await repo.create({
      model: 'gpt-4',
      workspaceId: 'default',
      status: 'active'
    });

    const found = await repo.findById(created.id);
    expect(found).toBeDefined();
    expect(found?.model).toBe('gpt-4');
  });

  it('should find active session by workspace', async () => {
    await repo.create({ model: 'gpt-4', workspaceId: 'default', status: 'active' });
    const active = await repo.findActiveByWorkspace('default');
    expect(active).toBeDefined();
    expect(active?.status).toBe('active');
  });

  it('should update session status', async () => {
    const session = await repo.create({
      model: 'gpt-4',
      workspaceId: 'default',
      status: 'active'
    });

    const updated = await repo.updateStatus(session.id, 'completed');
    expect(updated?.status).toBe('completed');
  });
});
