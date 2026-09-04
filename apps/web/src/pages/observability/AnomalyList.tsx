import { useState, useEffect } from 'react';
import { CheckCircle, Filter } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { getFriendlyMessage } from '../../lib/errors';

interface Anomaly {
  id: string;
  tenant_id: string;
  trace_id: string | null;
  anomaly_type: string;
  severity: string;
  description: string | null;
  detected_at: string;
  resolved_at: string | null;
  status: string;
}

const SEVERITY_BADGE: Record<string, string> = {
  low: 'badge-default',
  medium: 'badge-warning',
  high: 'badge-error',
  critical: 'badge-error',
};

const TYPE_LABELS: Record<string, string> = {
  latency: '执行耗时',
  token_usage: 'Token 消耗',
  error_rate: '错误率',
  hallucination: '幻觉检测',
};

export default function AnomalyList() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  const fetchAnomalies = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = filter !== 'all' ? `?status=${filter}` : '';
      const res = await apiFetch<{ items: Anomaly[] }>(`/api/v1/observability/anomalies${params}`);
      setAnomalies(res.items || []);
    } catch (err) {
      setError(getFriendlyMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnomalies();
  }, [filter]);

  const resolveAnomaly = async (id: string) => {
    try {
      await apiFetch(`/api/v1/observability/anomalies/${id}/resolve`, { method: 'POST' });
      fetchAnomalies();
    } catch (err) {
      setError(getFriendlyMessage(err));
    }
  };

  if (loading) return <div className="settings-loading">加载异常数据中...</div>;
  if (error) return <div className="error-banner"><span>{error}</span></div>;

  return (
    <div className="page">
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>异常检测</h1>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Filter size={18} />
          <span style={{ fontWeight: 500 }}>状态筛选：</span>
          {['all', 'open', 'investigating', 'resolved'].map(status => (
            <button
              key={status}
              className={`btn ${filter === status ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter(status)}
            >
              {status === 'all' ? '全部' : status === 'open' ? '待处理' : status === 'investigating' ? '调查中' : '已解决'}
            </button>
          ))}
        </div>
      </div>

      {anomalies.length === 0 ? (
        <div className="card">
          <div className="settings-empty">暂无异常记录</div>
        </div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>类型</th>
                <th>严重程度</th>
                <th>描述</th>
                <th>检测时间</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {anomalies.map(anomaly => (
                <tr key={anomaly.id}>
                  <td>{TYPE_LABELS[anomaly.anomaly_type] || anomaly.anomaly_type}</td>
                  <td>
                    <span className={`badge ${SEVERITY_BADGE[anomaly.severity] || 'badge-default'}`}>
                      {anomaly.severity}
                    </span>
                  </td>
                  <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {anomaly.description || '-'}
                  </td>
                  <td>{new Date(anomaly.detected_at).toLocaleString('zh-CN')}</td>
                  <td>
                    <span className={`badge ${anomaly.status === 'resolved' ? 'badge-success' : 'badge-warning'}`}>
                      {anomaly.status === 'resolved' ? '已解决' : '待处理'}
                    </span>
                  </td>
                  <td>
                    {anomaly.status !== 'resolved' && (
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => resolveAnomaly(anomaly.id)}
                      >
                        <CheckCircle size={14} style={{ marginRight: 4 }} />
                        解决
                      </button>
                    )}
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
