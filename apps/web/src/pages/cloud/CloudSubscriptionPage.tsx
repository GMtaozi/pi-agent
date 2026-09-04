import { authedFetch } from '../../lib/api';
import { useState, useEffect } from 'react';

interface CloudSubscription {
  id: string;
  tenant_id: string;
  plan: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
}

interface CloudPlan {
  id: string;
  name: string;
  price: number;
  features: { agents: number; tokens: number; storage: number; users: number };
  description: string;
}

export default function CloudSubscriptionPage() {
  const [subscription, setSubscription] = useState<CloudSubscription | null>(null);
  const [plans, setPlans] = useState<CloudPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSubscription();
    fetchPlans();
  }, []);

  const fetchSubscription = async () => {
    try {
      const res = await authedFetch('/api/v1/cloud/subscription');
      if (res.ok) {
        const data = await res.json();
        setSubscription(data);
      }
    } catch (e) {
      console.error('Failed to fetch subscription:', e);
    }
  };

  const fetchPlans = async () => {
    try {
      const res = await authedFetch('/api/v1/cloud/plans');
      if (res.ok) {
        const data = await res.json();
        setPlans(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Failed to fetch plans:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (planId: string) => {
    try {
      const res = await authedFetch('/api/v1/cloud/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId }),
      });
      if (res.ok) {
        alert('订阅成功');
        fetchSubscription();
      } else {
        const data = await res.json();
        alert(`订阅失败: ${data.error || '未知错误'}`);
      }
    } catch (e) {
      console.error('Failed to subscribe:', e);
      alert('订阅失败');
    }
  };

  const handleCancel = async () => {
    if (!confirm('确定要取消订阅吗？')) return;
    try {
      const res = await authedFetch('/api/v1/cloud/subscription', { method: 'DELETE' });
      if (res.ok) {
        alert('订阅已取消');
        fetchSubscription();
      }
    } catch (e) {
      console.error('Failed to cancel subscription:', e);
    }
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>云端订阅管理</h1>

      {subscription && subscription.plan !== 'free' && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>当前订阅</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>套餐</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{plans.find(p => p.id === subscription.plan)?.name || subscription.plan}</div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>状态</div>
              <span className="badge badge-success">{subscription.status}</span>
            </div>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>当前周期</div>
              <div style={{ fontSize: 14 }}>
                {subscription.current_period_start ? new Date(subscription.current_period_start).toLocaleDateString() : '-'}
                {' ~ '}
                {subscription.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : '-'}
              </div>
            </div>
          </div>
          {subscription.cancel_at_period_end && (
            <div style={{ marginTop: 12, padding: 8, background: 'var(--warning-bg)', borderRadius: 4, color: 'var(--warning)', fontSize: 13 }}>
              订阅将在当前周期结束时取消
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <button className="btn btn-secondary" onClick={handleCancel} disabled={subscription.cancel_at_period_end}>
              取消订阅
            </button>
          </div>
        </div>
      )}

      <h3 style={{ marginBottom: 16 }}>选择套餐</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {plans.map(plan => (
          <div key={plan.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{plan.name}</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>{plan.description}</p>
            <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
              ¥{plan.price}<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>/月</span>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, marginBottom: 16, flex: 1 }}>
              <li style={{ fontSize: 13, padding: '4 0' }}>Agent 数量: {plan.features.agents === -1 ? '不限' : plan.features.agents}</li>
              <li style={{ fontSize: 13, padding: '4 0' }}>Token 额度: {plan.features.tokens >= 1e6 ? (plan.features.tokens / 1e6).toFixed(0) + 'M' : plan.features.tokens}</li>
              <li style={{ fontSize: 13, padding: '4 0' }}>存储空间: {plan.features.storage}GB</li>
              <li style={{ fontSize: 13, padding: '4 0' }}>用户数: {plan.features.users === -1 ? '不限' : plan.features.users}</li>
            </ul>
            <button
              className="btn btn-primary"
              onClick={() => handleSubscribe(plan.id)}
              disabled={subscription?.plan === plan.id}
            >
              {subscription?.plan === plan.id ? '当前套餐' : '选择'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
