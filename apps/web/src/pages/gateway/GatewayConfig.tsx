import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { getFriendlyMessage } from '../../lib/errors';

interface Route {
  id: string;
  tenant_id: string;
  name: string;
  provider: string;
  model: string;
  priority: number;
  cost_weight: number;
  enabled: number;
  created_at: string;
}

export default function GatewayConfig() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);
  const [formData, setFormData] = useState({
    name: '', provider: '', model: '', priority: 0, costWeight: 1.0, enabled: true,
  });

  const fetchRoutes = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ items: Route[] }>('/api/v1/gateway/routes');
      setRoutes(res.items || []);
    } catch (err) {
      setError(getFriendlyMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRoutes(); }, []);

  const handleCreate = async () => {
    try {
      await apiFetch('/api/v1/gateway/routes', {
        method: 'POST',
        body: JSON.stringify({
          name: formData.name,
          provider: formData.provider,
          model: formData.model,
          priority: formData.priority,
          costWeight: formData.costWeight,
          enabled: formData.enabled,
        }),
      });
      setShowForm(false);
      setFormData({ name: '', provider: '', model: '', priority: 0, costWeight: 1.0, enabled: true });
      fetchRoutes();
    } catch (err) {
      setError(getFriendlyMessage(err));
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      await apiFetch(`/api/v1/gateway/routes/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: formData.name,
          provider: formData.provider,
          model: formData.model,
          priority: formData.priority,
          costWeight: formData.costWeight,
          enabled: formData.enabled,
        }),
      });
      setEditingRoute(null);
      setShowForm(false);
      setFormData({ name: '', provider: '', model: '', priority: 0, costWeight: 1.0, enabled: true });
      fetchRoutes();
    } catch (err) {
      setError(getFriendlyMessage(err));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此路由规则吗？')) return;
    try {
      await apiFetch(`/api/v1/gateway/routes/${id}`, { method: 'DELETE' });
      fetchRoutes();
    } catch (err) {
      setError(getFriendlyMessage(err));
    }
  };

  const startEdit = (route: Route) => {
    setEditingRoute(route);
    setFormData({
      name: route.name,
      provider: route.provider,
      model: route.model,
      priority: route.priority,
      costWeight: route.cost_weight,
      enabled: route.enabled === 1,
    });
    setShowForm(true);
  };

  if (loading) return <div className="settings-loading">加载路由规则中...</div>;
  if (error) return <div className="error-banner"><span>{error}</span></div>;

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>网关配置</h1>
        <button
          className="btn btn-primary"
          onClick={() => { setShowForm(true); setEditingRoute(null); }}
        >
          <Plus size={16} style={{ marginRight: 6 }} />
          新建路由
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>{editingRoute ? '编辑路由规则' : '新建路由规则'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <input
              placeholder="名称"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="form-input"
            />
            <input
              placeholder="Provider"
              value={formData.provider}
              onChange={e => setFormData({ ...formData, provider: e.target.value })}
              className="form-input"
            />
            <input
              placeholder="Model"
              value={formData.model}
              onChange={e => setFormData({ ...formData, model: e.target.value })}
              className="form-input"
            />
            <input
              type="number"
              placeholder="优先级"
              value={formData.priority}
              onChange={e => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
              className="form-input"
            />
            <input
              type="number"
              step="0.1"
              placeholder="成本权重"
              value={formData.costWeight}
              onChange={e => setFormData({ ...formData, costWeight: parseFloat(e.target.value) || 1.0 })}
              className="form-input"
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={formData.enabled}
                onChange={e => setFormData({ ...formData, enabled: e.target.checked })}
              />
              启用
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button
              className="btn btn-primary"
              onClick={() => editingRoute ? handleUpdate(editingRoute.id) : handleCreate()}
            >
              {editingRoute ? '更新' : '创建'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => { setShowForm(false); setEditingRoute(null); }}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {routes.length === 0 ? (
        <div className="card">
          <div className="settings-empty">暂无路由规则</div>
        </div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>Provider</th>
                <th>Model</th>
                <th>优先级</th>
                <th>成本权重</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {routes.map(route => (
                <tr key={route.id}>
                  <td style={{ fontWeight: 500 }}>{route.name}</td>
                  <td>{route.provider}</td>
                  <td className="mono">{route.model}</td>
                  <td>{route.priority}</td>
                  <td className="mono">{route.cost_weight}</td>
                  <td>
                    <span className={`badge ${route.enabled ? 'badge-success' : 'badge-default'}`}>
                      {route.enabled ? '启用' : '禁用'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-sm btn-secondary" onClick={() => startEdit(route)}>
                        <Edit2 size={14} />
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(route.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
