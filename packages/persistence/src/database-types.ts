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
  up: (db: any) => Promise<void>;
  down: (db: any) => Promise<void>;
}

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  hits: number;
}
