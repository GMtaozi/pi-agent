import { authedFetch } from '../../lib/api';
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

interface SolutionComponent {
  id: string;
  solution_id: string;
  component_type: string;
  component_id: string;
  config: Record<string, unknown>;
  created_at: string;
}

interface Solution {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  category: string;
  industry: string;
  config: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
  components: SolutionComponent[];
}

const INDUSTRY_LABELS: Record<string, string> = {
  finance: '金融',
  healthcare: '医疗',
  education: '教育',
  retail: '零售',
  manufacturing: '制造业',
  general: '通用',
};

const COMPONENT_TYPE_LABELS: Record<string, string> = {
  template: '模板',
  knowledge_base: '知识库',
  workflow: '工作流',
  agent: 'Agent',
};

export default function SolutionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [solution, setSolution] = useState<Solution | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSolution();
  }, [id]);

  const fetchSolution = async () => {
    try {
      setLoading(true);
      const res = await authedFetch(`/api/v1/solutions/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSolution(data);
      }
    } catch (e) {
      console.error('Failed to fetch solution:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleDeploy = async () => {
    try {
      const res = await authedFetch(`/api/v1/solutions/${id}/deploy`, { method: 'POST' });
      if (res.ok) {
        alert('方案部署成功');
        fetchSolution();
      } else {
        const data = await res.json();
        alert(`部署失败: ${data.error || '未知错误'}`);
      }
    } catch (e) {
      console.error('Failed to deploy solution:', e);
      alert('部署失败');
    }
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!solution) return <div className="page"><p>方案不存在</p></div>;

  return (
    <div className="page">
      <div style={{ marginBottom: 24 }}>
        <a href="/solutions" style={{ color: 'var(--text-secondary)', fontSize: 13 }}>← 返回方案列表</a>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>{solution.name}</h1>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>{solution.description || '暂无描述'}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <span className="badge">{INDUSTRY_LABELS[solution.industry] || solution.industry}</span>
              <span className="badge badge-secondary">{solution.category}</span>
              <span className="badge badge-secondary">{solution.status}</span>
            </div>
          </div>
          <button className="btn btn-primary" onClick={handleDeploy} disabled={solution.status === 'archived'}>
            部署方案
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 16 }}>方案组件</h3>
        {solution.components.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 20 }}>暂无组件</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>类型</th>
                <th>组件 ID</th>
                <th>配置</th>
                <th>添加时间</th>
              </tr>
            </thead>
            <tbody>
              {solution.components.map(c => (
                <tr key={c.id}>
                  <td>{COMPONENT_TYPE_LABELS[c.component_type] || c.component_type}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.component_id}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {Object.keys(c.config).length > 0 ? JSON.stringify(c.config).slice(0, 50) + '...' : '-'}
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{new Date(c.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
