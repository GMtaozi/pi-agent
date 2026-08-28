import { useState, useEffect } from 'react';
import { X, ShieldCheck, ShieldAlert, Ban } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { getFriendlyMessage } from '../lib/errors';

interface GovernanceRule {
  id: string;
  name: string;
  description?: string;
  enabled?: boolean;
  action?: string;
}

interface GovernanceSettingsResponse {
  approvalRequired?: boolean;
  maxConcurrency?: number;
  retentionDays?: number;
  enabledTools?: string[];
}

function GovernanceSettings() {
  const [settings, setSettings] = useState<GovernanceSettingsResponse>({
    approvalRequired: false,
    maxConcurrency: 3,
    retentionDays: 30,
    enabledTools: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [blockedCount] = useState(12);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch<GovernanceRule[]>('/governance/rules')
      .then(data => {
        if (!cancelled) {
          // Map available rule metadata to local settings state where possible.
          const approvalRule = (Array.isArray(data) ? data : []).find((r: GovernanceRule) => /bash|审批|approval/i.test(r.name || ''));
          setSettings(prev => ({
            ...prev,
            approvalRequired: approvalRule?.enabled ?? prev.approvalRequired,
          }));
        }
      })
      .catch(err => {
        if (!cancelled) setError(getFriendlyMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      // TODO: replace with real backend endpoint when available.
      await new Promise(resolve => setTimeout(resolve, 300));
      setSuccess('治理策略已保存（演示模式）');
    } catch (err) {
      setError(getFriendlyMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="settings-loading">加载中...</div>;
  }

  return (
    <div className="governance-settings">
      <div className="page-header">
        <h2>🛡️ 治理策略</h2>
        <p>控制 Agent 的权限边界与风险操作审批流。</p>
      </div>

      {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError(null)}><X size={16} /></button></div>}
      {success && <div className="success-banner"><span>{success}</span><button onClick={() => setSuccess(null)}><X size={16} /></button></div>}

      <div className="config-card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShieldCheck size={18} />
            <div>
              <div className="title">文件写入</div>
              <div className="desc">限制 Agent 只能写入 workspace 目录</div>
            </div>
          </div>
          <div className="card-actions">
            <span className="tag success">已启用</span>
          </div>
        </div>
        <div className="card-header" style={{ borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShieldAlert size={18} />
            <div>
              <div className="title">Bash 命令审批</div>
              <div className="desc">执行高风险命令前需要用户审批</div>
            </div>
          </div>
          <div className="card-actions">
            <div className={`toggle ${settings.approvalRequired ? 'active' : ''}`} onClick={() => setSettings(prev => ({ ...prev, approvalRequired: !prev.approvalRequired }))}>
              <div className="knob" />
            </div>
          </div>
        </div>
        <div className="card-header" style={{ borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Ban size={18} />
            <div>
              <div className="title">危险命令拦截</div>
              <div className="desc">自动拦截 rm -rf /, sudo, chmod 777 等</div>
            </div>
          </div>
          <div className="card-actions">
            <span className="tag danger">已阻止 {blockedCount} 次</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '保存配置'}
        </button>
      </div>
    </div>
  );
}

export default GovernanceSettings;
