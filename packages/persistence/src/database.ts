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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  rows: any[];
  rowsAffected: number;
  lastInsertRowId?: number;
}

export interface Migration {
  version: number;
  name: string;
  up: (db: Database) => Promise<void>;
  down: (db: Database) => Promise<void>;
}

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  hits: number;
}

export class Database {
  private sqlite: SQLite;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  private logger: any;
  private config: DatabaseConfig;
  private initialized = false;

  constructor(config: DatabaseConfig = {}) {
    this.config = config;
    this.sqlite = config.inMemory 
      ? new SQLite(':memory:') 
      : new SQLite(config.path || './data/workforge.db');
    this.sqlite.pragma('journal_mode = WAL');
    this.sqlite.pragma('foreign_keys = ON');
    
    // Simple inline logger
    this.logger = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      info: (msg: string, data?: any) => console.log('[DB]', msg, data || ''),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      warn: (msg: string, data?: any) => console.warn('[DB]', msg, data || ''),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      error: (msg: string, data?: any) => console.error('[DB]', msg, data || ''),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      debug: (msg: string, data?: any) => console.debug('[DB]', msg, data || '')
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // Ensure parent directory exists for file-based DB
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
    
    // Create migrations table if not exists
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    
    const applied = new Set(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      this.sqlite.prepare('SELECT version FROM schema_migrations').all().map((r: any) => r.version)
    );
    
    for (const migration of migrations) {
      if (applied.has(migration.version)) {
        this.logger.info('Migration already applied', { version: migration.version, name: migration.name });
        continue;
      }
      
      this.logger.info('Running migration', { version: migration.version, name: migration.name });
      await migration.up(this);
      
      this.sqlite.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(migration.version, migration.name);
      this.logger.info('Migration completed', { version: migration.version });
    }
    
    this.logger.info('All migrations completed');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  async query(table: string, sql: string, params: any[] = []): Promise<QueryResult> {
    this.ensureInitialized();
    const startTime = Date.now();
    
    try {
      const lowerSql = sql.toLowerCase().trim();
      
      if (lowerSql.startsWith('select')) {
        const stmt = this.sqlite.prepare(sql);
        const rows = stmt.all(...params);
        const duration = Date.now() - startTime;
        this.logger.debug('Query executed', { table, sql, rows: rows.length, duration });
        return { rows, rowsAffected: 0 };
      }
      
      if (lowerSql.startsWith('insert')) {
        const stmt = this.sqlite.prepare(sql);
        const result = stmt.run(...params);
        const duration = Date.now() - startTime;
        this.logger.debug('Insert executed', { table, rowsAffected: result.changes, duration });
        return { rows: [], rowsAffected: result.changes, lastInsertRowId: result.lastInsertRowid };
      }
      
      if (lowerSql.startsWith('update')) {
        const stmt = this.sqlite.prepare(sql);
        const result = stmt.run(...params);
        const duration = Date.now() - startTime;
        this.logger.debug('Update executed', { table, rowsAffected: result.changes, duration });
        return { rows: [], rowsAffected: result.changes };
      }
      
      if (lowerSql.startsWith('delete')) {
        const stmt = this.sqlite.prepare(sql);
        const result = stmt.run(...params);
        const duration = Date.now() - startTime;
        this.logger.debug('Delete executed', { table, rowsAffected: result.changes, duration });
        return { rows: [], rowsAffected: result.changes };
      }
      
      // For other SQL (CREATE, ALTER, etc.)
      this.sqlite.exec(sql);
      return { rows: [], rowsAffected: 0 };
    } catch (error) {
      this.logger.error('Query failed', { table, sql, params, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  async execute(sql: string, params: any[] = []): Promise<QueryResult> {
    return this.query('', sql, params);
  }

  async transaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T> {
    this.ensureInitialized();
    const tx = new Transaction(this);
    // Real transaction: all statements issued through this connection between
    // BEGIN and COMMIT are atomic; any error rolls everything back.
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const result = await callback(tx);
      this.sqlite.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        this.sqlite.exec('ROLLBACK');
      } catch {
        // Transaction was already rolled back (e.g. by an abort) — ignore.
      }
      throw error;
    }
  }

  async save(): Promise<void> {
    // SQLite auto-saves, but we can force a checkpoint
    if (!this.config.inMemory) {
      this.sqlite.pragma('wal_checkpoint(TRUNCATE)');
    }
  }

  async close(): Promise<void> {
    if (!this.config.inMemory) {
      await this.save();
    }
    this.sqlite.close();
    this.initialized = false;
  }

  private ensureInitialized() {
    if (!this.initialized) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  getData(): Record<string, any[]> {
    // Return all tables data for backward compatibility
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const data: Record<string, any[]> = {};
    const tables = this.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name != 'schema_migrations'").all();
    for (const table of tables) {
      data[table.name] = this.sqlite.prepare(`SELECT * FROM ${table.name}`).all();
    }
    return data;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  setData(table: string, rows: any[]): void {
    // Clear and replace data for backward compatibility
    this.sqlite.prepare(`DELETE FROM ${table}`).run();
    const stmt = this.sqlite.prepare(`INSERT INTO ${table} VALUES (${rows.map(() => '?').join(',')})`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const insertMany = this.sqlite.transaction((rows: any[]) => {
      for (const row of rows) {
        stmt.run(...Object.values(row));
      }
    });
    insertMany(rows);
  }
}

export class Transaction {
  private db: Database;
  
  constructor(db: Database) {
    this.db = db;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  async query(table: string, sql: string, params: any[] = []): Promise<QueryResult> {
    return this.db.query(table, sql, params);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  async execute(sql: string, params: any[] = []): Promise<QueryResult> {
    return this.db.execute(sql, params);
  }
}