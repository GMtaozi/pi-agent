import { authedFetch } from '../../lib/api';
import { useState, useEffect } from 'react';

interface Role {
  id: string;
  name: string;
  builtin: boolean;
  permissions: Permission[];
  description?: string;
  created_at: string;
}

interface Permission {
  action: string;
  effect: 'allow' | 'deny';
  scope_type?: string;
  scope_id?: string;
}

const AVAILABLE_ACTIONS = [
  'read', 'write', 'edit', 'delete', 'bash',
  'paid-api', 'generate_image', 'generate_video', 'generate_audio',
  'manage_users', 'manage_roles', 'view_audit', 'manage_billing'
];

export default function RoleConfigPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');

  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    try {
      const res = await authedFetch('/api/v1/roles');
      if (res.ok) {
        const data = await res.json();
        setRoles(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Failed to fetch roles:', e);
    } finally {
      setLoading(false);
    }
  };

  const createRole = async () => {
    if (!newRoleName) return;
    try {
      const res = await authedFetch('/api/v1/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newRoleName, description: newRoleDesc, permissions: [] }),
      });
      if (res.ok) {
        setShowCreate(false);
        setNewRoleName('');
        setNewRoleDesc('');
        fetchRoles();
      }
    } catch (e) {
      console.error('Failed to create role:', e);
    }
  };

  const togglePermission = (action: string, effect: 'allow' | 'deny') => {
    if (!editingRole) return;
    const existing = editingRole.permissions.find(p => p.action === action && p.scope_type === 'global');
    let newPermissions: Permission[];
    if (existing) {
      if (existing.effect === effect) {
        // 移除权限
        newPermissions = editingRole.permissions.filter(p => !(p.action === action && p.scope_type === 'global'));
      } else {
        // 切换效果
        newPermissions = editingRole.permissions.map(p =>
          p.action === action && p.scope_type === 'global' ? { ...p, effect } : p
        );
      }
    } else {
      newPermissions = [...editingRole.permissions, { action, effect, scope_type: 'global' }];
    }
    setEditingRole({ ...editingRole, permissions: newPermissions });
  };

  const getPermissionEffect = (action: string): 'allow' | 'deny' | null => {
    if (!editingRole) return null;
    const perm = editingRole.permissions.find(p => p.action === action && p.scope_type === 'global');
    return perm?.effect || null;
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>角色配置</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>新建角色</button>
      </div>

      {showCreate && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>创建新角色</h3>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>角色名称</label>
              <input className="input" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} placeholder="输入角色名称" style={{ width: 200 }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>描述</label>
              <input className="input" value={newRoleDesc} onChange={e => setNewRoleDesc(e.target.value)} placeholder="输入描述" style={{ width: 250 }} />
            </div>
            <button className="btn btn-primary" onClick={createRole} disabled={!newRoleName}>创建</button>
            <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>取消</button>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16 }}>角色列表</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {roles.map(role => (
            <button
              key={role.id}
              className={`btn ${editingRole?.id === role.id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setEditingRole(role)}
            >
              {role.name}
              {role.builtin && <span style={{ marginLeft: 4, fontSize: 11 }}>(内置)</span>}
            </button>
          ))}
        </div>
      </div>

      {editingRole && (
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>权限矩阵 — {editingRole.name}</h3>
          {editingRole.description && (
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16, fontSize: 14 }}>{editingRole.description}</p>
          )}
          <table className="table">
            <thead>
              <tr>
                <th>操作</th>
                <th>允许</th>
                <th>拒绝</th>
                <th>未设置</th>
              </tr>
            </thead>
            <tbody>
              {AVAILABLE_ACTIONS.map(action => {
                const effect = getPermissionEffect(action);
                return (
                  <tr key={action}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{action}</td>
                    <td>
                      <input
                        type="radio"
                        name={`perm-${action}`}
                        checked={effect === 'allow'}
                        onChange={() => togglePermission(action, 'allow')}
                        disabled={editingRole.builtin}
                      />
                    </td>
                    <td>
                      <input
                        type="radio"
                        name={`perm-${action}`}
                        checked={effect === 'deny'}
                        onChange={() => togglePermission(action, 'deny')}
                        disabled={editingRole.builtin}
                      />
                    </td>
                    <td>
                      <input
                        type="radio"
                        name={`perm-${action}`}
                        checked={effect === null}
                        onChange={() => {
                          if (editingRole) {
                            setEditingRole({
                              ...editingRole,
                              permissions: editingRole.permissions.filter(p => !(p.action === action && p.scope_type === 'global'))
                            });
                          }
                        }}
                        disabled={editingRole.builtin}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {editingRole.builtin && (
            <p style={{ marginTop: 12, color: 'var(--text-secondary)', fontSize: 13 }}>内置角色不可修改</p>
          )}
        </div>
      )}
    </div>
  );
}
