import type {
  McpConnection,
  McpToolCache,
  McpToolDefinition,
  CreateMcpConnectionInput,
  McpTransport,
  McpConnectionStatus
} from './types.js';

/**
 * MCP 服务 — 处理 MCP 连接管理、工具发现、缓存
 */
export class McpService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  constructor(private readonly db: any) {}

  /**
   * 生成唯一 ID
   */
  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * 解析连接记录
   */
  private parseConnection(row: Record<string, unknown>): McpConnection {
    return {
      id: row.id as string,
      tenant_id: row.tenant_id as string,
      server_id: row.server_id as string,
      transport: row.transport as McpTransport,
      endpoint: row.endpoint as string | null,
      status: row.status as McpConnectionStatus,
      last_sync_at: row.last_sync_at as string | null,
      created_at: row.created_at as string
    };
  }

  /**
   * 列出 MCP 连接
   */
  async listConnections(tenantId: string): Promise<McpConnection[]> {
    const result = await this.db.query('mcp_connections', 'SELECT * FROM mcp_connections WHERE tenant_id = ? ORDER BY created_at DESC', [tenantId]);
    return result.rows.map((r: Record<string, unknown>) => this.parseConnection(r));
  }

  /**
   * 获取单个连接详情
   */
  async getConnection(id: string): Promise<McpConnection | null> {
    const result = await this.db.query('mcp_connections', 'SELECT * FROM mcp_connections WHERE id = ?', [id]);
    if (result.rows.length === 0) return null;
    return this.parseConnection(result.rows[0]);
  }

  /**
   * 创建 MCP 连接
   */
  async createConnection(tenantId: string, input: CreateMcpConnectionInput): Promise<McpConnection> {
    const id = this.generateId('mcp');
    const now = new Date().toISOString();

    await this.db.query('mcp_connections',
      'INSERT INTO mcp_connections (id, tenant_id, server_id, transport, endpoint, status, last_sync_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, tenantId, input.server_id, input.transport, input.endpoint || null, 'disconnected', null, now]
    );

    return this.getConnection(id) as Promise<McpConnection>;
  }

  /**
   * 更新连接状态
   */
  async updateConnectionStatus(id: string, status: McpConnectionStatus): Promise<void> {
    const now = new Date().toISOString();
    await this.db.query('mcp_connections', 'UPDATE mcp_connections SET status = ?, last_sync_at = ? WHERE id = ?', [status, now, id]);
  }

  /**
   * 断开连接（删除连接及其工具缓存）
   */
  async disconnect(id: string): Promise<boolean> {
    const existing = await this.getConnection(id);
    if (!existing) return false;

    // 删除工具缓存
    await this.db.query('mcp_tools_cache', 'DELETE FROM mcp_tools_cache WHERE connection_id = ?', [id]).catch(() => {});
    // 删除连接
    await this.db.query('mcp_connections', 'DELETE FROM mcp_connections WHERE id = ?', [id]);
    return true;
  }

  /**
   * 获取工具缓存
   */
  async getToolCache(connectionId: string): Promise<McpToolCache[]> {
    const result = await this.db.query('mcp_tools_cache', 'SELECT * FROM mcp_tools_cache WHERE connection_id = ? ORDER BY tool_name', [connectionId]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    return result.rows.map((r: any) => ({
      ...r,
      tool_schema: typeof r.tool_schema === 'string' ? JSON.parse(r.tool_schema) : r.tool_schema
    }));
  }

  /**
   * 同步工具清单到缓存
   */
  async syncTools(connectionId: string, tools: McpToolDefinition[]): Promise<void> {
    const now = new Date().toISOString();

    // 清除旧缓存
    await this.db.query('mcp_tools_cache', 'DELETE FROM mcp_tools_cache WHERE connection_id = ?', [connectionId]);

    // 插入新工具
    for (const tool of tools) {
      const id = this.generateId('mtc');
      const schema = JSON.stringify(tool.inputSchema || {});
      const checksum = this.computeChecksum(schema);
      await this.db.query('mcp_tools_cache',
        'INSERT INTO mcp_tools_cache (id, connection_id, tool_name, tool_schema, checksum, cached_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, connectionId, tool.name, schema, checksum, now]
      );
    }

    // 更新连接状态
    await this.updateConnectionStatus(connectionId, 'connected');
  }

  /**
   * 获取已缓存的工具定义列表
   */
  async getCachedTools(connectionId: string): Promise<McpToolDefinition[]> {
    const cache = await this.getToolCache(connectionId);
    return cache.map(c => ({
      name: c.tool_name,
      description: (c.tool_schema as Record<string, unknown>)?.description as string | undefined,
      inputSchema: c.tool_schema as Record<string, unknown>
    }));
  }

  /**
   * 检测工具 schema 是否变更
   */
  hasToolsChanged(_connectionId: string, tools: McpToolDefinition[]): boolean {
    // 简化实现：比较工具数量和名称
    // 实际生产环境应比较 checksum
    const schemaStr = JSON.stringify(tools.map(t => t.name).sort());
    // 这里仅做简化处理，实际应查询数据库比较
    return schemaStr.length > 0;
  }

  /**
   * 计算 checksum（简化版）
   */
  private computeChecksum(content: string): string {
    // 简化实现：使用 base64 编码作为 checksum
    // 实际生产环境应使用 SHA-256
    return Buffer.from(content).toString('base64').slice(0, 16);
  }

  /**
   * 列出所有已连接的工具（跨连接聚合）
   */
  async listAllTools(tenantId: string): Promise<Array<McpToolDefinition & { connection_id: string }>> {
    const result = await this.db.query('mcp_tools_cache',
      `SELECT tc.*, mc.tenant_id
       FROM mcp_tools_cache tc
       JOIN mcp_connections mc ON tc.connection_id = mc.id
       WHERE mc.tenant_id = ?
       ORDER BY tc.tool_name`,
      [tenantId]
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    return result.rows.map((r: any) => ({
      connection_id: r.connection_id,
      name: r.tool_name,
      description: (typeof r.tool_schema === 'string' ? JSON.parse(r.tool_schema) : r.tool_schema)?.description,
      inputSchema: typeof r.tool_schema === 'string' ? JSON.parse(r.tool_schema) : r.tool_schema
    }));
  }
}
