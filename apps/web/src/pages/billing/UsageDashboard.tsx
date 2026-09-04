import { authedFetch } from '../../lib/api';
import { useState, useEffect } from 'react';

interface QuotaCheck {
  metric: string;
  current: number;
  limit: number;
  usage_pct: number;
  status: 'ok' | 'warn' | 'throttle' | 'block';
  action: string;
}

interface UsageData {
  tenant_id: string;
  current_period: string;
  token_in: number;
  token_out: number;
  cost: number;
  execution_count: number;
  storage_bytes: number;
  agent_count: number;
  quota_checks: QuotaCheck[];
}

export default function UsageDashboard() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsage();
  }, []);

  const fetchUsage = async () => {
    try {
      const res = await authedFetch('/api/v1/billing/usage');
      if (res.ok) {
        const d = await res.json();
        setData(d);
      }
    } catch (e) {
      console.error('Failed to fetch usage:', e);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (n: number) => {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return n.toString();
  };

  const formatBytes = (bytes: number) => {
    if (bytes >= 1e9) return (bytes / 1e9).toFixed(2) + ' GB';
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(2) + ' MB';
    if (bytes >= 1e3) return (bytes / 1e3).toFixed(2) + ' KB';
    return bytes + ' B';
  };

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      ok: 'var(--success)',
      warn: 'var(--warning)',
      throttle: 'var(--error)',
      block: 'var(--error)',
    };
    return map[status] || 'var(--text-secondary)';
  };

  const getStatusText = (status: string) => {
    const map: Record<string, string> = {
      ok: '正常',
      warn: '警告',
      throttle: '限流',
      block: '阻断',
    };
    return map[status] || status;
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>用量看板</h1>

      {data && (
        <>
          <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
            <div className="card" style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>输入 Token</div>
              <div style={{ fontSize: 28, fontWeight: 600 }}>{formatNumber(data.token_in)}</div>
            </div>
            <div className="card" style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>输出 Token</div>
              <div style={{ fontSize: 28, fontWeight: 600 }}>{formatNumber(data.token_out)}</div>
            </div>
            <div className="card" style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>费用</div>
              <div style={{ fontSize: 28, fontWeight: 600 }}>${data.cost.toFixed(4)}</div>
            </div>
            <div className="card" style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>执行次数</div>
              <div style={{ fontSize: 28, fontWeight: 600 }}>{formatNumber(data.execution_count)}</div>
            </div>
            <div className="card" style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>存储用量</div>
              <div style={{ fontSize: 28, fontWeight: 600 }}>{formatBytes(data.storage_bytes)}</div>
            </div>
            <div className="card" style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>Agent 数量</div>
              <div style={{ fontSize: 28, fontWeight: 600 }}>{data.agent_count}</div>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 16 }}>配额状态</h3>
            {data.quota_checks.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 20 }}>未配置配额策略</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>指标</th>
                    <th>当前用量</th>
                    <th>限制</th>
                    <th>使用率</th>
                    <th>状态</th>
                    <th>动作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.quota_checks.map(qc => (
                    <tr key={qc.metric}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{qc.metric}</td>
                      <td>{qc.metric.includes('token') ? formatNumber(qc.current) : qc.metric.includes('bytes') ? formatBytes(qc.current) : qc.current}</td>
                      <td>{qc.limit > 0 ? (qc.metric.includes('token') ? formatNumber(qc.limit) : qc.metric.includes('bytes') ? formatBytes(qc.limit) : qc.limit) : '∞'}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            width: 60, height: 8, background: 'var(--bg-secondary)', borderRadius: 4, overflow: 'hidden'
                          }}>
                            <div style={{
                              width: `${Math.min(100, qc.usage_pct)}%`,
                              height: '100%',
                              background: getStatusColor(qc.status),
                            }} />
                          </div>
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{qc.usage_pct.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td>
                        <span style={{ color: getStatusColor(qc.status), fontWeight: 600 }}>
                          {getStatusText(qc.status)}
                        </span>
                      </td>
                      <td style={{ fontSize: 13 }}>{qc.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
