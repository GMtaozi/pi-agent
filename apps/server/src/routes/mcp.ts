import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from './deps.js';
import { McpService } from '@workforge/plugins';

/**
 * MCP 接入路由
 *
 * GET    /api/v1/mcp/connections           列出 MCP 连接
 * POST   /api/v1/mcp/connections           创建连接
 * GET    /api/v1/mcp/connections/:id       连接详情
 * POST   /api/v1/mcp/connections/:id/sync  同步工具清单
 * DELETE /api/v1/mcp/connections/:id       断开连接
 */
export function registerMcpRoutes(server: FastifyInstance, deps: ServerDeps): void {
  if (!deps.database) return;

  const mcpService = new McpService(deps.database);

  /**
   * 从请求中获取租户 ID（从 JWT 或 header）
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  function getTenantId(req: any): string {
    return req.user?.tenantId || req.headers?.['x-tenant-id'] || 'default';
  }

  // 列出 MCP 连接
  server.get('/api/v1/mcp/connections', async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const connections = await mcpService.listConnections(tenantId);
      return connections;
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to list MCP connections' });
    }
  });

  // 创建 MCP 连接
  server.post('/api/v1/mcp/connections', async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const body = req.body as any;

      if (!body?.server_id) {
        return res.status(400).send({ error: 'server_id is required' });
      }
      if (!body?.transport || !['stdio', 'http', 'sse'].includes(body.transport)) {
        return res.status(400).send({ error: 'transport must be one of: stdio, http, sse' });
      }

      const connection = await mcpService.createConnection(tenantId, {
        server_id: body.server_id,
        transport: body.transport,
        endpoint: body.endpoint
      });

      return { ok: true, connection };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to create MCP connection' });
    }
  });

  // 获取连接详情
  server.get('/api/v1/mcp/connections/:id', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const connection = await mcpService.getConnection(id);
      if (!connection) {
        return res.status(404).send({ error: 'MCP connection not found' });
      }

      // 附带工具缓存
      const tools = await mcpService.getToolCache(id);

      return {
        ...connection,
        tools,
        toolCount: tools.length
      };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to get MCP connection' });
    }
  });

  // 同步工具清单
  server.post('/api/v1/mcp/connections/:id/sync', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const body = req.body as any;

      const connection = await mcpService.getConnection(id);
      if (!connection) {
        return res.status(404).send({ error: 'MCP connection not found' });
      }

      // 更新状态为 syncing
      await mcpService.updateConnectionStatus(id, 'syncing');

      try {
        // 从请求体获取工具列表（实际场景应从 MCP server 发现）
        const tools = body?.tools || [];

        // 同步到缓存
        await mcpService.syncTools(id, tools);

        // 获取更新后的连接状态
        const updated = await mcpService.getConnection(id);
        const cachedTools = await mcpService.getToolCache(id);

        return {
          ok: true,
          connection: updated,
          tools: cachedTools,
          toolCount: cachedTools.length
        };
      } catch (syncErr) {
        // 同步失败，更新状态为 error
        await mcpService.updateConnectionStatus(id, 'error');
        throw syncErr;
      }
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to sync MCP tools' });
    }
  });

  // 断开连接
  server.delete('/api/v1/mcp/connections/:id', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const success = await mcpService.disconnect(id);
      if (!success) {
        return res.status(404).send({ error: 'MCP connection not found' });
      }
      return { ok: true };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to disconnect MCP' });
    }
  });

  // 列出所有已缓存的工具（跨连接聚合）
  server.get('/api/v1/mcp/tools', async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const tools = await mcpService.listAllTools(tenantId);
      return { tools, count: tools.length };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to list MCP tools' });
    }
  });
}
