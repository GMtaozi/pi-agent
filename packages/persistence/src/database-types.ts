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

export interface Agent {
  id: string;
  name: string;
  description?: string;
  systemPrompt: string;
  model: string;
  provider?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: string;
  knowledgeBaseIds?: string;
  icon?: string;
  status: 'draft' | 'active' | 'paused';
  tenantId?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: string;
}
