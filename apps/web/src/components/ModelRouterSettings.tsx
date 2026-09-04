import { useState, useEffect } from 'react';
import { X, Cpu, Bot, Eye, Route as RouteIcon, Wrench } from 'lucide-react';
import {
  getModelRoutingStrategy,
  saveModelRoutingStrategy,
  getToolRoutingStrategy,
  saveToolRoutingStrategy,
  type ModelRoutingStrategy,
  type ToolRoutingStrategy,
} from '../lib/api';
import { getFriendlyMessage } from '../lib/errors';

const ROUTE_CARDS = [
  {
    key: 'small',
    label: '💡 小工具模型',
    model: 'DeepSeek V4 Flash',
    tag: '低成本',
    tagClass: 'success',
    desc: '标题、分类、简单问答',
    icon: Cpu,
  },
  {
    key: 'large',
    label: '🧠 大工具模型',
    model: 'DeepSeek V4 Pro',
    tag: '推理强',
    tagClass: 'info',
    desc: '摘要、拆解、复杂推理',
    icon: Bot,
  },
  {
    key: 'vision',
    label: '👁️ 视觉辅助模型',
    model: 'GPT-4 Vision',
    tag: '按需',
    tagClass: 'warning',
    desc: '多模态、图像理解',
    icon: Eye,
  },
];

const STRATEGY_OPTIONS: Array<{ value: ModelRoutingStrategy['type']; label: string }> = [
  { value: 'balanced', label: '均衡（默认，兼顾性能与成本）' },
  { value: 'performance', label: '性能优先（复杂任务用更强模型）' },
  { value: 'cost', label: '成本优先（尽量使用低成本模型）' },
  { value: 'reasoning', label: '推理优先（深度推理场景加权）' },
];

const TOOL_STRATEGY_OPTIONS: Array<{ value: ToolRoutingStrategy['strategy']; label: string }> = [
  { value: 'auto', label: '自动（按任务智能选择）' },
  { value: 'balanced', label: '均衡' },
  { value: 'performance', label: '性能优先' },
  { value: 'cost', label: '成本优先' },
];

function ModelRouterSettings() {
  const [strategy, setStrategy] = useState<ModelRoutingStrategy>({
    type: 'balanced',
    autoFallback: true,
  });
  const [toolStrategy, setToolStrategy] = useState<ToolRoutingStrategy>({
    strategy: 'auto',
    threshold: 0.7,
    preferredTools: [],
    fallbackTool: 'default',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingTool, setSavingTool] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getModelRoutingStrategy().catch(err => { throw err; }),
      getToolRoutingStrategy().catch(() => null),
    ])
      .then(([modelData, toolData]) => {
        if (cancelled) return;
        if (modelData?.strategy) setStrategy(modelData.strategy);
        if (toolData?.strategy) setToolStrategy(toolData.strategy);
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
      const result = await saveModelRoutingStrategy(strategy);
      if (result?.strategy) setStrategy(result.strategy);
      setSuccess('模型路由配置已保存');
    } catch (err) {
      setError(getFriendlyMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTool = async () => {
    setSavingTool(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await saveToolRoutingStrategy(toolStrategy);
      if (result?.strategy) setToolStrategy(result.strategy);
      setSuccess('工具路由配置已保存');
    } catch (err) {
      setError(getFriendlyMessage(err));
    } finally {
      setSavingTool(false);
    }
  };

  return (
    <div className="model-router-settings">
      <div className="page-header">
        <h2>🧭 模型路由</h2>
        <p>根据任务复杂度自动分配模型，平衡性能与成本。</p>
      </div>

      {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError(null)}><X size={16} /></button></div>}
      {success && <div className="success-banner"><span>{success}</span><button onClick={() => setSuccess(null)}><X size={16} /></button></div>}

      <div className="config-card">
        <div className="card-header">
          <div>
            <div className="title">智能路由</div>
            <div className="desc">开启后，Agent 将自动为任务匹配合适的模型</div>
          </div>
          <div className="card-actions">
            <div
              className={`toggle ${strategy.autoFallback ? 'active' : ''}`}
              onClick={() => setStrategy(prev => ({ ...prev, autoFallback: !prev.autoFallback }))}
            >
              <div className="knob" />
            </div>
          </div>
        </div>

        <div className="route-grid">
          {ROUTE_CARDS.map(route => {
            const Icon = route.icon;
            return (
              <div key={route.key} className="route-item">
                <div className="label">{route.label}</div>
                <div className="value">
                  <span className={`tag ${route.tagClass}`}>{route.tag}</span>
                  <span>{route.model}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
                  <Icon size={16} />
                  {route.desc}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="config-card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <div>
            <div className="title">路由策略</div>
            <div className="desc">智能分配模型时遵循的优化方向</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <RouteIcon size={16} style={{ color: 'var(--text-secondary)' }} />
          <select
            className="input"
            value={strategy.type}
            onChange={e => setStrategy(prev => ({ ...prev, type: e.target.value as ModelRoutingStrategy['type'] }))}
            style={{ width: 280 }}
          >
            {STRATEGY_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 工具路由（真实端点：/api/tools/routing-strategy） */}
      <div className="config-card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Wrench size={18} style={{ color: 'var(--text-secondary)' }} />
            <div>
              <div className="title">工具路由</div>
              <div className="desc">Agent 执行时选择工具所遵循的策略与切换阈值</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Wrench size={16} style={{ color: 'var(--text-secondary)', visibility: 'hidden' }} />
          <select
            className="input"
            value={toolStrategy.strategy}
            onChange={e => setToolStrategy(prev => ({ ...prev, strategy: e.target.value as ToolRoutingStrategy['strategy'] }))}
            style={{ width: 280 }}
          >
            {TOOL_STRATEGY_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
            切换阈值
            <input
              className="input"
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={toolStrategy.threshold}
              onChange={e => setToolStrategy(prev => ({ ...prev, threshold: parseFloat(e.target.value) || 0 }))}
              style={{ width: 90 }}
            />
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
            回退工具
            <input
              className="input"
              value={toolStrategy.fallbackTool}
              onChange={e => setToolStrategy(prev => ({ ...prev, fallbackTool: e.target.value }))}
              placeholder="default"
              style={{ width: 120 }}
            />
          </label>
          <button className="btn btn-secondary" onClick={handleSaveTool} disabled={savingTool || loading}>
            {savingTool ? '保存中...' : '保存工具路由'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || loading}>
          {saving ? '保存中...' : '保存配置'}
        </button>
      </div>
    </div>
  );
}

export default ModelRouterSettings;
