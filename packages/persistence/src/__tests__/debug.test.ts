import { migrations } from '../migrations/index.js';
import { describe, it, beforeAll, afterAll } from 'vitest';
import { Database } from '../database';

describe('Database Debug', () => {
  let db: Database;

  beforeAll(async () => {
    db = new Database({ inMemory: true });
    await db.initialize();
    await db.runMigrations(migrations);
    
    // Insert test data
    for (let i = 0; i < 10; i++) {
      await db.query('sessions', 'INSERT INTO sessions (model, workspaceId, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)', 
        ['model-' + i, 'workspace-' + (i % 3), 'active', new Date().toISOString(), new Date().toISOString()]
      );
    }
  });

  afterAll(async () => {
    await db.close();
  });

  it('debug query', async () => {
    const result1 = await db.query('sessions', 'SELECT * FROM sessions');
    console.log('All rows:', result1.rows.length);
    
    const result2 = await db.query('sessions', 'SELECT * FROM sessions WHERE workspaceId = ?', ['workspace-1']);
    console.log('Workspace 1 rows:', result2.rows.length);
    console.log('Workspace 1 rows:', JSON.stringify(result2.rows));
    
    const result3 = await db.query('sessions', 'SELECT * FROM sessions WHERE workspaceId = ? LIMIT 5', ['workspace-1']);
    console.log('Workspace 1 limited rows:', result3.rows.length);
  });
});
