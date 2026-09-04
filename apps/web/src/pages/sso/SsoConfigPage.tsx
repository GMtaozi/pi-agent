import { authedFetch } from '../../lib/api';
import { useState, useEffect } from 'react';

interface SsoConfig {
  id: string;
  tenant_id: string;
  provider: string;
  config: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  wecom: '企业微信',
  dingtalk: '钉钉',
  azure_ad: 'Azure AD',
  saml: 'SAML 2.0',
  oidc: 'OIDC',
};

export default function SsoConfigPage() {
  const [configs, setConfigs] = useState<SsoConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [provider, setProvider] = useState('wecom');
  const [configJson, setConfigJson] = useState('{}');
  const [enabled, setEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      const res = await authedFetch('/api/v1/sso/config');
      if (res.ok) {
        const data = await res.json();
        setConfigs(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Failed to fetch SSO configs:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let parsedConfig: Record<string, unknown>;
    try {
      parsedConfig = JSON.parse(configJson);
    } catch {
      alert('配置 JSON 格式错误');
      return;
    }

    setSubmitting(true);
    try {
      const res = await authedFetch('/api/v1/sso/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, config: parsedConfig, enabled }),
      });

      if (res.ok) {
        alert('配置创建成功');
        setShowForm(false);
        setConfigJson('{}');
        fetchConfigs();
      } else {
        const data = await res.json();
        alert(`创建失败: ${data.error || '未知错误'}`);
      }
    } catch (e) {
      console.error('Failed to create SSO config:', e);
      alert('创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (id: string, currentEnabled: boolean) => {
    try {
      const res = await authedFetch(`/api/v1/sso/config/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !currentEnabled }),
      });
      if (res.ok) {
        fetchConfigs();
      }
    } catch (e) {
      console.error('Failed to toggle SSO config:', e);
    }
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>SSO 配置管理</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? '取消' : '添加配置'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card" style={{ marginBottom: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Provider</label>
            <select value={provider} onChange={e => setProvider(e.target.value)} className="select">
              {Object.entries(PROVIDER_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>配置 (JSON)</label>
            <textarea
              value={configJson}
              onChange={e => setConfigJson(e.target.value)}
              className="input"
              rows={6}
              placeholder='{"appId": "xxx", "secret": "xxx"}'
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
              <span style={{ fontSize: 13 }}>启用</span>
            </label>
          </div>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? '保存中...' : '保存'}
          </button>
        </form>
      )}

      <div className="card">
        {configs.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 20 }}>暂无 SSO 配置</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {configs.map(c => (
                <tr key={c.id}>
                  <td>{PROVIDER_LABELS[c.provider] || c.provider}</td>
                  <td>
                    <span className={`badge ${c.enabled ? 'badge-success' : 'badge-secondary'}`}>
                      {c.enabled ? '已启用' : '已禁用'}
                    </span>
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{new Date(c.created_at).toLocaleString()}</td>
                  <td>
                    <button className="btn btn-secondary" onClick={() => handleToggle(c.id, c.enabled)}>
                      {c.enabled ? '禁用' : '启用'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
