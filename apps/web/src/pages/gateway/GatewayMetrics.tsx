import { useState, useEffect } from 'react';
import { BarChart3, DollarSign, Layers, Zap } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { getFriendlyMessage } from '../../lib/errors';

interface GatewayMetrics {
  totalRoutes: number;
  enabledRoutes: number;
  disabledRoutes: number;
  byProvider: Record<string, number>;
}

export default function GatewayMetrics() {
  const [metrics, setMetrics] = useState<GatewayMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<GatewayMetrics>('/api/v1/gateway/metrics')
      .then(data => {
        if (!cancelled) setMetrics(data);
      })
      .catch(err => {
        if (!cancelled) setError(getFriendlyMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="settings-loading">加载网关指标中...</div>;
  if (error) return <div className="error-banner"><span>{error}</span></div>;
  if (!metrics) return <div className="settings-empty">暂无数据</div>;

  const providerEntries = Object.entries(metrics.byProvider);

  return (
    <div className="page">
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>网关指标</h1>

      <div className="analytics-grid" style={{ marginBottom: 24 }}>
        <div className="config-card">
          <div className="card-header">
            <Layers size={18} />
            <div>
              <div className="title">总路由数</div>
              <div className="desc">已配置的路由规则总数</div>
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{metrics.totalRoutes}</div>
        </div>

        <div className="config-card">
          <div className="card-header">
            <Zap size={18} />
            <div>
              <div className="title">启用路由</div>
              <div className="desc">当前启用的路由规则</div>
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, color: 'var(--color-success)' }}>
            {metrics.enabledRoutes}
          </div>
        </div>

        <div className="config-card">
          <div className="card-header">
            <BarChart3 size={18} />
            <div>
              <div className="title">禁用路由</div>
              <div className="desc">当前禁用的路由规则</div>
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, color: 'var(--text-muted)' }}>
            {metrics.disabledRoutes}
          </div>
        </div>

        <div className="config-card">
          <div className="card-header">
            <DollarSign size={18} />
            <div>
              <div className="title">Provider 数</div>
              <div className="desc">已接入的模型供应商</div>
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{providerEntries.length}</div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Provider 分布</h2>
        {providerEntries.length === 0 ? (
          <div className="settings-empty">暂无 Provider 数据</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {providerEntries.map(([provider, count]) => (
              <div key={provider} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 100, fontWeight: 500 }}>{provider}</span>
                <div style={{ flex: 1, height: 24, background: 'var(--bg-subtle)', borderRadius: 4, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${(count / metrics.totalRoutes) * 100}%`,
                      background: 'var(--color-primary)',
                      borderRadius: 4,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
                <span style={{ width: 40, textAlign: 'right' }}>{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
