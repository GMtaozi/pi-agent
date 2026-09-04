import type { Migration } from '../database-types.js';

/**
 * M3 P0 — MCP 连接管理：mcp_connections
 *
 * 记录租户与 MCP server 的连接状态，支持 stdio 和 HTTP 两种 transport。
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v40Sqlite: Migration = {
  version: 40,
  name: 'm3-mcp-connections-table',
  up: async (db: any) => {
    await db.query('mcp_connections', `
      CREATE TABLE IF NOT EXISTS mcp_connections (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        server_id TEXT NOT NULL,
        transport TEXT NOT NULL DEFAULT 'stdio',
        endpoint TEXT,
        status TEXT NOT NULL DEFAULT 'disconnected',
        last_sync_at TEXT,
        created_at TEXT NOT NULL
      )
    `);
    await db.query('mcp_connections', 'CREATE INDEX IF NOT EXISTS idx_mcp_connections_tenant ON mcp_connections(tenant_id)');
    await db.query('mcp_connections', 'CREATE INDEX IF NOT EXISTS idx_mcp_connections_server ON mcp_connections(server_id)');
    await db.query('mcp_connections', 'CREATE INDEX IF NOT EXISTS idx_mcp_connections_status ON mcp_connections(status)');
  },
  down: async (db: any) => {
    await db.query('mcp_connections', 'DROP TABLE IF EXISTS mcp_connections');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v40Postgres: Migration = {
  version: 40,
  name: 'm3-mcp-connections-table',
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS mcp_connections (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id TEXT NOT NULL,
        server_id VARCHAR(200) NOT NULL,
        transport VARCHAR(20) NOT NULL DEFAULT 'stdio' CHECK (transport IN ('stdio', 'http', 'sse')),
        endpoint TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error', 'syncing')),
        last_sync_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_mcp_connections_tenant ON mcp_connections(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_mcp_connections_server ON mcp_connections(server_id);
      CREATE INDEX IF NOT EXISTS idx_mcp_connections_status ON mcp_connections(status);
    `);
  },
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS mcp_connections CASCADE;');
  },
};
