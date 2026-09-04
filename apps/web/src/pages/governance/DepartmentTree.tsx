import { authedFetch } from '../../lib/api';
import { useState, useEffect } from 'react';

interface Department {
  id: string;
  parent_id?: string;
  name: string;
  sort_order: number;
  created_at: string;
  children?: Department[];
}

export default function DepartmentTree() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptParent, setNewDeptParent] = useState('');

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      const res = await authedFetch('/api/v1/departments');
      if (res.ok) {
        const data = await res.json();
        setDepartments(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Failed to fetch departments:', e);
    } finally {
      setLoading(false);
    }
  };

  const createDepartment = async () => {
    if (!newDeptName) return;
    try {
      const res = await authedFetch('/api/v1/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newDeptName, parent_id: newDeptParent || undefined }),
      });
      if (res.ok) {
        setShowCreate(false);
        setNewDeptName('');
        setNewDeptParent('');
        fetchDepartments();
      }
    } catch (e) {
      console.error('Failed to create department:', e);
    }
  };

  const buildTree = (depts: Department[]): Department[] => {
    const map = new Map<string, Department>();
    const roots: Department[] = [];

    depts.forEach(d => map.set(d.id, { ...d, children: [] }));
    depts.forEach(d => {
      const node = map.get(d.id)!;
      if (d.parent_id && map.has(d.parent_id)) {
        map.get(d.parent_id)!.children!.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots.sort((a, b) => a.sort_order - b.sort_order);
  };

  const renderNode = (dept: Department, depth: number = 0): JSX.Element => (
    <div key={dept.id} style={{ marginLeft: depth * 20 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '8px 12px',
        marginBottom: 4,
        background: 'var(--bg-secondary)',
        borderRadius: 6,
        border: '1px solid var(--border-color)',
      }}>
        <span style={{ fontSize: 14, fontWeight: depth === 0 ? 600 : 400 }}>
          {dept.name}
        </span>
        {dept.children && dept.children.length > 0 && (
          <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
            ({dept.children.length} 个子部门)
          </span>
        )}
      </div>
      {dept.children?.map(child => renderNode(child, depth + 1))}
    </div>
  );

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  const tree = buildTree(departments);

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>部门管理</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>新建部门</button>
      </div>

      {showCreate && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>创建新部门</h3>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>部门名称</label>
              <input className="input" value={newDeptName} onChange={e => setNewDeptName(e.target.value)} placeholder="输入部门名称" style={{ width: 200 }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>上级部门</label>
              <select className="input" value={newDeptParent} onChange={e => setNewDeptParent(e.target.value)} style={{ width: 200 }}>
                <option value="">无（顶级部门）</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary" onClick={createDepartment} disabled={!newDeptName}>创建</button>
            <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>取消</button>
          </div>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginBottom: 16 }}>部门结构</h3>
        {tree.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 40 }}>暂无部门数据</p>
        ) : (
          tree.map(node => renderNode(node))
        )}
      </div>
    </div>
  );
}
