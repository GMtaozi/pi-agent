import { authedFetch } from '../../lib/api';
import { useState, useEffect } from 'react';

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
}

const INDUSTRY_LABELS: Record<string, string> = {
  finance: '金融',
  healthcare: '医疗',
  education: '教育',
  retail: '零售',
  manufacturing: '制造业',
  general: '通用',
};

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  active: '已发布',
  deployed: '已部署',
  archived: '已归档',
};

export default function SolutionMarketPage() {
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [loading, setLoading] = useState(true);
  const [industryFilter, setIndustryFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchSolutions();
  }, [industryFilter]);

  const fetchSolutions = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (industryFilter) params.set('industry', industryFilter);
      const res = await authedFetch(`/api/v1/solutions?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSolutions(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Failed to fetch solutions:', e);
    } finally {
      setLoading(false);
    }
  };

  const filteredSolutions = solutions.filter(s =>
    !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.description && s.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleDeploy = async (id: string) => {
    try {
      const res = await authedFetch(`/api/v1/solutions/${id}/deploy`, { method: 'POST' });
      if (res.ok) {
        alert('方案部署成功');
        fetchSolutions();
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

  return (
    <div className="page">
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>行业方案市场</h1>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <input
          type="text"
          placeholder="搜索方案..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="input"
          style={{ flex: 1 }}
        />
        <select
          value={industryFilter}
          onChange={e => setIndustryFilter(e.target.value)}
          className="select"
          style={{ width: 150 }}
        >
          <option value="">全部行业</option>
          {Object.entries(INDUSTRY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {filteredSolutions.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
          暂无行业方案
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {filteredSolutions.map(solution => (
            <div key={solution.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600 }}>{solution.name}</h3>
                <span className="badge badge-secondary">{STATUS_LABELS[solution.status] || solution.status}</span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, flex: 1 }}>
                {solution.description || '暂无描述'}
              </p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <span className="badge">{INDUSTRY_LABELS[solution.industry] || solution.industry}</span>
                <span className="badge badge-secondary">{solution.category}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-primary"
                  onClick={() => handleDeploy(solution.id)}
                  disabled={solution.status === 'archived'}
                >
                  部署
                </button>
                <a className="btn btn-secondary" href={`/solutions/${solution.id}`}>详情</a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
