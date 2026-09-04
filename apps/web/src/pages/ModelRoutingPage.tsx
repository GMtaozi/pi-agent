import { useState, useEffect } from 'react';
import { ArrowLeft, Route, DollarSign, Zap, Brain } from 'lucide-react';
import type { Model } from '../lib/api';
import { authedFetch } from '../lib/api';

type Strategy = 'balanced' | 'performance' | 'cost' | 'reasoning';

interface ModelRoutingStrategy {
  type: Strategy;
  maxCost?: number;
  preferredModels?: string[];
  fallbackModel?: string;
  autoFallback?: boolean;
}

export default function ModelRoutingPage({ onBack, showHeader = true }: { onBack?: () => void; showHeader?: boolean } = {}) {
  const [models, setModels] = useState<Model[]>([]);
  const [strategy, setStrategy] = useState<ModelRoutingStrategy>({
    type: 'balanced',
    autoFallback: true,
    fallbackModel: 'deepseek-chat',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadModels();
    loadStrategy();
  }, []);

  const loadModels = async () => {
    try {
      const res = await authedFetch('/models');
      if (!res.ok) throw new Error('Failed to load models');
      const data = await res.json();
      const allModels: Model[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      data.providers?.forEach((provider: any) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        provider.models?.forEach((m: any) => {
          allModels.push({
            id: m.id,
            name: m.name,
            provider: provider.id,
            providerName: provider.name,
            contextLength: m.contextLength,
            supportsReasoning: m.supportsReasoning,
            supportsVision: m.supportsVision,
            input: m.input,
          });
        });
      });
      setModels(allModels);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const loadStrategy = async () => {
    try {
      const res = await authedFetch('/model-routing/strategy');
      if (res.ok) {
        const data = await res.json();
        if (data.strategy) {
          setStrategy(data.strategy);
        }
      }
    } catch {
      // Use default strategy
    } finally {
      setLoading(false);
    }
  };

  const saveStrategy = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await authedFetch('/model-routing/strategy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to save strategy' }));
        throw new Error(data.error || 'Failed to save strategy');
      }
      setSuccess('策略已保存');
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const getStrategyIcon = (type: Strategy) => {
    switch (type) {
      case 'performance': return <Zap size={16} />;
      case 'cost': return <DollarSign size={16} />;
      case 'reasoning': return <Brain size={16} />;
      default: return <Route size={16} />;
    }
  };

  const getStrategyLabel = (type: Strategy) => {
    switch (type) {
      case 'performance': return '性能优先';
      case 'cost': return '成本优先';
      case 'reasoning': return '推理优先';
      default: return '均衡';
    }
  };

  if (loading) {
    return (
      <div className="settings-page">
        <div className="settings-header">
          {onBack && (
            <button className="settings-back-btn" onClick={onBack} title="返回对话">
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="settings-header-content">
            <h1 className="settings-title">模型路由</h1>
            <p className="settings-subtitle">加载中...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      {showHeader && (
        <div className="settings-header">
          {onBack && (
            <button className="settings-back-btn" onClick={onBack} title="返回对话">
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="settings-header-content">
            <h1 className="settings-title">模型路由</h1>
            <p className="settings-subtitle">自动选择最优模型，平衡性能、成本和能力</p>
          </div>
        </div>
      )}

      {error && (
        <div className="error-banner" style={{ marginBottom: 16 }}>
          <span>{error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}
      {success && (
        <div className="success-banner" style={{ marginBottom: 16 }}>
          <span>{success}</span>
        </div>
      )}

      <div className="config-card" style={{ marginBottom: 20, padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>路由策略</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(['balanced', 'performance', 'cost', 'reasoning'] as Strategy[]).map((type) => (
            <div
              key={type}
              className="config-card"
              style={{
                padding: 12,
                cursor: 'pointer',
                border: strategy.type === type ? '2px solid var(--accent-color)' : '1px solid var(--border-color)',
              }}
              onClick={() => setStrategy({ ...strategy, type })}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {getStrategyIcon(type)}
                <span style={{ fontWeight: 600 }}>{getStrategyLabel(type)}</span>
                {strategy.type === type && <span className="badge success">当前</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, marginLeft: 24 }}>
                {type === 'balanced' && '均衡性能、成本和推理能力'}
                {type === 'performance' && '优先选择历史成功率最高的模型'}
                {type === 'cost' && '优先选择成本最低的模型'}
                {type === 'reasoning' && '优先选择支持推理的模型'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="config-card" style={{ marginBottom: 20, padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>高级配置</div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
            优先模型（可选）
          </label>
          <select
            value={strategy.preferredModels?.[0] || ''}
            onChange={(e) => setStrategy({
              ...strategy,
              preferredModels: e.target.value ? [e.target.value] : []
            })}
            style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}
          >
            <option value="">无</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.providerName || m.provider})
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
            回退模型
          </label>
          <select
            value={strategy.fallbackModel || 'deepseek-chat'}
            onChange={(e) => setStrategy({ ...strategy, fallbackModel: e.target.value })}
            style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.providerName || m.provider})
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <input
            type="checkbox"
            id="auto-fallback"
            checked={strategy.autoFallback !== false}
            onChange={(e) => setStrategy({ ...strategy, autoFallback: e.target.checked })}
          />
          <label htmlFor="auto-fallback" style={{ fontSize: 13, cursor: 'pointer' }}>
            首选模型失败时自动降级到回退模型
          </label>
        </div>
      </div>

      <div className="config-card" style={{ marginBottom: 20, padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>可用模型</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {models.map((model) => (
            <div
              key={model.id}
              style={{
                padding: 10,
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{model.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {model.providerName || model.provider}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {model.contextLength && (
                  <span className="badge">{(model.contextLength / 1024).toFixed(0)}K</span>
                )}
                {model.supportsReasoning && <span className="badge success">Reasoning</span>}
                {model.supportsVision && <span className="badge info">Vision</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          className="btn btn-primary"
          onClick={saveStrategy}
          disabled={saving}
        >
          {saving ? '保存中...' : '保存策略'}
        </button>
        {onBack && (
          <button className="btn btn-secondary" onClick={onBack}>
            返回
          </button>
        )}
      </div>
    </div>
  );
}
