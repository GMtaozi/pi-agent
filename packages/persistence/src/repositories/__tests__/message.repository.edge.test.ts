import { migrations } from '../../migrations/index.js';
import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../../database';
import { MessageRepository } from '../message.repository';

describe('MessageRepository Edge Cases', () => {
  let db: Database;
  let repo: MessageRepository;

  beforeEach(async () => {
    db = new Database({ inMemory: true });
    await db.initialize();
    await db.runMigrations(migrations);
    // messages.sessionId carries a FOREIGN KEY to sessions — seed the parents.
    await db.query('sessions', "INSERT INTO sessions (id, status, createdAt, updatedAt) VALUES ('s1','active','',''), ('s2','active','','')");
    repo = new MessageRepository(db);
  });

  it('should return empty array for non-existent session', async () => {
    const messages = await repo.findBySession('nonexistent');
    expect(messages).toEqual([]);
  });

  it('should return empty array for session with no messages', async () => {
    const messages = await repo.findBySession('empty-session');
    expect(messages).toEqual([]);
  });

  it('should handle messages with same timestamp ordering', async () => {
    const msg1 = await repo.create({ sessionId: 's1', role: 'user', content: 'First' });
    await new Promise(resolve => setTimeout(resolve, 10));
    const msg2 = await repo.create({ sessionId: 's1', role: 'assistant', content: 'Second' });
    
    const messages = await repo.findBySession('s1');
    expect(messages).toHaveLength(2);
    expect(messages[0].id).toBe(msg1.id); // Ordered by createdAt ASC
    expect(messages[1].id).toBe(msg2.id);
  });






  it('should handle message with empty content', async () => {
    const message = await repo.create({
      sessionId: 's1',
      role: 'system',
      content: ''
    });
    
    expect(message.content).toBe('');
  });

  it('should handle message with metadata', async () => {
    const message = await repo.create({
      sessionId: 's1',
      role: 'assistant',
      content: 'Test',
      metadata: { model: 'gpt-4', tokens: 100 }
    });
    
    expect(message.metadata).toEqual({ model: 'gpt-4', tokens: 100 });
  });

  it('should handle message with complex artifacts', async () => {
    const message = await repo.create({
      sessionId: 's1',
      role: 'assistant',
      content: 'Here are files',
      artifacts: [
        { path: '/tmp/a.txt', type: 'text/plain', size: 100 },
        { path: '/tmp/b.png', type: 'image/png', size: 2048 },
        { path: '/tmp/c.json', type: 'application/json' }
      ]
    });
    
    expect(message.artifacts).toHaveLength(3);
    expect(message.artifacts?.[0].size).toBe(100);
    expect(message.artifacts?.[2].size).toBeUndefined();
  });

  it('should isolate messages between sessions', async () => {
    await repo.create({ sessionId: 's1', role: 'user', content: 'Hello' });
    await repo.create({ sessionId: 's2', role: 'user', content: 'Hi' });
    await repo.create({ sessionId: 's1', role: 'assistant', content: 'Hey' });
    
    const s1Messages = await repo.findBySession('s1');
    const s2Messages = await repo.findBySession('s2');
    
    expect(s1Messages).toHaveLength(2);
    expect(s2Messages).toHaveLength(1);
  });
});
