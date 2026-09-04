// Database backend implementations
export { SqliteDatabase, SqliteTransaction } from './database.js';
export { PostgresDatabase, createDatabase } from './postgres-database.js';

// Type-only exports
export type { DatabaseConfig, QueryResult, Migration, CacheEntry, Agent } from './database-types.js';
export type { PostgresDatabaseConfig } from './postgres-database.js';

// Union type for consumers handling both backends
import type { SqliteDatabase as _SqliteDB } from './database.js';
import type { PostgresDatabase as _PostgresDB } from './postgres-database.js';
export type DatabaseBackend = _SqliteDB | _PostgresDB;

// Backward compatibility: Database = SqliteDatabase (the default backend)
import { SqliteDatabase } from './database.js';
import { SqliteTransaction } from './database.js';
export { SqliteDatabase as Database, SqliteTransaction as Transaction };

// Repositories
export { BaseRepository } from './repositories/base.repository.js';
export type { Repository } from './repositories/base.repository.js';
export { SessionRepository } from './repositories/session.repository.js';
export type { Session } from './repositories/session.repository.js';
export { MessageRepository } from './repositories/message.repository.js';
export type { Message } from './repositories/message.repository.js';
export { TaskRepository } from './repositories/task.repository.js';
export type { TaskRecord } from './repositories/task.repository.js';
export { ApprovalRepository } from './repositories/approval.repository.js';
export type { ApprovalRecord } from './repositories/approval.repository.js';
export { AuditLogRepository } from './repositories/audit-log.repository.js';
export type { AuditLogRecord } from './repositories/audit-log.repository.js';
export { WorkflowRepository, WorkflowExecutionRepository } from './repositories/workflow.repository.js';
export type { Workflow, WorkflowExecution } from './repositories/workflow.repository.js';

// Migrations
export { migrations } from './migrations/index.js';
export { postgresMigrations } from './migrations/postgres-migrations.js';
