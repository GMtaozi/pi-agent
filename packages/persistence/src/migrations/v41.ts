import type { Migration } from '../database-types.js';

/**
 * M3 P0 — MCP 工具缓存：mcp_tools_cache
 *
 * 缓存 MCP server 发现的工具清单，避免每次请求都重新发现。
 * checksum 用于检测工具 schema 变更。
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v41Sqlite: Migration = {
  version: 41,
  name: 'm3-mcp-tools-cache-table',
  up: async (db: any) => {
    await db.query('mcp_tools_cache', `
      CREATE TABLE IF NOT EXISTS mcp_tools_cache (
        id TEXT PRIMARY KEY,
        connection_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        tool_schema TEXT NOT NULL DEFAULT '{}',
        checksum TEXT,
        cached_at TEXT NOT NULL,
        FOREIGN KEY (connection_id) REFERENCES mcp_connections(id) ON DELETE CASCADE
      )
    `);
    await db.query('mcp_tools_cache', 'CREATE INDEX IF NOT EXISTS idx_mcp_tools_cache_connection ON mcp_tools_cache(connection_id)');
    await db.query('mcp_tools_cache', 'CREATE INDEX IF NOT EXISTS idx_mcp_tools_cache_name ON mcp_tools_cache(tool_name)');
    await db.query('mcp_tools_cache', 'CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_tools_cache_unique ON mcp_tools_cache(connection_id, tool_name)');
  },
  down: async (db: any) => {
    await db.query('mcp_tools_cache', 'DROP TABLE IF EXISTS mcp_tools_cache');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v41Postgres: Migration = {
  version: 41,
  name: 'm3-mcp-tools-cache-table',
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS mcp_tools_cache (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        connection_id UUID NOT NULL REFERENCES mcp_connections(id) ON DELETE CASCADE,
        tool_name VARCHAR(200) NOT NULL,
        tool_schema JSONB NOT NULL DEFAULT '{}',
        checksum VARCHAR(64),
        cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_mcp_tools_cache_connection ON mcp_tools_cache(connection_id);
      CREATE INDEX IF NOT EXISTS idx_mcp_tools_cache_name ON mcp_tools_cache(tool_name);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_tools_cache_unique ON mcp_tools_cache(connection_id, tool_name);
    `);
  },
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS mcp_tools_cache CASCADE;');
  },
};
