import { migrations } from '../../migrations/index.js';
import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../../database';
import { MessageRepository } from '../message.repository';

describe('MessageRepository', () => {
  let db: Database;
  let repo: MessageRepository;

  beforeEach(async () => {
    db = new Database({ inMemory: true });
    await db.initialize();
    await db.runMigrations(migrations);
    // messages.sessionId carries a FOREIGN KEY to sessions — seed the parents.
    await db.query('sessions', "INSERT INTO sessions (id, status, createdAt, updatedAt) VALUES ('session-1','active','',''), ('session-2','active','','')");
    repo = new MessageRepository(db);
  });

  it('should create a message', async () => {
    const message = await repo.create({
      sessionId: 'session-1',
      role: 'user',
      content: 'Hello'
    });

    expect(message.id).toBeDefined();
    expect(message.role).toBe('user');
    expect(message.content).toBe('Hello');
  });

  it('should create message with artifacts', async () => {
    const message = await repo.create({
      sessionId: 'session-1',
      role: 'assistant',
      content: 'Here is the file',
      artifacts: [{ path: '/tmp/file.txt', type: 'text/plain', size: 1024 }]
    });

    expect(message.artifacts).toHaveLength(1);
    expect(message.artifacts?.[0].path).toBe('/tmp/file.txt');
  });

  it('should find messages by session', async () => {
    await repo.create({ sessionId: 'session-1', role: 'user', content: 'Hello' });
    await repo.create({ sessionId: 'session-2', role: 'user', content: 'Hi' });

    const messages = await repo.findBySession('session-1');
    expect(messages).toHaveLength(1);
    expect(messages[0].sessionId).toBe('session-1');
  });



});
