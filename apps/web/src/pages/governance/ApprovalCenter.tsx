import { authedFetch } from '../../lib/api';
import { useState, useEffect } from 'react';

interface ApprovalInstance {
  id: string;
  workflow_id: string;
  resource_type: string;
  resource_id: string;
  requester_id: string;
  current_step: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'escalated';
  sla_due_at?: string;
  escalation_level: number;
  created_at: string;
  records?: ApprovalRecord[];
}

interface ApprovalRecord {
  id: string;
  step: number;
  approver_id?: string;
  decision?: string;
  comment?: string;
  created_at: string;
}

export default function ApprovalCenter() {
  const [approvals, setApprovals] = useState<ApprovalInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('pending');
  const [selectedApproval, setSelectedApproval] = useState<ApprovalInstance | null>(null);
  const [comment, setComment] = useState('');

  useEffect(() => {
    fetchApprovals();
  }, [filter]);

  const fetchApprovals = async () => {
    setLoading(true);
    try {
      const params = filter !== 'all' ? `?status=${filter}` : '';
      const res = await authedFetch(`/api/v1/approvals${params}`);
      if (res.ok) {
        const data = await res.json();
        setApprovals(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Failed to fetch approvals:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchDetail = async (id: string) => {
    try {
      const res = await authedFetch(`/api/v1/approvals/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedApproval(data);
      }
    } catch (e) {
      console.error('Failed to fetch approval detail:', e);
    }
  };

  const decide = async (id: string, decision: 'approved' | 'rejected') => {
    try {
      const res = await authedFetch(`/api/v1/approvals/${id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, comment }),
      });
      if (res.ok) {
        setComment('');
        fetchApprovals();
        setSelectedApproval(null);
      }
    } catch (e) {
      console.error('Failed to decide:', e);
    }
  };

  const cancel = async (id: string) => {
    try {
      const res = await authedFetch(`/api/v1/approvals/${id}/cancel`, { method: 'POST' });
      if (res.ok) {
        fetchApprovals();
        setSelectedApproval(null);
      }
    } catch (e) {
      console.error('Failed to cancel:', e);
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'badge-warning',
      approved: 'badge-success',
      rejected: 'badge-error',
      cancelled: 'badge-secondary',
      escalated: 'badge-warning',
    };
    return map[status] || 'badge-warning';
  };

  const getStatusText = (status: string) => {
    const map: Record<string, string> = {
      pending: '待审批',
      approved: '已批准',
      rejected: '已拒绝',
      cancelled: '已撤回',
      escalated: '已升级',
    };
    return map[status] || status;
  };

  const isOverdue = (slaDueAt?: string) => {
    if (!slaDueAt) return false;
    return new Date(slaDueAt) < new Date();
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>审批中心</h1>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {['all', 'pending', 'approved', 'rejected', 'cancelled'].map(status => (
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
              <th>ID</th>
              <th>资源类型</th>
              <th>资源 ID</th>
              <th>申请人</th>
              <th>当前步骤</th>
              <th>状态</th>
              <th>SLA 截止</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {approvals.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>暂无审批记录</td></tr>
            ) : approvals.map(a => (
              <tr key={a.id}>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{a.id.slice(0, 8)}</td>
                <td>{a.resource_type}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{a.resource_id.slice(0, 8)}</td>
                <td>{a.requester_id}</td>
                <td>{a.current_step}</td>
                <td>
                  <span className={`badge ${getStatusBadge(a.status)}`}>
                    {getStatusText(a.status)}
                  </span>
                  {a.escalation_level > 0 && (
                    <span style={{ marginLeft: 4, fontSize: 11, color: 'var(--warning)' }}>↑{a.escalation_level}</span>
                  )}
                </td>
                <td style={{ fontSize: 13, color: isOverdue(a.sla_due_at) ? 'var(--error)' : 'var(--text-secondary)' }}>
                  {a.sla_due_at ? new Date(a.sla_due_at).toLocaleString() : '-'}
                </td>
                <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{new Date(a.created_at).toLocaleString()}</td>
                <td>
                  <button className="btn btn-sm btn-secondary" onClick={() => fetchDetail(a.id)}>详情</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedApproval && (
        <div className="modal-overlay" onClick={() => setSelectedApproval(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3>审批详情</h3>
              <button className="btn btn-sm btn-secondary" onClick={() => setSelectedApproval(null)}>关闭</button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <p><strong>资源：</strong>{selectedApproval.resource_type} / {selectedApproval.resource_id}</p>
              <p><strong>申请人：</strong>{selectedApproval.requester_id}</p>
              <p><strong>状态：</strong>{getStatusText(selectedApproval.status)}</p>
            </div>
            {selectedApproval.records && selectedApproval.records.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ marginBottom: 8 }}>审批记录</h4>
                {selectedApproval.records.map(r => (
                  <div key={r.id} style={{ padding: 8, background: 'var(--bg-secondary)', borderRadius: 4, marginBottom: 4 }}>
                    <span>步骤 {r.step}: {r.decision || '待决定'}</span>
                    {r.comment && <span style={{ marginLeft: 8, color: 'var(--text-secondary)' }}>— {r.comment}</span>}
                  </div>
                ))}
              </div>
            )}
            {selectedApproval.status === 'pending' && (
              <div>
                <textarea
                  className="input"
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="审批意见（可选）"
                  style={{ width: '100%', minHeight: 60, marginBottom: 8 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" onClick={() => decide(selectedApproval.id, 'approved')}>批准</button>
                  <button className="btn btn-danger" onClick={() => decide(selectedApproval.id, 'rejected')}>拒绝</button>
                  <button className="btn btn-secondary" onClick={() => cancel(selectedApproval.id)}>撤回</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
