import { describe, it, expect, beforeEach } from 'vitest';
import { RbacService, Role, UserRole } from '../rbac-service';

describe('RbacService', () => {
  let service: RbacService;

  beforeEach(() => {
    service = new RbacService();
  });

  describe('零信任默认拒绝', () => {
    it('当用户没有任何角色时应拒绝访问', () => {
      const result = service.check('user_1', 'read', undefined, undefined, [], []);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('No matching permission found (default deny)');
    });

    it('当用户角色列表为空时应拒绝访问', () => {
      const roles: Role[] = [];
      const result = service.check('user_1', 'read', undefined, undefined, [], roles);
      expect(result.allowed).toBe(false);
    });

    it('当角色定义列表为空时应拒绝访问', () => {
      const userRoles: UserRole[] = [{
        id: 'ur-1',
        user_id: 'user_1',
        role_id: 'role-1',
        scope_type: 'global',
        created_at: new Date().toISOString(),
      }];
      const result = service.check('user_1', 'read', undefined, undefined, userRoles, []);
      expect(result.allowed).toBe(false);
    });
  });

  describe('基本权限检查', () => {
    const roles: Role[] = [
      {
        id: 'role-reader',
        tenant_id: 'tenant-1',
        name: 'Reader',
        builtin: true,
        permissions: [
          { action: 'read', effect: 'allow' },
        ],
        created_at: new Date().toISOString(),
      },
      {
        id: 'role-writer',
        tenant_id: 'tenant-1',
        name: 'Writer',
        builtin: true,
        permissions: [
          { action: 'read', effect: 'allow' },
          { action: 'write', effect: 'allow' },
        ],
        created_at: new Date().toISOString(),
      },
    ];

    it('应允许有 read 权限的用户读取', () => {
      const userRoles: UserRole[] = [{
        id: 'ur-1',
        user_id: 'user_1',
        role_id: 'role-reader',
        scope_type: 'global',
        created_at: new Date().toISOString(),
      }];
      const result = service.check('user_1', 'read', undefined, undefined, userRoles, roles);
      expect(result.allowed).toBe(true);
      expect(result.matched_role).toBe('Reader');
    });

    it('应拒绝没有 write 权限的用户写入', () => {
      const userRoles: UserRole[] = [{
        id: 'ur-1',
        user_id: 'user_1',
        role_id: 'role-reader',
        scope_type: 'global',
        created_at: new Date().toISOString(),
      }];
      const result = service.check('user_1', 'write', undefined, undefined, userRoles, roles);
      expect(result.allowed).toBe(false);
    });

    it('应允许有 write 权限的用户写入', () => {
      const userRoles: UserRole[] = [{
        id: 'ur-1',
        user_id: 'user_1',
        role_id: 'role-writer',
        scope_type: 'global',
        created_at: new Date().toISOString(),
      }];
      const result = service.check('user_1', 'write', undefined, undefined, userRoles, roles);
      expect(result.allowed).toBe(true);
      expect(result.matched_role).toBe('Writer');
    });
  });

  describe('显式 DENY 优先于 ALLOW', () => {
    it('当同一角色同时有 ALLOW 和 DENY 时，DENY 应优先', () => {
      const roles: Role[] = [
        {
          id: 'role-mixed',
          tenant_id: 'tenant-1',
          name: 'Mixed',
          builtin: false,
          permissions: [
            { action: 'delete', effect: 'allow' },
            { action: 'delete', effect: 'deny' },
          ],
          created_at: new Date().toISOString(),
        },
      ];
      const userRoles: UserRole[] = [{
        id: 'ur-1',
        user_id: 'user_1',
        role_id: 'role-mixed',
        scope_type: 'global',
        created_at: new Date().toISOString(),
      }];
      const result = service.check('user_1', 'delete', undefined, undefined, userRoles, roles);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Explicitly denied');
    });

    it('当不同角色有 ALLOW 和 DENY 时，DENY 应优先', () => {
      const roles: Role[] = [
        {
          id: 'role-allow',
          tenant_id: 'tenant-1',
          name: 'AllowRole',
          builtin: false,
          permissions: [
            { action: 'delete', effect: 'allow' },
          ],
          created_at: new Date().toISOString(),
        },
        {
          id: 'role-deny',
          tenant_id: 'tenant-1',
          name: 'DenyRole',
          builtin: false,
          permissions: [
            { action: 'delete', effect: 'deny' },
          ],
          created_at: new Date().toISOString(),
        },
      ];
      const userRoles: UserRole[] = [
        {
          id: 'ur-1',
          user_id: 'user_1',
          role_id: 'role-allow',
          scope_type: 'global',
          created_at: new Date().toISOString(),
        },
        {
          id: 'ur-2',
          user_id: 'user_1',
          role_id: 'role-deny',
          scope_type: 'global',
          created_at: new Date().toISOString(),
        },
      ];
      const result = service.check('user_1', 'delete', undefined, undefined, userRoles, roles);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Explicitly denied');
    });
  });

  describe('scope 匹配', () => {
    const roles: Role[] = [
      {
        id: 'role-global',
        tenant_id: 'tenant-1',
        name: 'GlobalAdmin',
        builtin: true,
        permissions: [
          { action: 'read', effect: 'allow', scope_type: 'global' },
        ],
        created_at: new Date().toISOString(),
      },
      {
        id: 'role-team',
        tenant_id: 'tenant-1',
        name: 'TeamAdmin',
        builtin: false,
        permissions: [
          { action: 'read', effect: 'allow', scope_type: 'team', scope_id: 'team-1' },
        ],
        created_at: new Date().toISOString(),
      },
      {
        id: 'role-own',
        tenant_id: 'tenant-1',
        name: 'Owner',
        builtin: false,
        permissions: [
          { action: 'read', effect: 'allow', scope_type: 'own' },
        ],
        created_at: new Date().toISOString(),
      },
    ];

    it('global scope 应允许任何范围的访问', () => {
      const userRoles: UserRole[] = [{
        id: 'ur-1',
        user_id: 'user_1',
        role_id: 'role-global',
        scope_type: 'global',
        created_at: new Date().toISOString(),
      }];
      const result = service.check('user_1', 'read', 'team', 'team-999', userRoles, roles);
      expect(result.allowed).toBe(true);
    });

    it('team scope 应只允许匹配的团队访问', () => {
      const userRoles: UserRole[] = [{
        id: 'ur-1',
        user_id: 'user_1',
        role_id: 'role-team',
        scope_type: 'global',
        created_at: new Date().toISOString(),
      }];
      const result = service.check('user_1', 'read', 'team', 'team-1', userRoles, roles);
      expect(result.allowed).toBe(true);
    });

    it('team scope 应拒绝不匹配的团队访问', () => {
      const userRoles: UserRole[] = [{
        id: 'ur-1',
        user_id: 'user_1',
        role_id: 'role-team',
        scope_type: 'global',
        created_at: new Date().toISOString(),
      }];
      const result = service.check('user_1', 'read', 'team', 'team-2', userRoles, roles);
      expect(result.allowed).toBe(false);
    });

    it('userRole scope_type 不匹配时应拒绝', () => {
      const userRoles: UserRole[] = [{
        id: 'ur-1',
        user_id: 'user_1',
        role_id: 'role-global',
        scope_type: 'team',
        scope_id: 'team-1',
        created_at: new Date().toISOString(),
      }];
      const result = service.check('user_1', 'read', 'team', 'team-2', userRoles, roles);
      expect(result.allowed).toBe(false);
    });
  });

  describe('通配符权限', () => {
    it('通配符 * 应匹配任何操作', () => {
      const roles: Role[] = [
        {
          id: 'role-super',
          tenant_id: 'tenant-1',
          name: 'SuperAdmin',
          builtin: true,
          permissions: [
            { action: '*', effect: 'allow' },
          ],
          created_at: new Date().toISOString(),
        },
      ];
      const userRoles: UserRole[] = [{
        id: 'ur-1',
        user_id: 'user_1',
        role_id: 'role-super',
        scope_type: 'global',
        created_at: new Date().toISOString(),
      }];
      const result = service.check('user_1', 'any_action', undefined, undefined, userRoles, roles);
      expect(result.allowed).toBe(true);
    });
  });

  describe('批量检查', () => {
    it('应批量检查多个操作', () => {
      const roles: Role[] = [
        {
          id: 'role-multi',
          tenant_id: 'tenant-1',
          name: 'MultiRole',
          builtin: false,
          permissions: [
            { action: 'read', effect: 'allow' },
            { action: 'write', effect: 'allow' },
            { action: 'delete', effect: 'deny' },
          ],
          created_at: new Date().toISOString(),
        },
      ];
      const userRoles: UserRole[] = [{
        id: 'ur-1',
        user_id: 'user_1',
        role_id: 'role-multi',
        scope_type: 'global',
        created_at: new Date().toISOString(),
      }];
      const results = service.checkMany('user_1', ['read', 'write', 'delete'], undefined, undefined, userRoles, roles);
      expect(results.get('read')?.allowed).toBe(true);
      expect(results.get('write')?.allowed).toBe(true);
      expect(results.get('delete')?.allowed).toBe(false);
    });
  });

  describe('获取用户权限并集', () => {
    it('应返回用户所有权限的并集', () => {
      const roles: Role[] = [
        {
          id: 'role-1',
          tenant_id: 'tenant-1',
          name: 'Role1',
          builtin: false,
          permissions: [
            { action: 'read', effect: 'allow' },
            { action: 'write', effect: 'allow' },
          ],
          created_at: new Date().toISOString(),
        },
        {
          id: 'role-2',
          tenant_id: 'tenant-1',
          name: 'Role2',
          builtin: false,
          permissions: [
            { action: 'delete', effect: 'allow' },
          ],
          created_at: new Date().toISOString(),
        },
      ];
      const userRoles: UserRole[] = [
        {
          id: 'ur-1',
          user_id: 'user_1',
          role_id: 'role-1',
          scope_type: 'global',
          created_at: new Date().toISOString(),
        },
        {
          id: 'ur-2',
          user_id: 'user_1',
          role_id: 'role-2',
          scope_type: 'global',
          created_at: new Date().toISOString(),
        },
      ];
      const perms = service.getUserPermissions('user_1', userRoles, roles);
      expect(perms.size).toBe(3);
      expect(perms.has('read:global:*')).toBe(true);
      expect(perms.has('write:global:*')).toBe(true);
      expect(perms.has('delete:global:*')).toBe(true);
    });

    it('DENY 应覆盖 ALLOW', () => {
      const roles: Role[] = [
        {
          id: 'role-1',
          tenant_id: 'tenant-1',
          name: 'Role1',
          builtin: false,
          permissions: [
            { action: 'read', effect: 'allow' },
          ],
          created_at: new Date().toISOString(),
        },
        {
          id: 'role-2',
          tenant_id: 'tenant-1',
          name: 'Role2',
          builtin: false,
          permissions: [
            { action: 'read', effect: 'deny' },
          ],
          created_at: new Date().toISOString(),
        },
      ];
      const userRoles: UserRole[] = [
        {
          id: 'ur-1',
          user_id: 'user_1',
          role_id: 'role-1',
          scope_type: 'global',
          created_at: new Date().toISOString(),
        },
        {
          id: 'ur-2',
          user_id: 'user_1',
          role_id: 'role-2',
          scope_type: 'global',
          created_at: new Date().toISOString(),
        },
      ];
      const perms = service.getUserPermissions('user_1', userRoles, roles);
      expect(perms.get('read:global:*')?.effect).toBe('deny');
    });
  });
});
