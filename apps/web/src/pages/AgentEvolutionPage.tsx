import { useState, useEffect } from 'react';
import { ArrowLeft, Rocket, FlaskConical, GitBranch, ArrowRightLeft, Plus, X, Wrench } from 'lucide-react';
import {
  getFeatureFlags,
  updateFeatureFlag,
  getPromptVersions,
  createPromptVersion,
  activatePromptVersion,
  getExperiments,
  createExperiment,
  getExperimentMetrics,
  rollbackExperiment,
  getToolRoutingStats,
  getToolRoutingStrategy,
  saveToolRoutingStrategy,
  type FeatureFlag,
  type PromptVersion,
  type Experiment,
  type ToolRoutingStats,
  type ToolRoutingStrategy,
} from '../lib/api';
import ModelRoutingPage from './ModelRoutingPage';

type Tab = 'flags' | 'prompts' | 'experiments' | 'tool-routing' | 'model-routing';

export default function AgentEvolutionPage({ onBack }: { onBack?: () => void } = {}) {
  const [tab, setTab] = useState<Tab>('flags');
  const [_loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // feature flags
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [editingFlagId, setEditingFlagId] = useState<string | null>(null);
  const [flagForm, setFlagForm] = useState({ name: '', enabled: false, rolloutPercentage: 0, targetUsers: '', targetTenants: '' });

  // prompts
  const [prompts, setPrompts] = useState<PromptVersion[]>([]);
  const [showPromptForm, setShowPromptForm] = useState(false);
  const [promptForm, setPromptForm] = useState({ name: '', prompt: '', version: '1.0.0' });

  // experiments
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [showExpForm, setShowExpForm] = useState(false);
  const [expForm, setExpForm] = useState({ name: '', controlPromptId: '', treatmentPromptId: '', rolloutPercentage: 0 });
  const [metricsId, setMetricsId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  const [metrics, setMetrics] = useState<any>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  // tool routing
  const [toolStats, setToolStats] = useState<ToolRoutingStats[]>([]);
  const [toolSummary, setToolSummary] = useState<ToolRoutingStats['successRate']>(0);
  const [strategy, setStrategy] = useState<ToolRoutingStrategy>({ strategy: 'balanced', threshold: 0.7, preferredTools: [], fallbackTool: 'default' });
  const [strategySaving, setStrategySaving] = useState(false);

  const loadFlags = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getFeatureFlags();
      setFlags(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadPrompts = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPromptVersions();
      setPrompts(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadExperiments = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getExperiments();
      setExperiments(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadToolRouting = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsData, strategyData] = await Promise.all([
        getToolRoutingStats(),
        getToolRoutingStrategy(),
      ]);
      setToolStats(statsData.tools || []);
      setToolSummary(statsData.summary?.avgSuccessRate || 0);
      setStrategy(strategyData.strategy || { strategy: 'balanced', threshold: 0.7, preferredTools: [], fallbackTool: 'default' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const saveStrategy = async () => {
    setStrategySaving(true);
    setError(null);
    try {
      const res = await saveToolRoutingStrategy(strategy);
      setStrategy(res.strategy);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStrategySaving(false);
    }
  };

  useEffect(() => {
    if (tab === 'flags') loadFlags();
    else if (tab === 'prompts') loadPrompts();
    else if (tab === 'experiments') loadExperiments();
    else if (tab === 'tool-routing') loadToolRouting();
  }, [tab]);

  const saveFlag = async () => {
    if (!editingFlagId || !flagForm.name.trim()) return;
    setError(null);
    try {
      await updateFeatureFlag(editingFlagId, {
        name: flagForm.name,
        enabled: flagForm.enabled,
        rolloutPercentage: flagForm.rolloutPercentage,
        targetUsers: flagForm.targetUsers.split(',').map(s => s.trim()).filter(Boolean),
        targetTenants: flagForm.targetTenants.split(',').map(s => s.trim()).filter(Boolean),
      });
      setEditingFlagId(null);
      loadFlags();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const addPrompt = async () => {
    if (!promptForm.name.trim() || !promptForm.prompt.trim()) return;
    setError(null);
    try {
      await createPromptVersion(promptForm.name, promptForm.prompt, promptForm.version);
      setPromptForm({ name: '', prompt: '', version: '1.0.0' });
      setShowPromptForm(false);
      loadPrompts();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const activatePrompt = async (id: string) => {
    setError(null);
    try {
      await activatePromptVersion(id);
      loadPrompts();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const addExperiment = async () => {
    if (!expForm.name.trim() || !expForm.controlPromptId || !expForm.treatmentPromptId) return;
    setError(null);
    try {
      await createExperiment(expForm.name, expForm.controlPromptId, expForm.treatmentPromptId, expForm.rolloutPercentage);
      setExpForm({ name: '', controlPromptId: '', treatmentPromptId: '', rolloutPercentage: 0 });
      setShowExpForm(false);
      loadExperiments();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const viewMetrics = async (id: string) => {
    setMetricsId(id);
    setMetricsLoading(true);
    setMetrics(null);
    setError(null);
    try {
      const data = await getExperimentMetrics(id);
      setMetrics(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMetricsLoading(false);
    }
  };

  const doRollback = async (id: string) => {
    setError(null);
    try {
      await rollbackExperiment(id);
      loadExperiments();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="memory-page">
      <div className="settings-header">
        {onBack && (
          <button className="settings-back-btn" onClick={onBack} title="返回对话">
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="settings-header-content">
          <h1 className="settings-title">Agent 自我进化</h1>
          <p className="settings-subtitle">Prompt 优化、A/B 实验与灰度发布</p>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}><span>{error}</span><button onClick={() => setError(null)}><X size={16} /></button></div>}

      <div className="memory-tabs">
        <button className={`memory-tab ${tab === 'flags' ? 'active' : ''}`} onClick={() => setTab('flags')}><GitBranch size={16} /> Feature Flags <span className="badge">{flags.length}</span></button>
        <button className={`memory-tab ${tab === 'prompts' ? 'active' : ''}`} onClick={() => setTab('prompts')}><Rocket size={16} /> Prompt 版本 <span className="badge">{prompts.length}</span></button>
        <button className={`memory-tab ${tab === 'experiments' ? 'active' : ''}`} onClick={() => setTab('experiments')}><FlaskConical size={16} /> 实验 <span className="badge">{experiments.length}</span></button>
        <button className={`memory-tab ${tab === 'tool-routing' ? 'active' : ''}`} onClick={() => setTab('tool-routing')}><Wrench size={16} /> 工具路由 <span className="badge">{toolStats.length}</span></button>
        <button className={`memory-tab ${tab === 'model-routing' ? 'active' : ''}`} onClick={() => setTab('model-routing')}><ArrowRightLeft size={16} /> 模型路由</button>
      </div>

      {tab === 'flags' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn btn-primary" onClick={() => {
              const id = 'flag-' + Date.now();
              setFlagForm({ name: id, enabled: false, rolloutPercentage: 0, targetUsers: '', targetTenants: '' });
              setEditingFlagId(id);
            }}><Plus size={14} /> 新增</button>
          </div>
          {editingFlagId && (
            <div className="config-card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <div className="title">编辑 Feature Flag</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-item">
                  <label className="form-label">名称</label>
                  <input className="input" value={flagForm.name} onChange={e => setFlagForm({ ...flagForm, name: e.target.value })} />
                </div>
                <div className="form-item" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <label className="toggle">
                    <input type="checkbox" checked={flagForm.enabled} onChange={e => setFlagForm({ ...flagForm, enabled: e.target.checked })} />
                    <span className="slider" />
                  </label>
                  <span style={{ fontSize: 13 }}>启用</span>
                </div>
                <div className="form-item">
                  <label className="form-label">灰度比例 (%)</label>
                  <input className="input" type="number" min={0} max={100} value={flagForm.rolloutPercentage} onChange={e => setFlagForm({ ...flagForm, rolloutPercentage: Number(e.target.value) })} />
                </div>
                <div className="form-item">
                  <label className="form-label">目标用户 (逗号分隔)</label>
                  <input className="input" value={flagForm.targetUsers} onChange={e => setFlagForm({ ...flagForm, targetUsers: e.target.value })} />
                </div>
                <div className="form-item">
                  <label className="form-label">目标租户 (逗号分隔)</label>
                  <input className="input" value={flagForm.targetTenants} onChange={e => setFlagForm({ ...flagForm, targetTenants: e.target.value })} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn btn-secondary" onClick={() => setEditingFlagId(null)}>取消</button>
                  <button className="btn btn-primary" onClick={saveFlag}>保存</button>
                </div>
              </div>
            </div>
          )}
          <div className="config-card" style={{ padding: 0 }}>
            {flags.length === 0 ? (
              <div className="settings-empty" style={{ padding: '40px 0' }}>暂无 Feature Flag</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {flags.map(flag => (
                  <div key={flag.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{flag.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{flag.rolloutPercentage}% | users: {flag.targetUsers?.length || 0} | tenants: {flag.targetTenants?.length || 0}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span className={`tag ${flag.enabled ? 'success' : ''}`}>{flag.enabled ? '启用' : '关闭'}</span>
                        <button className="btn btn-secondary" onClick={() => {
                          setFlagForm({
                            name: flag.name,
                            enabled: flag.enabled,
                            rolloutPercentage: flag.rolloutPercentage,
                            targetUsers: (flag.targetUsers || []).join(', '),
                            targetTenants: (flag.targetTenants || []).join(', '),
                          });
                          setEditingFlagId(flag.id);
                        }}>编辑</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'prompts' && (
        <div>
          {showPromptForm && (
            <div className="config-card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <div className="title">新增 Prompt 版本</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-item">
                  <label className="form-label">名称</label>
                  <input className="input" value={promptForm.name} onChange={e => setPromptForm({ ...promptForm, name: e.target.value })} />
                </div>
                <div className="form-item">
                  <label className="form-label">版本</label>
                  <input className="input" value={promptForm.version} onChange={e => setPromptForm({ ...promptForm, version: e.target.value })} />
                </div>
                <div className="form-item">
                  <label className="form-label">Prompt</label>
                  <textarea className="input" rows={8} value={promptForm.prompt} onChange={e => setPromptForm({ ...promptForm, prompt: e.target.value })} style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn btn-secondary" onClick={() => setShowPromptForm(false)}>取消</button>
                  <button className="btn btn-primary" onClick={addPrompt}>保存</button>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            {!showPromptForm && (
              <button className="btn btn-primary" onClick={() => setShowPromptForm(true)}><Plus size={14} /> 新增</button>
            )}
          </div>

          <div className="config-card" style={{ padding: 0 }}>
            {prompts.length === 0 ? (
              <div className="settings-empty" style={{ padding: '40px 0' }}>暂无 Prompt 版本</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {prompts.map(p => (
                  <div key={p.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                          <span className="tag">{p.version}</span>
                          {p.isActive && <span className="tag success">激活</span>}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{p.prompt}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>{new Date(p.createdAt).toLocaleString('zh-CN')}</div>
                      </div>
                      {!p.isActive && (
                        <button className="btn btn-primary" onClick={() => activatePrompt(p.id)}>激活</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'experiments' && (
        <div>
          {showExpForm && (
            <div className="config-card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <div className="title">新建 A/B 实验</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-item">
                  <label className="form-label">实验名称</label>
                  <input className="input" value={expForm.name} onChange={e => setExpForm({ ...expForm, name: e.target.value })} />
                </div>
                <div className="form-item">
                  <label className="form-label">对照组 Prompt ID</label>
                  <input className="input" value={expForm.controlPromptId} onChange={e => setExpForm({ ...expForm, controlPromptId: e.target.value })} />
                </div>
                <div className="form-item">
                  <label className="form-label">实验组 Prompt ID</label>
                  <input className="input" value={expForm.treatmentPromptId} onChange={e => setExpForm({ ...expForm, treatmentPromptId: e.target.value })} />
                </div>
                <div className="form-item">
                  <label className="form-label">灰度比例 (%)</label>
                  <input className="input" type="number" min={0} max={100} value={expForm.rolloutPercentage} onChange={e => setExpForm({ ...expForm, rolloutPercentage: Number(e.target.value) })} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn btn-secondary" onClick={() => setShowExpForm(false)}>取消</button>
                  <button className="btn btn-primary" onClick={addExperiment}>创建</button>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <div />
            {!showExpForm && (
              <button className="btn btn-primary" onClick={() => setShowExpForm(true)}><Plus size={14} /> 新建实验</button>
            )}
          </div>

          <div className="config-card" style={{ padding: 0 }}>
            {experiments.length === 0 ? (
              <div className="settings-empty" style={{ padding: '40px 0' }}>暂无实验</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {experiments.map(exp => (
                  <div key={exp.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{exp.name}</div>
                          <span className={`tag ${exp.status === 'draft' ? '' : exp.status === 'running' ? 'success' : exp.status === 'rolled_back' ? 'warning' : ''}`}>{exp.status}</span>
                          <span className="tag info">{exp.rolloutPercentage}%</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>control: {exp.controlPromptId} | treatment: {exp.treatmentPromptId}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>{new Date(exp.createdAt).toLocaleString('zh-CN')}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-secondary" onClick={() => viewMetrics(exp.id)}>指标</button>
                        {exp.status !== 'rolled_back' && (
                          <button className="btn btn-secondary" onClick={() => doRollback(exp.id)}><ArrowRightLeft size={14} /></button>
                        )}
                      </div>
                    </div>

                    {metricsId === exp.id && (
                      <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                        {metricsLoading ? (
                          <div className="settings-loading">加载指标中...</div>
                        ) : metrics ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                            <div>状态：{metrics.status}</div>
                            <div>平均满意度：{(metrics.control?.avgRating || 0).toFixed(2)}</div>
                            <div>反馈数：{metrics.control?.totalFeedback || 0}</div>
                          </div>
                        ) : (
                          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>暂无指标</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'tool-routing' && (
        <div>
          <div className="config-card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <div>
                <div className="title">工具路由策略</div>
                <div className="desc">基于反馈数据自动优化工具选择，提升成功率并降低 token 消耗</div>
              </div>
              <div className="card-actions">
                <button className="btn btn-primary" onClick={saveStrategy} disabled={strategySaving}>
                  {strategySaving ? '保存中...' : '保存策略'}
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
              <div className="form-item">
                <label className="form-label">路由策略</label>
                <select
                  className="input"
                  value={strategy.strategy}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
                  onChange={e => setStrategy({ ...strategy, strategy: e.target.value as any })}
                >
                  <option value="balanced">均衡</option>
                  <option value="performance">性能优先</option>
                  <option value="cost">成本优先</option>
                  <option value="auto">自动</option>
                </select>
              </div>
              <div className="form-item">
                <label className="form-label">成功率阈值</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={strategy.threshold}
                  onChange={e => setStrategy({ ...strategy, threshold: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="form-item">
                <label className="form-label">优先工具（逗号分隔）</label>
                <input
                  className="input"
                  value={(strategy.preferredTools || []).join(', ')}
                  onChange={e => setStrategy({ ...strategy, preferredTools: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                  placeholder="tool_a, tool_b"
                />
              </div>
              <div className="form-item">
                <label className="form-label">回退工具</label>
                <input
                  className="input"
                  value={strategy.fallbackTool}
                  onChange={e => setStrategy({ ...strategy, fallbackTool: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="config-card" style={{ padding: 0 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>工具成功率统计</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                  共 {toolStats.length} 个工具 | 平均成功率 {(toolSummary * 100).toFixed(1)}%
                </div>
              </div>
            </div>
            {toolStats.length === 0 ? (
              <div className="settings-empty" style={{ padding: '40px 0' }}>暂无工具统计</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {toolStats.map(tool => (
                  <div key={tool.name} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{tool.name}</div>
                      <span className={`tag ${tool.successRate >= 0.7 ? 'success' : tool.successRate >= 0.4 ? 'warning' : ''}`}>
                        成功率 {(tool.successRate * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                      <div>总调用：{tool.totalCalls}</div>
                      <div>正反馈：{tool.positiveFeedback}</div>
                      <div>负反馈：{tool.negativeFeedback}</div>
                      <div>独立会话：{tool.uniqueSessions}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {tab === 'model-routing' && (
        <ModelRoutingPage onBack={onBack} showHeader={false} />
      )}
    </div>
  );
}
