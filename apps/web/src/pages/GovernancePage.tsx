import { authedFetch } from '../lib/api';
import { useState, useEffect } from 'react';

interface Request {
  id: string;
  type: string;
  status: 'pending' | 'approved' | 'rejected';
  createdBy: string;
  createdAt: string;
  description: string;
}

export default function GovernancePage() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRequests();
  }, [filter]);

  const fetchRequests = async () => {
    try {
      const res = await authedFetch('/approvals');
      if (res.ok) {
        const data = await res.json();
        const all: Request[] = Array.isArray(data) ? data : (data.requests || []);
        setRequests(filter === 'all' ? all : all.filter(r => r.status === filter));
      }
    } catch (e) {
      console.error('Failed to fetch requests:', e);
    } finally {
      setLoading(false);
    }
  };

  const approveRequest = async (id: string) => {
    await authedFetch('/approvals/' + id + '/approve', { method: 'POST' });
    fetchRequests();
  };

  const rejectRequest = async (id: string) => {
    await authedFetch('/approvals/' + id + '/reject', { method: 'POST' });
    fetchRequests();
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'badge-warning',
      approved: 'badge-success',
      rejected: 'badge-error'
    };
    return map[status] || 'badge-warning';
  };

  const getStatusText = (status: string) => {
    const map: Record<string, string> = {
      pending: '待审批',
      approved: '已批准',
      rejected: '已拒绝'
    };
    return map[status] || status;
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>治理</h1>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {['all', 'pending', 'approved', 'rejected'].map(status => (
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
              <th>类型</th>
              <th>描述</th>
              <th>创建人</th>
              <th>状态</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                  暂无审批请求
                </td>
              </tr>
            ) : requests.map(req => (
              <tr key={req.id}>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{req.id.slice(0, 8)}</td>
                <td>{req.type}</td>
                <td style={{ maxWidth: 300 }}>{req.description}</td>
                <td>{req.createdBy}</td>
                <td>
                  <span className={`badge ${getStatusBadge(req.status)}`}>
                    {getStatusText(req.status)}
                  </span>
                </td>
                <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                  {new Date(req.createdAt).toLocaleString()}
                </td>
                <td>
                  {req.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-sm btn-primary" onClick={() => approveRequest(req.id)}>
                        批准
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => rejectRequest(req.id)}>
                        拒绝
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
