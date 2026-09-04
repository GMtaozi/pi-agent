import { Logger } from '@workforge/logging';

export interface Role {
  id: string;
  tenant_id: string;
  name: string;
  builtin: boolean;
  permissions: RolePermission[];
  description?: string;
  created_at: string;
}

export interface RolePermission {
  action: string;
  effect: 'allow' | 'deny';
  scope_type?: string;
  scope_id?: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role_id: string;
  scope_type: string;
  scope_id?: string;
  granted_by?: string;
  created_at: string;
}

export interface RbacCheckResult {
  allowed: boolean;
  reason?: string;
  matched_role?: string;
}

/**
 * RBAC 判定引擎（零信任模型）
 *
 * 判定优先级：
 *   1. 显式 DENY 最高优先级（覆盖一切 ALLOW）
 *   2. 显式 ALLOW（scope 匹配）
 *   3. 默认 deny（无匹配规则时拒绝）
 */
export class RbacService {
  private logger: Logger;

  constructor() {
    this.logger = new Logger({ service: 'rbac', level: 'info' });
  }

  /**
   * 检查用户是否具有指定权限
   *
   * @param userId 用户 ID
   * @param action 操作类型
   * @param scopeType 范围类型（可选）
   * @param scopeId 范围 ID（可选）
   * @param userRoles 用户角色关联列表
   * @param roles 角色定义列表
   */
  check(
    userId: string,
    action: string,
    scopeType?: string,
    scopeId?: string,
    userRoles: UserRole[] = [],
    roles: Role[] = []
  ): RbacCheckResult {
    // 零信任：默认 deny
    let allowed = false;
    let matchedRole: string | undefined;
    let hasExplicitDeny = false;
    let hasExplicitAllow = false;

    for (const userRole of userRoles) {
      const role = roles.find(r => r.id === userRole.role_id);
      if (!role) continue;

      for (const perm of role.permissions) {
        if (perm.action !== action && perm.action !== '*') continue;

        // scope 匹配检查
        if (scopeType && perm.scope_type && perm.scope_type !== 'global') {
          if (perm.scope_type !== scopeType) continue;
          if (scopeId && perm.scope_id && perm.scope_id !== scopeId) continue;
        }

        // userRole 级别 scope 检查
        if (userRole.scope_type !== 'global') {
          if (scopeType && userRole.scope_type !== scopeType) continue;
          if (scopeId && userRole.scope_id && userRole.scope_id !== scopeId) continue;
        }

        if (perm.effect === 'deny') {
          hasExplicitDeny = true;
          matchedRole = role.name;
        } else if (perm.effect === 'allow') {
          hasExplicitAllow = true;
          if (!matchedRole) matchedRole = role.name;
        }
      }
    }

    // 显式 DENY 优先于 ALLOW
    if (hasExplicitDeny) {
      allowed = false;
    } else if (hasExplicitAllow) {
      allowed = true;
    }

    const result: RbacCheckResult = {
      allowed,
      matched_role: matchedRole,
      reason: allowed
        ? `Allowed by role: ${matchedRole}`
        : hasExplicitDeny
          ? `Explicitly denied by role: ${matchedRole}`
          : 'No matching permission found (default deny)',
    };

    this.logger.info('RBAC check', {
      userId,
      action,
      scopeType,
      scopeId,
      allowed: result.allowed,
      reason: result.reason,
    });

    return result;
  }

  /**
   * 批量检查权限
   */
  checkMany(
    userId: string,
    actions: string[],
    scopeType?: string,
    scopeId?: string,
    userRoles: UserRole[] = [],
    roles: Role[] = []
  ): Map<string, RbacCheckResult> {
    const results = new Map<string, RbacCheckResult>();
    for (const action of actions) {
      results.set(action, this.check(userId, action, scopeType, scopeId, userRoles, roles));
    }
    return results;
  }

  /**
   * 获取用户所有权限的并集
   */
  getUserPermissions(
    userId: string,
    userRoles: UserRole[] = [],
    roles: Role[] = []
  ): Map<string, RolePermission> {
    const permMap = new Map<string, RolePermission>();
    for (const userRole of userRoles) {
      const role = roles.find(r => r.id === userRole.role_id);
      if (!role) continue;
      for (const perm of role.permissions) {
        const key = `${perm.action}:${perm.scope_type || 'global'}:${perm.scope_id || '*'}`;
        // 显式 DENY 覆盖 ALLOW
        const existing = permMap.get(key);
        if (existing && existing.effect === 'deny') continue;
        permMap.set(key, { ...perm, scope_type: userRole.scope_type, scope_id: userRole.scope_id });
      }
    }
    return permMap;
  }
}
