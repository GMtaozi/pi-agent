import { authedFetch } from '../../lib/api';
import { useState, useEffect } from 'react';

interface CloudPlan {
  id: string;
  name: string;
  price: number;
  features: { agents: number; tokens: number; storage: number; users: number };
  description: string;
}

export default function CloudPlansPage() {
  const [plans, setPlans] = useState<CloudPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlans();
  }, []);

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

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>套餐对比</h1>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>套餐</th>
              <th>价格</th>
              <th>Agent 数量</th>
              <th>Token 额度</th>
              <th>存储空间</th>
              <th>用户数</th>
            </tr>
          </thead>
          <tbody>
            {plans.map(plan => (
              <tr key={plan.id}>
                <td style={{ fontWeight: 600 }}>{plan.name}</td>
                <td style={{ fontWeight: 600 }}>¥{plan.price}/月</td>
                <td>{plan.features.agents === -1 ? '不限' : plan.features.agents}</td>
                <td>{plan.features.tokens >= 1e6 ? (plan.features.tokens / 1e6).toFixed(0) + 'M' : plan.features.tokens}</td>
                <td>{plan.features.storage}GB</td>
                <td>{plan.features.users === -1 ? '不限' : plan.features.users}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
