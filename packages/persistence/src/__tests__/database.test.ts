import { migrations } from '../migrations/index.js';
import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../database';

describe('Database', () => {
  let db: Database;

  beforeEach(async () => {
    db = new Database({ inMemory: true });
    await db.initialize();
    await db.runMigrations(migrations);
  });

  it('should initialize empty database', async () => {
    const data = db.getData();
    expect(data.sessions).toEqual([]);
    expect(data.messages).toEqual([]);
    expect(data.tasks).toEqual([]);
  });

  it('should insert and query data', async () => {
    const result = await db.query('sessions', 'INSERT INTO sessions (id, model) VALUES (?, ?)', ['1', 'gpt-4']);
    expect(result.rowsAffected).toBe(1);
    
    const queryResult = await db.query('sessions', 'SELECT * FROM sessions WHERE id = ?', ['1']);
    expect(queryResult.rows).toHaveLength(1);
    expect(queryResult.rows[0].model).toBe('gpt-4');
  });

  it('should update existing records', async () => {
    await db.query('sessions', 'INSERT INTO sessions (id, model) VALUES (?, ?)', ['1', 'gpt-4']);
    await db.query('sessions', 'UPDATE sessions SET model = ? WHERE id = ?', ['gpt-4o', '1']);
    
    const result = await db.query('sessions', 'SELECT * FROM sessions WHERE id = ?', ['1']);
    expect(result.rows[0].model).toBe('gpt-4o');
  });

  it('should delete records', async () => {
    await db.query('sessions', 'INSERT INTO sessions (id, model) VALUES (?, ?)', ['1', 'gpt-4']);
    const deleteResult = await db.query('sessions', 'DELETE FROM sessions WHERE id = ?', ['1']);
    expect(deleteResult.rowsAffected).toBe(1);
    
    const result = await db.query('sessions', 'SELECT * FROM sessions WHERE id = ?', ['1']);
    expect(result.rows).toHaveLength(0);
  });
});
