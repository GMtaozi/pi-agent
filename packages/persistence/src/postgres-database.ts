import pg from 'pg';
const { Pool } = pg;
import type { DatabaseConfig, Migration } from './database-types.js';
import type { QueryResult } from './database.js';
import { SqliteDatabase } from './database.js';

export interface PostgresDatabaseConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean;
  max?: number;
}

function convertPlaceholders(sql: string): string {
  let paramIndex = 0;
  let result = '';
  let i = 0;
  while (i < sql.length) {
    if (sql[i] === '?') {
      if (i + 1 < sql.length && sql[i + 1] === '?') {
        result += '?';
        i += 2;
      } else {
        ++paramIndex;
        result += `$${paramIndex}`;
        ++i;
      }
    } else if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i];
      result += sql[i];
      ++i;
      while (i < sql.length && sql[i] !== quote) {
        if (sql[i] === '\\' && i + 1 < sql.length) {
          result += sql[i] + sql[i + 1];
          i += 2;
        } else {
          result += sql[i];
          ++i;
        }
      }
      if (i < sql.length) {
        result += sql[i];
        ++i;
      }
    } else {
      result += sql[i];
      ++i;
    }
  }
  return result;
}

export class PostgresDatabase {
  public readonly driver = 'postgres' as const;
  private pool: pg.Pool | null = null;
  private config: PostgresDatabaseConfig;
  private initialized = false;
  private logger: any;

  constructor(config: PostgresDatabaseConfig = {}) {
    this.config = config;
    this.logger = {
      info: (msg: string, data?: any) => console.log('[PG]', msg, data || ''),
      warn: (msg: string, data?: any) => console.warn('[PG]', msg, data || ''),
      error: (msg: string, data?: any) => console.error('[PG]', msg, data || ''),
      debug: (msg: string, data?: any) => console.debug('[PG]', msg, data || ''),
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const connectionString =
      this.config.connectionString ||
      process.env.DATABASE_URL ||
      `postgres://${this.config.user || 'workforge'}:${this.config.password || ''}@${this.config.host || 'localhost'}:${this.config.port || 5432}/${this.config.database || 'workforge'}`;

    this.pool = new Pool({
      connectionString,
      max: this.config.max || 20,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    const client = await this.pool.connect();
    try {
      const res = await client.query('SELECT version()');
      this.logger.info('PostgreSQL connected', { version: res.rows[0]?.version });
    } finally {
      client.release();
    }

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    this.initialized = true;
    this.logger.info('PostgreSQL database initialized');
  }

  async runMigrations(migrations: Migration[]): Promise<void> {
    this.ensureInitialized();

    const client = await this.pool!.connect();
    try {
      const applied = new Set<number>();
      const res = await client.query('SELECT version FROM schema_migrations');
      for (const row of res.rows) {
        applied.add(Number(row.version));
      }

      for (const migration of migrations) {
        if (applied.has(migration.version)) {
          this.logger.info('Migration already applied', { version: migration.version, name: migration.name });
          continue;
        }

        this.logger.info('Running migration', { version: migration.version, name: migration.name });
        await client.query('BEGIN');
        try {
          await migration.up(this as any);
          await client.query(
            'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
            [migration.version, migration.name]
          );
          await client.query('COMMIT');
          this.logger.info('Migration completed', { version: migration.version });
        } catch (err) {
          await client.query('ROLLBACK');
          this.logger.error('Migration failed', { version: migration.version, error: err });
          throw err;
        }
      }

      this.logger.info('All migrations completed');
    } finally {
      client.release();
    }
  }

  async query(table: string, sql: string, params: any[] = []): Promise<QueryResult> {
    this.ensureInitialized();
    const startTime = Date.now();

    const pgSql = convertPlaceholders(sql);
    try {
      const res = await this.pool!.query(pgSql, params);
      const duration = Date.now() - startTime;
      this.logger.debug('Query executed', { table, duration, rows: res.rowCount });

      return {
        rows: res.rows,
        rowsAffected: res.rowCount || 0,
        lastInsertRowId: res.rows[0]?.id ? Number(res.rows[0].id) : undefined,
      };
    } catch (error) {
      this.logger.error('Query failed', { table, sql: pgSql, params, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async execute(sql: string, params: any[] = []): Promise<QueryResult> {
    return this.query('', sql, params);
  }

  async transaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    this.ensureInitialized();
    const client = await this.pool!.connect();

    try {
      await client.query('BEGIN');
      const tx = new PostgresTransaction(client);
      const result = await callback(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally {
      client.release();
    }
  }

  async save(): Promise<void> {}

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.initialized = false;
      this.logger.info('PostgreSQL pool closed');
    }
  }

  getData(): Record<string, any[]> {
    throw new Error('getData() is not supported on PostgreSQL. Use query() directly.');
  }

  setData(_table: string, _rows: any[]): void {
    throw new Error('setData() is not supported on PostgreSQL. Use query() directly.');
  }

  getPool(): pg.Pool {
    this.ensureInitialized();
    return this.pool!;
  }

  private ensureInitialized() {
    if (!this.initialized || !this.pool) {
      throw new Error('PostgreSQL database not initialized. Call initialize() first.');
    }
  }
}

class PostgresTransaction {
  constructor(private client: pg.PoolClient) {}

  async query(table: string, sql: string, params: any[] = []): Promise<QueryResult> {
    const pgSql = convertPlaceholders(sql);
    const res = await this.client.query(pgSql, params);
    return {
      rows: res.rows,
      rowsAffected: res.rowCount || 0,
      lastInsertRowId: res.rows[0]?.id ? Number(res.rows[0].id) : undefined,
    };
  }

  async execute(sql: string, params: any[] = []): Promise<QueryResult> {
    return this.query('', sql, params);
  }
}

export function createDatabase(
  config: DatabaseConfig | PostgresDatabaseConfig = {}
): SqliteDatabase | PostgresDatabase {
  const driver = (process.env.DB_DRIVER || 'sqlite').toLowerCase();
  if (driver === 'postgres') {
    return new PostgresDatabase(config as PostgresDatabaseConfig);
  }
  return new SqliteDatabase(config as DatabaseConfig);
}
