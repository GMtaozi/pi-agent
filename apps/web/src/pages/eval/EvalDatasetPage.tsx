import { useState, useEffect } from 'react';
import { Database, Plus, Play, Trash2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { getFriendlyMessage } from '../../lib/errors';

interface Dataset {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  category: string;
  items: string;
  created_at: string;
  updated_at: string;
}

export default function EvalDatasetPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '', category: 'general' });

  const fetchDatasets = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ items: Dataset[] }>('/api/v1/eval/datasets');
      setDatasets(res.items || []);
    } catch (err) {
      setError(getFriendlyMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDatasets(); }, []);

  const handleCreate = async () => {
    try {
      await apiFetch('/api/v1/eval/datasets', {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      setShowForm(false);
      setFormData({ name: '', description: '', category: 'general' });
      fetchDatasets();
    } catch (err) {
      setError(getFriendlyMessage(err));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此数据集吗？')) return;
    try {
      await apiFetch(`/api/v1/eval/datasets/${id}`, { method: 'DELETE' });
      fetchDatasets();
    } catch (err) {
      setError(getFriendlyMessage(err));
    }
  };

  if (loading) return <div className="settings-loading">加载评测数据集中...</div>;
  if (error) return <div className="error-banner"><span>{error}</span></div>;

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>评测数据集</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={16} style={{ marginRight: 6 }} />
          新建数据集
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>新建数据集</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <input
              placeholder="名称"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="form-input"
            />
            <input
              placeholder="分类"
              value={formData.category}
              onChange={e => setFormData({ ...formData, category: e.target.value })}
              className="form-input"
            />
            <input
              placeholder="描述"
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              className="form-input"
              style={{ gridColumn: '1 / -1' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-primary" onClick={handleCreate}>创建</button>
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>取消</button>
          </div>
        </div>
      )}

      {datasets.length === 0 ? (
        <div className="card">
          <div className="settings-empty">暂无评测数据集</div>
        </div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>分类</th>
                <th>描述</th>
                <th>数据量</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {datasets.map(dataset => {
                const items = JSON.parse(dataset.items || '[]');
                return (
                  <tr key={dataset.id}>
                    <td style={{ fontWeight: 500 }}>{dataset.name}</td>
                    <td><span className="badge badge-default">{dataset.category}</span></td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {dataset.description || '-'}
                    </td>
                    <td>{items.length}</td>
                    <td>{new Date(dataset.created_at).toLocaleString('zh-CN')}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-sm btn-primary" title="运行评测">
                          <Play size={14} />
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(dataset.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
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
