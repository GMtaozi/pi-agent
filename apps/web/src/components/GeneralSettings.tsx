import { useState, useEffect } from 'react';
import { X, Palette, Cpu, Boxes, Route, ArrowRight } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { getFriendlyMessage } from '../lib/errors';

interface GeneralSettingsProps {
  onGoTo?: (tab: 'api-keys' | 'model-router' | 'advanced') => void;
}

interface SettingsOverview {
  theme?: string;
  apiKeys?: Record<string, string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  customProviders?: Array<any>;
}

/**
 * 「通用」面板：仅展示系统真实存在的配置状态（数据来自实际 API）。
 * 不包含尚无后端支撑的演示性配置项。
 */
function GeneralSettings({ onGoTo }: GeneralSettingsProps) {
  const [overview, setOverview] = useState<SettingsOverview | null>(null);
  const [customModelCount, setCustomModelCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 主题以 DOM 上实际生效的为准，避免与服务端配置不一致时显示错误
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
  );

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('app-theme', next);
    } catch {
      // ignore
    }
    apiFetch('/settings/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: next })
    }).catch(() => {
      // 持久化失败时保持当前外观，下次启动会回到服务端配置
    });
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiFetch<SettingsOverview>('/settings'),
      // 后端返回 { models: [...] }，这里解包统计数量
      apiFetch<{ models?: Array<unknown> }>('/models/custom').catch(() => null),
    ])
      .then(([settings, customModels]) => {
        if (cancelled) return;
        setOverview(settings);
        setCustomModelCount(Array.isArray(customModels?.models) ? customModels!.models!.length : null);
      })
      .catch(err => {
        if (!cancelled) setError(getFriendlyMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <div className="settings-loading">加载中...</div>;
  }

  // 按供应商 ID 去重统计（添加供应商会同时写入 customProviders 与 apiKeys）
  const providerIds = new Set<string>([
    ...(overview?.customProviders || []).map(p => p.id as string),
    ...Object.keys(overview?.apiKeys || {})
  ]);
  const providerCount = providerIds.size;

  return (
    <div className="general-settings">
      <div className="page-header">
        <h2>⚙️ 通用设置</h2>
        <p>查看系统当前的配置状态，点击卡片进入对应管理面板。</p>
      </div>

      {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError(null)}><X size={16} /></button></div>}

      {/* 外观 */}
      <div
        className="config-card"
        style={{ cursor: 'pointer' }}
        onClick={toggleTheme}
        title="点击切换浅色 / 深色"
      >
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Palette size={18} style={{ color: 'var(--text-secondary)' }} />
            <div>
              <div className="title">界面主题</div>
              <div className="desc">当前应用外观，点击切换</div>
            </div>
          </div>
          <div className="card-actions">
            <span className="tag info">{theme === 'light' ? '浅色' : '深色'}</span>
          </div>
        </div>
      </div>

      {/* 模型供应商概览 */}
      <div
        className="config-card"
        style={{ cursor: 'pointer' }}
        onClick={() => onGoTo?.('api-keys')}
      >
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Cpu size={18} style={{ color: 'var(--text-secondary)' }} />
            <div>
              <div className="title">模型供应商</div>
              <div className="desc">已接入的模型服务与 API 密钥</div>
            </div>
          </div>
          <div className="card-actions">
            <span className="tag success">{providerCount} 个已配置</span>
            <ArrowRight size={16} style={{ color: 'var(--text-muted)' }} />
          </div>
        </div>
      </div>

      {/* 自定义模型概览 */}
      <div
        className="config-card"
        style={{ cursor: 'pointer' }}
        onClick={() => onGoTo?.('api-keys')}
      >
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Boxes size={18} style={{ color: 'var(--text-secondary)' }} />
            <div>
              <div className="title">自定义模型</div>
              <div className="desc">独立配置 endpoint 与密钥的模型</div>
            </div>
          </div>
          <div className="card-actions">
            <span className="tag info">{customModelCount != null ? `${customModelCount} 个` : '-'}</span>
            <ArrowRight size={16} style={{ color: 'var(--text-muted)' }} />
          </div>
        </div>
      </div>

      {/* 路由入口 */}
      <div
        className="config-card"
        style={{ cursor: 'pointer' }}
        onClick={() => onGoTo?.('model-router')}
      >
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Route size={18} style={{ color: 'var(--text-secondary)' }} />
            <div>
              <div className="title">智能路由</div>
              <div className="desc">模型与工具的自动分配策略</div>
            </div>
          </div>
          <div className="card-actions">
            <ArrowRight size={16} style={{ color: 'var(--text-muted)' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default GeneralSettings;
