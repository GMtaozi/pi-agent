import { authedFetch } from '../../lib/api';
import { useState, useEffect } from 'react';

interface Invoice {
  id: string;
  subscription_id?: string;
  tenant_id: string;
  period_start: string;
  period_end: string;
  amount: number;
  currency: string;
  status: 'draft' | 'issued' | 'paid' | 'overdue' | 'void';
  paid_at?: string;
  created_at: string;
}

export default function BillingCenter() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    try {
      const res = await authedFetch('/api/v1/billing/invoices');
      if (res.ok) {
        const data = await res.json();
        setInvoices(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Failed to fetch invoices:', e);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      draft: 'badge-secondary',
      issued: 'badge-warning',
      paid: 'badge-success',
      overdue: 'badge-error',
      void: 'badge-secondary',
    };
    return map[status] || 'badge-secondary';
  };

  const getStatusText = (status: string) => {
    const map: Record<string, string> = {
      draft: '草稿',
      issued: '已出账',
      paid: '已支付',
      overdue: '逾期',
      void: '作废',
    };
    return map[status] || status;
  };

  const filteredInvoices = filter === 'all'
    ? invoices
    : invoices.filter(i => i.status === filter);

  const totalAmount = filteredInvoices.reduce((sum, i) => sum + i.amount, 0);
  const paidAmount = filteredInvoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.amount, 0);
  const unpaidAmount = totalAmount - paidAmount;

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>账单中心</h1>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>总金额</div>
          <div style={{ fontSize: 28, fontWeight: 600 }}>${totalAmount.toFixed(2)}</div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>已支付</div>
          <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--success)' }}>${paidAmount.toFixed(2)}</div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>未支付</div>
          <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--error)' }}>${unpaidAmount.toFixed(2)}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {['all', 'draft', 'issued', 'paid', 'overdue', 'void'].map(status => (
            <button
              key={status}
              className={`btn ${filter === status ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter(status)}
            >
              {status === 'all' ? '全部' : getStatusText(status)}
            </button>
          ))}
        </div>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>账单 ID</th>
              <th>账期</th>
              <th>金额</th>
              <th>货币</th>
              <th>状态</th>
              <th>支付时间</th>
              <th>创建时间</th>
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>暂无账单记录</td></tr>
            ) : filteredInvoices.map(inv => (
              <tr key={inv.id}>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{inv.id.slice(0, 8)}</td>
                <td style={{ fontSize: 13 }}>
                  {new Date(inv.period_start).toLocaleDateString()} - {new Date(inv.period_end).toLocaleDateString()}
                </td>
                <td style={{ fontWeight: 600 }}>${inv.amount.toFixed(2)}</td>
                <td>{inv.currency}</td>
                <td><span className={`badge ${getStatusBadge(inv.status)}`}>{getStatusText(inv.status)}</span></td>
                <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {inv.paid_at ? new Date(inv.paid_at).toLocaleString() : '-'}
                </td>
                <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {new Date(inv.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
