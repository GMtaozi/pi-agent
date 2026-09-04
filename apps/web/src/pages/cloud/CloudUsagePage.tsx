import { authedFetch } from '../../lib/api';
import { useState, useEffect } from 'react';

interface UsageData {
  tenant_id: string;
  period: string;
  tokens: number;
  agents: number;
  storage_bytes: number;
}

export default function CloudUsagePage() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsage();
  }, []);

  const fetchUsage = async () => {
    try {
      const res = await authedFetch('/api/v1/cloud/usage');
      if (res.ok) {
        const data = await res.json();
        setUsage(data);
      }
    } catch (e) {
      console.error('Failed to fetch usage:', e);
    } finally {
      setLoading(false);
    }
  };

  const formatTokens = (n: number) => {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toString();
  };

  const formatBytes = (n: number) => {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + ' GB';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + ' MB';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + ' KB';
    return n + ' B';
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>用量统计</h1>

      {usage && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div className="card">
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>Token 用量 (近30天)</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{formatTokens(usage.tokens)}</div>
          </div>
          <div className="card">
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>Agent 数量</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{usage.agents}</div>
          </div>
          <div className="card">
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>存储用量</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{formatBytes(usage.storage_bytes)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
