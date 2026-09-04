import { authedFetch } from '../../lib/api';
import { useState, useEffect } from 'react';

interface AuditLogEntry {
  id: string;
  seq: number;
  timestamp: string;
  actor_id?: string;
  actor_type: string;
  action: string;
  category?: string;
  resource_type?: string;
  resource_id?: string;
  result: string;
  ip?: string;
  request_id?: string;
  details?: Record<string, unknown>;
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState({
    action: '',
    actor_id: '',
    start_time: '',
    end_time: '',
  });
  const [showVerify, setShowVerify] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any>(null);

  const pageSize = 50;

  useEffect(() => {
    fetchLogs();
  }, [page]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
      });
      if (filters.action) params.set('action', filters.action);
      if (filters.actor_id) params.set('actor_id', filters.actor_id);
      if (filters.start_time) params.set('start_time', filters.start_time);
      if (filters.end_time) params.set('end_time', filters.end_time);

      const res = await authedFetch(`/api/v1/audit-logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.data || []);
        setTotal(data.total || 0);
      }
    } catch (e) {
      console.error('Failed to fetch audit logs:', e);
    } finally {
      setLoading(false);
    }
  };

  const verifyChain = async () => {
    try {
      const res = await authedFetch('/api/v1/audit-logs/verify', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setVerifyResult(data);
        setShowVerify(true);
      }
    } catch (e) {
      console.error('Failed to verify chain:', e);
    }
  };

  const exportLogs = async (format: 'json' | 'csv') => {
    try {
      const res = await authedFetch(`/api/v1/audit-logs/export?format=${format}`);
      if (res.ok) {
        if (format === 'csv') {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'audit-logs.csv';
          a.click();
        } else {
          const data = await res.json();
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'audit-logs.json';
          a.click();
        }
      }
    } catch (e) {
      console.error('Failed to export logs:', e);
    }
  };

  const getResultBadge = (result: string) => {
    const map: Record<string, string> = {
      success: 'badge-success',
      failure: 'badge-error',
      denied: 'badge-warning',
      error: 'badge-error',
    };
    return map[result] || 'badge-warning';
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>审计日志</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={verifyChain}>验证哈希链</button>
          <button className="btn btn-secondary" onClick={() => exportLogs('csv')}>导出 CSV</button>
          <button className="btn btn-secondary" onClick={() => exportLogs('json')}>导出 JSON</button>
        </div>
      </div>

      {showVerify && verifyResult && (
        <div className="card" style={{ marginBottom: 24, background: verifyResult.valid ? 'var(--success-bg)' : 'var(--error-bg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>哈希链验证结果：</strong>
              {verifyResult.valid ? (
                <span style={{ color: 'var(--success)' }}>✓ 有效（共 {verifyResult.total_checked} 条记录）</span>
              ) : (
                <span style={{ color: 'var(--error)' }}>
                  ✗ 无效 — 第 {verifyResult.first_invalid_seq} 条记录异常：{verifyResult.reason}
                </span>
              )}
            </div>
            <button className="btn btn-sm btn-secondary" onClick={() => setShowVerify(false)}>关闭</button>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>操作类型</label>
            <input className="input" value={filters.action} onChange={e => setFilters({ ...filters, action: e.target.value })} placeholder="如: read, write" style={{ width: 150 }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>操作者</label>
            <input className="input" value={filters.actor_id} onChange={e => setFilters({ ...filters, actor_id: e.target.value })} placeholder="用户 ID" style={{ width: 150 }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>开始时间</label>
            <input className="input" type="datetime-local" value={filters.start_time} onChange={e => setFilters({ ...filters, start_time: e.target.value })} style={{ width: 180 }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>结束时间</label>
            <input className="input" type="datetime-local" value={filters.end_time} onChange={e => setFilters({ ...filters, end_time: e.target.value })} style={{ width: 180 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-primary" onClick={() => { setPage(0); fetchLogs(); }}>搜索</button>
          </div>
        </div>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>序号</th>
              <th>时间</th>
              <th>操作者</th>
              <th>操作</th>
              <th>类别</th>
              <th>资源</th>
              <th>结果</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40 }}>加载中...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>暂无审计日志</td></tr>
            ) : logs.map(log => (
              <tr key={log.id}>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{log.seq}</td>
                <td style={{ fontSize: 13 }}>{new Date(log.timestamp).toLocaleString()}</td>
                <td style={{ fontSize: 13 }}>{log.actor_id || '-'}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{log.action}</td>
                <td style={{ fontSize: 13 }}>{log.category || '-'}</td>
                <td style={{ fontSize: 13 }}>{log.resource_type ? `${log.resource_type}:${log.resource_id || '*'}` : '-'}</td>
                <td><span className={`badge ${getResultBadge(log.result)}`}>{log.result}</span></td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{log.ip || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>上一页</button>
          <span style={{ display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 14 }}>
            第 {page + 1} / {totalPages} 页（共 {total} 条）
          </span>
          <button className="btn btn-secondary" onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}>下一页</button>
        </div>
      )}
    </div>
  );
}
