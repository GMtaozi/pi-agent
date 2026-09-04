import { migrations } from '../../migrations/index.js';
import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../../database';

describe('Database Edge Cases', () => {
  let db: Database;

  beforeEach(async () => {
    db = new Database({ inMemory: true });
    await db.initialize();
    await db.runMigrations(migrations);
  });

  it('should throw when querying a non-existent table', async () => {
    await expect(db.query('nonexistent', 'SELECT * FROM nonexistent')).rejects.toThrow();
  });

  it('should update non-existent record', async () => {
    await db.query('sessions', 'INSERT INTO sessions (id, model, workspaceId, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)', ['exists', 'gpt-4', 'default', 'active', new Date().toISOString(), new Date().toISOString()]);
    
    const result = await db.query('sessions', 'UPDATE sessions SET model = ? WHERE id = ?', ['gpt-4o', 'nonexistent']);
    expect(result.rowsAffected).toBe(0);
    
    const unchanged = await db.query('sessions', 'SELECT * FROM sessions WHERE id = ?', ['exists']);
    expect(unchanged.rows[0].model).toBe('gpt-4');
  });

  it('should delete non-existent record', async () => {
    await db.query('sessions', 'INSERT INTO sessions (id, model, workspaceId, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)', ['exists', 'gpt-4', 'default', 'active', new Date().toISOString(), new Date().toISOString()]);
    
    const result = await db.query('sessions', 'DELETE FROM sessions WHERE id = ?', ['nonexistent']);
    expect(result.rowsAffected).toBe(0);
    
    const remaining = await db.query('sessions', 'SELECT * FROM sessions');
    expect(remaining.rows).toHaveLength(1);
  });

  it('should handle empty database queries', async () => {
    const result = await db.query('sessions', 'SELECT * FROM sessions');
    expect(result.rows).toEqual([]);
    expect(result.rowsAffected).toBe(0);
  });

  it('should handle WHERE with no params', async () => {
    await db.query('sessions', 'INSERT INTO sessions (id, model, workspaceId, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)', ['1', 'gpt-4', 'default', 'active', new Date().toISOString(), new Date().toISOString()]);
    
    const result = await db.query('sessions', 'SELECT * FROM sessions WHERE workspaceId = ?', ['default']);
    expect(result.rows).toHaveLength(1);
  });

  it('should handle multiple WHERE conditions', async () => {
    await db.query('sessions', 'INSERT INTO sessions (id, model, workspaceId, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)', ['1', 'gpt-4', 'ws1', 'active', new Date().toISOString(), new Date().toISOString()]);
    await db.query('sessions', 'INSERT INTO sessions (id, model, workspaceId, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)', ['2', 'gpt-4', 'ws1', 'inactive', new Date().toISOString(), new Date().toISOString()]);
    await db.query('sessions', 'INSERT INTO sessions (id, model, workspaceId, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)', ['3', 'gpt-4o', 'ws2', 'active', new Date().toISOString(), new Date().toISOString()]);
    
    const result = await db.query('sessions', 'SELECT * FROM sessions WHERE workspaceId = ? AND status = ?', ['ws1', 'active']);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].id).toBe('1');
  });

  it('should handle DELETE with multiple matching rows', async () => {
    await db.query('sessions', 'INSERT INTO sessions (id, model, workspaceId, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)', ['1', 'gpt-4', 'ws1', 'active', new Date().toISOString(), new Date().toISOString()]);
    await db.query('sessions', 'INSERT INTO sessions (id, model, workspaceId, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)', ['2', 'gpt-4', 'ws1', 'active', new Date().toISOString(), new Date().toISOString()]);
    
    const result = await db.query('sessions', 'DELETE FROM sessions WHERE workspaceId = ? AND status = ?', ['ws1', 'active']);
    expect(result.rowsAffected).toBe(2);
  });

  it('should handle LIMIT with value larger than dataset', async () => {
    for (let i = 0; i < 3; i++) {
      await db.query('sessions', 'INSERT INTO sessions (id, model, workspaceId, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)', [String(i), 'gpt-4', 'default', 'active', new Date().toISOString(), new Date().toISOString()]);
    }
    
    const result = await db.query('sessions', 'SELECT * FROM sessions LIMIT 10');
    expect(result.rows).toHaveLength(3);
  });

  it('should handle OFFSET beyond dataset', async () => {
    for (let i = 0; i < 3; i++) {
      await db.query('sessions', 'INSERT INTO sessions (id, model, workspaceId, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)', [String(i), 'gpt-4', 'default', 'active', new Date().toISOString(), new Date().toISOString()]);
    }
    
    const result = await db.query('sessions', 'SELECT * FROM sessions LIMIT 10 OFFSET 5');
    expect(result.rows).toHaveLength(0);
  });

  it('should handle LIMIT with OFFSET beyond dataset after inserts', async () => {
    for (let i = 0; i < 3; i++) {
      await db.query('sessions', 'INSERT INTO sessions (id, model, workspaceId, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)', [
        String(i), 'gpt-4', 'default', 'active', new Date().toISOString(), new Date().toISOString()
      ]);
    }

    const result = await db.query('sessions', 'SELECT * FROM sessions LIMIT 10 OFFSET 10');
    expect(result.rows).toHaveLength(0);
  });
});