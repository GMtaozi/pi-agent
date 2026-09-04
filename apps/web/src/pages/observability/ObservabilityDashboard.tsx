import { useState, useEffect } from 'react';
import { Activity, AlertTriangle, Clock, TrendingUp } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { getFriendlyMessage } from '../../lib/errors';

interface Session {
  id: string;
  tenant_id: string;
  agent_id: string | null;
  started_at: string;
  ended_at: string | null;
  status: string;
  metadata: string;
}

interface MetricItem {
  metric_name: string;
  metric_value: number;
  recorded_at: string;
}

export default function ObservabilityDashboard() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [metrics, setMetrics] = useState<MetricItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      apiFetch<{ items: Session[] }>('/api/v1/observability/sessions?limit=20'),
      apiFetch<{ items: MetricItem[] }>('/api/v1/observability/metrics?limit=50'),
    ])
      .then(([sessionsRes, metricsRes]) => {
        if (!cancelled) {
          setSessions(sessionsRes.items || []);
          setMetrics(metricsRes.items || []);
        }
      })
      .catch(err => {
        if (!cancelled) setError(getFriendlyMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const activeSessions = sessions.filter(s => s.status === 'active').length;
  const totalSessions = sessions.length;
  const avgLatency = metrics.length > 0
    ? metrics.reduce((sum, m) => sum + m.metric_value, 0) / metrics.length
    : 0;

  if (loading) return <div className="settings-loading">加载可观测性数据中...</div>;
  if (error) return <div className="error-banner"><span>{error}</span></div>;

  return (
    <div className="page">
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>可观测性仪表盘</h1>

      <div className="analytics-grid" style={{ marginBottom: 24 }}>
        <div className="config-card">
          <div className="card-header">
            <Activity size={18} />
            <div>
              <div className="title">活跃会话</div>
              <div className="desc">当前运行中的会话数</div>
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{activeSessions}</div>
        </div>

        <div className="config-card">
          <div className="card-header">
            <TrendingUp size={18} />
            <div>
              <div className="title">总会话数</div>
              <div className="desc">累计会话总数</div>
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{totalSessions}</div>
        </div>

        <div className="config-card">
          <div className="card-header">
            <Clock size={18} />
            <div>
              <div className="title">平均延迟</div>
              <div className="desc">最近指标平均值 (ms)</div>
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{avgLatency.toFixed(0)}</div>
        </div>

        <div className="config-card">
          <div className="card-header">
            <AlertTriangle size={18} />
            <div>
              <div className="title">异常检测</div>
              <div className="desc">待处理异常数</div>
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, color: 'var(--color-danger)' }}>0</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>最近会话</h2>
        {sessions.length === 0 ? (
          <div className="settings-empty">暂无会话数据</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Agent</th>
                <th>状态</th>
                <th>开始时间</th>
              </tr>
            </thead>
            <tbody>
              {sessions.slice(0, 10).map(session => (
                <tr key={session.id}>
                  <td className="mono">{session.id.slice(0, 12)}...</td>
                  <td>{session.agent_id || '-'}</td>
                  <td>
                    <span className={`badge ${session.status === 'active' ? 'badge-success' : 'badge-default'}`}>
                      {session.status}
                    </span>
                  </td>
                  <td>{new Date(session.started_at).toLocaleString('zh-CN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>最近指标</h2>
        {metrics.length === 0 ? (
          <div className="settings-empty">暂无指标数据</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>指标名称</th>
                <th>值</th>
                <th>记录时间</th>
              </tr>
            </thead>
            <tbody>
              {metrics.slice(0, 10).map((metric, i) => (
                <tr key={i}>
                  <td>{metric.metric_name}</td>
                  <td className="mono">{metric.metric_value.toFixed(4)}</td>
                  <td>{new Date(metric.recorded_at).toLocaleString('zh-CN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
