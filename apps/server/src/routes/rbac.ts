import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from './deps.js';
import { RbacService, type Role, type UserRole } from '@workforge/governance';

// 模块级 RBAC 服务实例
let rbacService: RbacService | null = null;
function getRbacService(): RbacService {
  if (!rbacService) rbacService = new RbacService();
  return rbacService;
}

export function registerRbacRoutes(server: FastifyInstance, deps: ServerDeps): void {
  const rbac = getRbacService();

  // 角色列表
  server.get('/api/v1/roles', async (req) => {
    const tenantId = (req as any).tenantId || 'default';
    const result = await deps.database!.query(
      'roles',
      'SELECT * FROM roles WHERE tenant_id = ? ORDER BY created_at DESC',
      [tenantId]
    );
    return result.rows.map((r: any) => ({
      ...r,
      permissions: typeof r.permissions === 'string' ? JSON.parse(r.permissions) : r.permissions,
      builtin: !!r.builtin,
    }));
  });

  // 创建角色
  server.post('/api/v1/roles', async (req, res) => {
    const tenantId = (req as any).tenantId || 'default';
    const body = req.body as { name: string; permissions: any[]; description?: string };
    if (!body.name) {
      return res.status(400).send({ error: 'name is required' });
    }
    const id = `role-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const createdAt = new Date().toISOString();
    await deps.database!.query(
      'roles',
      'INSERT INTO roles (id, tenant_id, name, builtin, permissions, description, created_at) VALUES (?, ?, ?, 0, ?, ?, ?)',
      [id, tenantId, body.name, JSON.stringify(body.permissions || []), body.description || null, createdAt]
    );
    return { id, tenant_id: tenantId, name: body.name, permissions: body.permissions || [], created_at: createdAt };
  });

  // 用户角色列表
  server.get('/api/v1/users/:id/roles', async (req) => {
    const { id: userId } = req.params as { id: string };
    const result = await deps.database!.query(
      'user_roles',
      'SELECT * FROM user_roles WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  });

  // 分配角色
  server.post('/api/v1/users/:id/roles', async (req, res) => {
    const { id: userId } = req.params as { id: string };
    const body = req.body as { role_id: string; scope_type?: string; scope_id?: string };
    if (!body.role_id) {
      return res.status(400).send({ error: 'role_id is required' });
    }
    const id = `ur-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const createdAt = new Date().toISOString();
    await deps.database!.query(
      'user_roles',
      'INSERT INTO user_roles (id, user_id, role_id, scope_type, scope_id, granted_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, userId, body.role_id, body.scope_type || 'global', body.scope_id || null, (req as any).userId || null, createdAt]
    );
    return { id, user_id: userId, role_id: body.role_id, scope_type: body.scope_type || 'global', created_at: createdAt };
  });

  // 部门树
  server.get('/api/v1/departments', async (req) => {
    const tenantId = (req as any).tenantId || 'default';
    const result = await deps.database!.query(
      'departments',
      'SELECT * FROM departments WHERE tenant_id = ? ORDER BY sort_order ASC, created_at ASC',
      [tenantId]
    );
    return result.rows;
  });

  // 创建部门
  server.post('/api/v1/departments', async (req, res) => {
    const tenantId = (req as any).tenantId || 'default';
    const body = req.body as { name: string; parent_id?: string; sort_order?: number };
    if (!body.name) {
      return res.status(400).send({ error: 'name is required' });
    }
    const id = `dept-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const createdAt = new Date().toISOString();
    await deps.database!.query(
      'departments',
      'INSERT INTO departments (id, tenant_id, parent_id, name, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, tenantId, body.parent_id || null, body.name, body.sort_order || 0, createdAt]
    );
    return { id, tenant_id: tenantId, name: body.name, parent_id: body.parent_id, created_at: createdAt };
  });

  // 权限检查
  server.post('/api/v1/rbac/check', async (req) => {
    const userId = (req as any).userId || 'anonymous';
    const body = req.body as { action: string; scope_type?: string; scope_id?: string };
    if (!body.action) {
      return { allowed: false, reason: 'action is required' };
    }

    // 获取用户角色
    const userRolesResult = await deps.database!.query(
      'user_roles',
      'SELECT * FROM user_roles WHERE user_id = ?',
      [userId]
    );
    const userRoles: UserRole[] = userRolesResult.rows;

    // 获取角色定义
    const roleIds = userRoles.map(ur => ur.role_id);
    let roles: Role[] = [];
    if (roleIds.length > 0) {
      const placeholders = roleIds.map(() => '?').join(',');
      const rolesResult = await deps.database!.query(
        'roles',
        `SELECT * FROM roles WHERE id IN (${placeholders})`,
        roleIds
      );
      roles = rolesResult.rows.map((r: any) => ({
        ...r,
        permissions: typeof r.permissions === 'string' ? JSON.parse(r.permissions) : r.permissions,
      }));
    }

    const result = rbac.check(userId, body.action, body.scope_type, body.scope_id, userRoles, roles);
    return result;
  });
}
