import { useState, useEffect } from 'react';
import { Plus, X, Trash2, RefreshCw, Wifi, WifiOff, Server } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { getFriendlyMessage } from '../../lib/errors';

interface McpConnection {
  id: string;
  tenant_id: string;
  server_id: string;
  transport: 'stdio' | 'http' | 'sse';
  endpoint: string | null;
  status: 'connected' | 'disconnected' | 'error' | 'syncing';
  last_sync_at: string | null;
  created_at: string;
  toolCount?: number;
}

interface McpTool {
  connection_id: string;
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

const TRANSPORT_LABELS: Record<string, string> = {
  'stdio': '标准输入输出',
  'http': 'HTTP',
  'sse': 'SSE',
};

const STATUS_LABELS: Record<string, string> = {
  'connected': '已连接',
  'disconnected': '已断开',
  'error': '错误',
  'syncing': '同步中',
};

const STATUS_COLORS: Record<string, string> = {
  'connected': '#22c55e',
  'disconnected': '#6b7280',
  'error': '#ef4444',
  'syncing': '#f59e0b',
};

export default function McpConfigPage() {
  const [connections, setConnections] = useState<McpConnection[]>([]);
  const [tools, setTools] = useState<McpTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newServerId, setNewServerId] = useState('');
  const [newTransport, setNewTransport] = useState<'stdio' | 'http' | 'sse'>('stdio');
  const [newEndpoint, setNewEndpoint] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchConnections = async () => {
    try {
      const data = await apiFetch<McpConnection[]>('/v1/mcp/connections');
      setConnections(data || []);
    } catch (err) {
      setError(getFriendlyMessage(err));
    }
  };

  const fetchTools = async () => {
    try {
      const data = await apiFetch<{ tools: McpTool[]; count: number }>('/v1/mcp/tools');
      setTools(data?.tools || []);
    } catch {
      // 忽略工具列表获取失败
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchConnections(), fetchTools()])
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleAddConnection = async () => {
    if (!newServerId.trim()) {
      setError('Server ID 是必填项');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await apiFetch('/v1/mcp/connections', {
        method: 'POST',
        body: JSON.stringify({
          server_id: newServerId.trim(),
          transport: newTransport,
          endpoint: newEndpoint || undefined,
        }),
      });
      setShowAddModal(false);
      setNewServerId('');
      setNewTransport('stdio');
      setNewEndpoint('');
      await fetchConnections();
    } catch (e) {
      setError(getFriendlyMessage(e));
    } finally {
      setAdding(false);
    }
  };

  const handleSync = async (id: string) => {
    setError(null);
    try {
      await apiFetch(`/v1/mcp/connections/${encodeURIComponent(id)}/sync`, {
        method: 'POST',
        body: JSON.stringify({ tools: [] }),
      });
      await Promise.all([fetchConnections(), fetchTools()]);
    } catch (e) {
      setError(getFriendlyMessage(e));
    }
  };

  const handleDisconnect = async (id: string) => {
    setError(null);
    try {
      await apiFetch(`/v1/mcp/connections/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await fetchConnections();
    } catch (e) {
      setError(getFriendlyMessage(e));
    }
  };

  return (
    <div className="skills-page">
      <div className="skills-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>MCP 接入配置</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 14 }}>管理 MCP server 连接，同步工具清单</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          <Plus size={14} /> 添加连接
        </button>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}><span>{error}</span><button onClick={() => setError(null)}><X size={16} /></button></div>}

      {loading ? (
        <div className="settings-loading">加载连接...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
          {/* 连接列表 */}
          <div>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>连接列表</h3>
            {connections.length === 0 ? (
              <div className="settings-empty" style={{ padding: '40px 0' }}>
                <Server size={32} style={{ marginBottom: 12, opacity: 0.5 }} />
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>暂无 MCP 连接</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {connections.map(conn => (
                  <div key={conn.id} className="config-card" style={{ padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 500 }}>{conn.server_id}</span>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 12,
                            color: STATUS_COLORS[conn.status]
                          }}>
                            {conn.status === 'connected' ? <Wifi size={12} /> : <WifiOff size={12} />}
                            {STATUS_LABELS[conn.status]}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                          {TRANSPORT_LABELS[conn.transport]} {conn.endpoint ? `· ${conn.endpoint}` : ''}
                        </div>
                        {conn.last_sync_at && (
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                            最后同步: {new Date(conn.last_sync_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px' }}
                          onClick={() => handleSync(conn.id)}
                          title="同步工具清单"
                        >
                          <RefreshCw size={14} />
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px' }}
                          onClick={() => handleDisconnect(conn.id)}
                          title="断开连接"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 工具列表 */}
          <div>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>可用工具 ({tools.length})</h3>
            {tools.length === 0 ? (
              <div className="settings-empty" style={{ padding: '40px 0' }}>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>暂无可用工具</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tools.map((tool, idx) => (
                  <div key={`${tool.connection_id}-${tool.name}-${idx}`} className="config-card" style={{ padding: 12 }}>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{tool.name}</div>
                    {tool.description && (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                        {tool.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 添加连接弹窗 */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="config-card" style={{ padding: 24, width: 480, maxWidth: '90vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>添加 MCP 连接</h3>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setShowAddModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="form-item">
              <label className="form-label">Server ID *</label>
              <input
                className="input"
                value={newServerId}
                onChange={e => setNewServerId(e.target.value)}
                placeholder="如：my-mcp-server"
              />
            </div>

            <div className="form-item" style={{ marginTop: 12 }}>
              <label className="form-label">传输方式</label>
              <select
                className="input"
                value={newTransport}
                onChange={e => setNewTransport(e.target.value as 'stdio' | 'http' | 'sse')}
              >
                <option value="stdio">标准输入输出 (stdio)</option>
                <option value="http">HTTP</option>
                <option value="sse">SSE</option>
              </select>
            </div>

            {newTransport !== 'stdio' && (
              <div className="form-item" style={{ marginTop: 12 }}>
                <label className="form-label">端点 URL</label>
                <input
                  className="input"
                  value={newEndpoint}
                  onChange={e => setNewEndpoint(e.target.value)}
                  placeholder="https://mcp.example.com/api"
                />
              </div>
            )}

            <div style={{ marginTop: 20, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={handleAddConnection} disabled={adding}>
                <Plus size={14} /> {adding ? '添加中...' : '添加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
