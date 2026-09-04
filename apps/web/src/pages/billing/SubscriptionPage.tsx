import { authedFetch } from '../../lib/api';
import { useState, useEffect } from 'react';

interface Subscription {
  id: string;
  tenant_id: string;
  plan: string;
  seats: number;
  status: string;
  current_period_start?: string;
  end?: string;
  cancel_at_period_end: boolean;
  created_at: string;
}

interface QuotaPolicy {
  id: string;
  tenant_id: string;
  metric: string;
  limit_val: number;
  warn_threshold: number;
  action: string;
  updated_at: string;
}

export default function SubscriptionPage() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [quotas, setQuotas] = useState<QuotaPolicy[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSubscription();
    fetchQuotas();
  }, []);

  const fetchSubscription = async () => {
    try {
      const res = await authedFetch('/api/v1/billing/subscription');
      if (res.ok) {
        const data = await res.json();
        setSubscription(data);
      }
    } catch (e) {
      console.error('Failed to fetch subscription:', e);
    }
  };

  const fetchQuotas = async () => {
    try {
      const res = await authedFetch('/api/v1/billing/quota');
      if (res.ok) {
        const data = await res.json();
        setQuotas(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Failed to fetch quotas:', e);
    } finally {
      setLoading(false);
    }
  };

  const getPlanName = (plan: string) => {
    const map: Record<string, string> = {
      free: '免费版',
      pro: '专业版',
      enterprise: '企业版',
    };
    return map[plan] || plan;
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      active: 'badge-success',
      cancelled: 'badge-secondary',
      past_due: 'badge-error',
      trialing: 'badge-warning',
    };
    return map[status] || 'badge-secondary';
  };

  const formatMetric = (metric: string) => {
    const map: Record<string, string> = {
      token_in: '输入 Token',
      token_out: '输出 Token',
      cost: '费用',
      execution_count: '执行次数',
      storage_bytes: '存储空间',
      agent_count: 'Agent 数量',
    };
    return map[metric] || metric;
  };

  const formatLimit = (metric: string, limit: number) => {
    if (metric.includes('token')) {
      if (limit >= 1e9) return (limit / 1e9).toFixed(1) + 'B';
      if (limit >= 1e6) return (limit / 1e6).toFixed(1) + 'M';
      if (limit >= 1e3) return (limit / 1e3).toFixed(1) + 'K';
    }
    if (metric.includes('bytes')) {
      if (limit >= 1e9) return (limit / 1e9).toFixed(1) + ' GB';
      if (limit >= 1e6) return (limit / 1e6).toFixed(1) + ' MB';
    }
    if (metric === 'cost') return '$' + limit;
    return limit.toString();
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>订阅管理</h1>

      {subscription && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>当前订阅</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>套餐</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{getPlanName(subscription.plan)}</div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>座位数</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{subscription.seats}</div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>状态</div>
              <span className={`badge ${getStatusBadge(subscription.status)}`}>{subscription.status}</span>
            </div>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>当前周期</div>
              <div style={{ fontSize: 14 }}>
                {subscription.current_period_start
                  ? new Date(subscription.current_period_start).toLocaleDateString()
                  : '-'}
                {' ~ '}
                {subscription.end
                  ? new Date(subscription.end).toLocaleDateString()
                  : '无限期'}
              </div>
            </div>
          </div>
          {subscription.cancel_at_period_end && (
            <div style={{ marginTop: 12, padding: 8, background: 'var(--warning-bg)', borderRadius: 4, color: 'var(--warning)', fontSize: 13 }}>
              订阅将在当前周期结束时取消
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h3 style={{ marginBottom: 16 }}>配额策略</h3>
        {quotas.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 20 }}>暂无配额策略</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>指标</th>
                <th>限制</th>
                <th>警告阈值</th>
                <th>超限动作</th>
                <th>更新时间</th>
              </tr>
            </thead>
            <tbody>
              {quotas.map(q => (
                <tr key={q.id}>
                  <td>{formatMetric(q.metric)}</td>
                  <td style={{ fontWeight: 600 }}>{formatLimit(q.metric, q.limit_val)}</td>
                  <td>{(q.warn_threshold * 100).toFixed(0)}%</td>
                  <td>{q.action}</td>
                  <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{new Date(q.updated_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
