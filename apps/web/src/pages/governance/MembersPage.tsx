import { authedFetch } from '../../lib/api';
import { useState, useEffect } from 'react';

interface UserRole {
  id: string;
  user_id: string;
  role_id: string;
  scope_type: string;
  scope_id?: string;
  created_at: string;
}

interface Role {
  id: string;
  name: string;
  builtin: boolean;
  permissions: any[];
  description?: string;
}

export default function MembersPage() {
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [userIdInput, setUserIdInput] = useState('');

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

  const fetchUserRoles = async (userId: string) => {
    try {
      const res = await authedFetch(`/api/v1/users/${userId}/roles`);
      if (res.ok) {
        const data = await res.json();
        setUserRoles(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Failed to fetch user roles:', e);
    }
  };

  const assignRole = async () => {
    if (!selectedUser || !selectedRole) return;
    try {
      const res = await authedFetch(`/api/v1/users/${selectedUser}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role_id: selectedRole }),
      });
      if (res.ok) {
        fetchUserRoles(selectedUser);
        setSelectedRole('');
      }
    } catch (e) {
      console.error('Failed to assign role:', e);
    }
  };

  const handleUserSelect = (userId: string) => {
    setSelectedUser(userId);
    setUserIdInput(userId);
    fetchUserRoles(userId);
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>成员与权限</h1>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16 }}>分配角色</h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>用户 ID</label>
            <input
              className="input"
              value={userIdInput}
              onChange={e => setUserIdInput(e.target.value)}
              placeholder="输入用户 ID"
              style={{ width: 200 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>角色</label>
            <select
              className="input"
              value={selectedRole}
              onChange={e => setSelectedRole(e.target.value)}
              style={{ width: 200 }}
            >
              <option value="">选择角色</option>
              {roles.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => { handleUserSelect(userIdInput); assignRole(); }}
            disabled={!selectedRole || !userIdInput}
          >
            分配
          </button>
        </div>
      </div>

      {selectedUser && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>用户 {selectedUser} 的角色</h3>
          <table className="table">
            <thead>
              <tr>
                <th>角色</th>
                <th>范围类型</th>
                <th>分配时间</th>
              </tr>
            </thead>
            <tbody>
              {userRoles.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>
                    暂无角色
                  </td>
                </tr>
              ) : userRoles.map(ur => {
                const role = roles.find(r => r.id === ur.role_id);
                return (
                  <tr key={ur.id}>
                    <td>{role?.name || ur.role_id}</td>
                    <td>{ur.scope_type}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                      {new Date(ur.created_at).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
