import { authedFetch } from '../lib/api';
import { useState, useEffect } from 'react';

interface AuditEntry {
  id: string;
  action: string;
  actor: string;
  resource: string;
  timestamp: string;
  details?: string;
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const url = filter 
        ? '/api/audit/logs?action=' + encodeURIComponent(filter) 
        : '/api/audit/logs';
      const res = await authedFetch(url);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (e) {
      console.error('Failed to fetch audit logs:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>审计日志</h1>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <input
            className="input"
            placeholder="搜索操作类型..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn btn-secondary" onClick={fetchLogs}>
            搜索
          </button>
        </div>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>时间</th>
              <th>操作</th>
              <th>执行者</th>
              <th>资源</th>
              <th>详情</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                  暂无审计日志
                </td>
              </tr>
            ) : logs.map(log => (
              <tr key={log.id}>
                <td style={{ color: 'var(--text-secondary)', fontSize: 13, whiteSpace: 'nowrap' }}>
                  {new Date(log.timestamp).toLocaleString()}
                </td>
                <td>
                  <span className="badge badge-success">{log.action}</span>
                </td>
                <td>{log.actor}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{log.resource}</td>
                <td style={{ maxWidth: 300, color: 'var(--text-secondary)', fontSize: 13 }}>
                  {log.details || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
