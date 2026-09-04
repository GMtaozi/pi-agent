import { Logger } from '@workforge/logging';
import SQLite from 'better-sqlite3';
import 'crypto';
import 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface DatabaseConfig {
  path?: string;
  inMemory?: boolean;
}

export interface QueryResult {
  rows: any[];
  rowsAffected: number;
  lastInsertRowId?: number;
}

export interface Migration {
  version: number;
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts any database backend
  up: (db: any) => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts any database backend
  down: (db: any) => Promise<void>;
}

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  hits: number;
}

export class SqliteDatabase {
  private sqlite: SQLite;
  private logger: Logger;
  private config: DatabaseConfig;
  private initialized = false;

  constructor(config: DatabaseConfig = {}) {
    this.config = config;
    this.sqlite = config.inMemory 
      ? new SQLite(':memory:') 
      : new SQLite(config.path || './data/workforge.db');
    this.sqlite.pragma('journal_mode = WAL');
    this.sqlite.pragma('foreign_keys = ON');
    
    this.logger = new Logger({ service: 'persistence', level: 'info' });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    if (!this.config.inMemory && this.config.path) {
      const fs = await import('fs');
      const dir = dirname(this.config.path);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    
    this.initialized = true;
    this.logger.info('Database initialized', { path: this.config.path, inMemory: this.config.inMemory });
  }

  async runMigrations(migrations: Migration[]): Promise<void> {
    this.ensureInitialized();
    
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    
    const applied = new Set(
      this.sqlite.prepare('SELECT version FROM schema_migrations').all().map((r: any) => r.version)
    );
    
    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      this.logger.info('Running migration', { version: migration.version, name: migration.name });
      await migration.up(this);
      this.sqlite.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(migration.version, migration.name);
    }
  }

  async query(table: string, sql: string, params: any[] = []): Promise<QueryResult> {
    this.ensureInitialized();
    const lowerSql = sql.toLowerCase().trim();
    try {
      if (lowerSql.startsWith('select')) {
        return { rows: this.sqlite.prepare(sql).all(...params), rowsAffected: 0 };
      }
      if (lowerSql.startsWith('insert')) {
        const result = this.sqlite.prepare(sql).run(...params);
        return { rows: [], rowsAffected: result.changes, lastInsertRowId: result.lastInsertRowid };
      }
      if (lowerSql.startsWith('update') || lowerSql.startsWith('delete')) {
        const result = this.sqlite.prepare(sql).run(...params);
        return { rows: [], rowsAffected: result.changes };
      }
      this.sqlite.exec(sql);
      return { rows: [], rowsAffected: 0 };
    } catch (error) {
      this.logger.error('Query failed', { table, sql: sql.slice(0, 200), error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async execute(sql: string, params: any[] = []): Promise<QueryResult> {
    return this.query('', sql, params);
  }

  async transaction<T>(callback: (tx: SqliteTransaction) => Promise<T>): Promise<T> {
    this.ensureInitialized();
    const tx = new SqliteTransaction(this);
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const result = await callback(tx);
      this.sqlite.exec('COMMIT');
      return result;
    } catch (error) {
      try { this.sqlite.exec('ROLLBACK'); } catch { /* rollback failure is non-fatal */ }
      throw error;
    }
  }

  async save(): Promise<void> {
    if (!this.config.inMemory) this.sqlite.pragma('wal_checkpoint(TRUNCATE)');
  }

  async close(): Promise<void> {
    if (!this.config.inMemory) await this.save();
    this.sqlite.close();
    this.initialized = false;
  }

  private ensureInitialized() {
    if (!this.initialized) throw new Error('Database not initialized');
  }

  getData(): Record<string, any[]> {
    // P2 Fix: 不再一次性加载全库，改为返回空对象
    // 调用者应使用 query() 按需查询特定表
    console.warn('[deprecated] getData() loads entire DB into memory. Use query() instead.');
    return {};
  }

  setData(table: string, rows: any[]): void {
    this.sqlite.prepare(`DELETE FROM ${table}`).run();
    const stmt = this.sqlite.prepare(`INSERT INTO ${table} VALUES (${rows.map(() => '?').join(',')})`);
    const insertMany = this.sqlite.transaction((rows: any[]) => {
      for (const row of rows) stmt.run(...Object.values(row));
    });
    insertMany(rows);
  }
}

export class SqliteTransaction {
  constructor(private db: SqliteDatabase) {}
  async query(table: string, sql: string, params: any[] = []): Promise<QueryResult> {
    return this.db.query(table, sql, params);
  }
  async execute(sql: string, params: any[] = []): Promise<QueryResult> {
    return this.db.execute(sql, params);
  }
}
