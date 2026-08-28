import { authedFetch } from '../lib/api';
import { useState, useEffect } from 'react';
import { ArrowLeft, Users, GitBranch, Play, Square, Plus, Trash2, ChevronDown, ChevronRight, Workflow, Cpu, ArrowRight } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

interface Worker {
  id: string;
  type: string;
  capabilities: string[];
  maxConcurrentTasks?: number;
}

interface TaskNode {
  id: string;
  type: 'agent' | 'tool' | 'condition' | 'parallel';
  config: Record<string, unknown>;
  dependencies: string[];
  status?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  result?: any;
  error?: string;
}

interface Task {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  result?: any;
  error?: string;
  graph: {
    nodes: Map<string, TaskNode>;
    edges: Array<{ from: string; to: string; condition?: string }>;
  };
}

type Tab = 'workers' | 'tasks' | 'templates';

const TEMPLATES = [
  {
    id: 'research-then-write',
    name: '调研 → 写作',
    description: '研究 Agent 收集资料，写作 Agent 生成报告',
    nodes: [
      { id: 'research', type: 'agent', config: { role: 'researcher', prompt: 'Research the topic and gather key facts' }, dependencies: [] },
      { id: 'write', type: 'agent', config: { role: 'writer', prompt: 'Write a comprehensive report based on research' }, dependencies: ['research'] },
    ],
    edges: [{ from: 'research', to: 'write' }],
  },
  {
    id: 'code-review',
    name: '编码 → 审查',
    description: '代码 Agent 编写代码，审查 Agent 检查质量',
    nodes: [
      { id: 'code', type: 'agent', config: { role: 'coder', prompt: 'Implement the feature' }, dependencies: [] },
      { id: 'review', type: 'agent', config: { role: 'reviewer', prompt: 'Review code quality and suggest improvements' }, dependencies: ['code'] },
    ],
    edges: [{ from: 'code', to: 'review' }],
  },
  {
    id: 'parallel-analysis',
    name: '并行分析',
    description: '多个分析 Agent 并行处理不同维度',
    nodes: [
      { id: 'analysis-a', type: 'agent', config: { role: 'analyst', prompt: 'Analyze from perspective A' }, dependencies: [] },
      { id: 'analysis-b', type: 'agent', config: { role: 'analyst', prompt: 'Analyze from perspective B' }, dependencies: [] },
      { id: 'synthesis', type: 'agent', config: { role: 'synthesizer', prompt: 'Synthesize all analyses into final recommendation' }, dependencies: ['analysis-a', 'analysis-b'] },
    ],
    edges: [
      { from: 'analysis-a', to: 'synthesis' },
      { from: 'analysis-b', to: 'synthesis' },
    ],
  },
  {
    id: 'code-review-pr',
    name: '代码审查',
    description: '审查代码 → 生成测试 → 更新文档',
    nodes: [
      { id: 'review', type: 'agent', config: { role: 'code-reviewer', prompt: 'You are a senior code reviewer. Review the code for bugs, security issues, and best practices.' }, dependencies: [] },
      { id: 'test', type: 'agent', config: { role: 'test-engineer', prompt: 'You are a test engineer. Generate unit tests and integration tests for the reviewed code.' }, dependencies: ['review'] },
      { id: 'docs', type: 'agent', config: { role: 'tech-writer', prompt: 'You are a technical documentation expert. Update documentation based on code changes and test results.' }, dependencies: ['test'] },
    ],
    edges: [
      { from: 'review', to: 'test' },
      { from: 'test', to: 'docs' },
    ],
  },
  {
    id: 'requirements-analysis',
    name: '需求分析',
    description: '理解需求 → 设计方案 → 拆解任务',
    nodes: [
      { id: 'understand', type: 'agent', config: { role: 'product-manager', prompt: 'You are a product manager. Analyze the user requirements and identify core features and constraints.' }, dependencies: [] },
      { id: 'design', type: 'agent', config: { role: 'architect', prompt: 'You are a software architect. Design a technical solution based on the analyzed requirements.' }, dependencies: ['understand'] },
      { id: 'breakdown', type: 'agent', config: { role: 'tech-lead', prompt: 'You are a tech lead. Break down the design into actionable development tasks with priorities.' }, dependencies: ['design'] },
    ],
    edges: [
      { from: 'understand', to: 'design' },
      { from: 'design', to: 'breakdown' },
    ],
  },
  {
    id: 'data-report',
    name: '数据报告',
    description: '提取数据 → 分析洞察 → 生成报告',
    nodes: [
      { id: 'extract', type: 'agent', config: { role: 'data-engineer', prompt: 'You are a data engineer. Extract relevant data from files and databases.' }, dependencies: [] },
      { id: 'analyze', type: 'agent', config: { role: 'data-analyst', prompt: 'You are a data analyst. Analyze the extracted data for trends, anomalies, and insights.' }, dependencies: ['extract'] },
      { id: 'report', type: 'agent', config: { role: 'report-writer', prompt: 'You are a report writer. Generate a comprehensive data report with visualizations and recommendations.' }, dependencies: ['analyze'] },
    ],
    edges: [
      { from: 'extract', to: 'analyze' },
      { from: 'analyze', to: 'report' },
    ],
  },
];

export default function MultiAgentPage({ onBack }: { onBack?: () => void } = {}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('tasks');
  const [_loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Create task form
  const [taskName, setTaskName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [customNodes, setCustomNodes] = useState<TaskNode[]>([]);
  const [customEdges, setCustomEdges] = useState<Array<{ from: string; to: string; condition?: string }>>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Auto-run when auto mode is active and task was created
  useEffect(() => {
    const mode = searchParams.get('mode');
    if (mode !== 'auto' || !searchParams.get('template')) return;

    let cancelled = false;
    (async () => {
      const taskId = await createTask();
      if (!taskId || cancelled) return;
      await runTask(taskId);
      if (cancelled) return;

      const returnTo = searchParams.get('returnTo') || '/dev-workbench';
      navigate(`${returnTo}?taskId=${taskId}`, { replace: true });
    })();

    return () => { cancelled = true; };
  }, [searchParams]);

  // Prefill form when template is provided via query
  useEffect(() => {
    const templateId = searchParams.get('template');
    const mode = searchParams.get('mode');
    if (!templateId || mode !== 'auto') return;

    const tpl = TEMPLATES.find(t => t.id === templateId);
    if (!tpl) return;

    setSelectedTemplate(templateId);
    setCustomNodes(tpl.nodes as TaskNode[]);
    setCustomEdges(tpl.edges);
    setTab('tasks');
    setShowCreateForm(true);
    setTaskName(tpl.name);
  }, [searchParams]);

  const loadWorkers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch('/orchestrator/workers');
      if (!res.ok) throw new Error('Failed to load workers');
      const data = await res.json();
      setWorkers(data.workers || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch('/orchestrator/tasks');
      if (!res.ok) throw new Error('Failed to load tasks');
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'workers') loadWorkers();
    else if (tab === 'tasks') loadTasks();
  }, [tab]);

  const createTask = async (): Promise<string | null> => {
    if (!taskName.trim()) return null;
    setError(null);
    try {
      let nodes = customNodes;
      let edges = customEdges;

      if (selectedTemplate) {
        const tpl = TEMPLATES.find(t => t.id === selectedTemplate);
        if (tpl) {
          nodes = tpl.nodes as TaskNode[];
          edges = tpl.edges;
        }
      }

      if (nodes.length === 0) {
        throw new Error('Please add at least one node');
      }

      const res = await authedFetch('/orchestrator/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: taskName,
          nodes,
          edges,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to create task' }));
        throw new Error(data.error || 'Failed to create task');
      }

      const data = await res.json();
      const newTaskId = data.id as string;

      setTaskName('');
      setSelectedTemplate('');
      setCustomNodes([]);
      setCustomEdges([]);
      setShowCreateForm(false);
      await loadTasks();

      return newTaskId;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  };

  const runTask = async (id: string) => {
    setError(null);
    try {
      const res = await authedFetch(`/orchestrator/tasks/${id}/run`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to run task' }));
        throw new Error(data.error || 'Failed to run task');
      }
      loadTasks();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const cancelTask = async (id: string) => {
    setError(null);
    try {
      const res = await authedFetch(`/orchestrator/tasks/${id}/cancel`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to cancel task' }));
        throw new Error(data.error || 'Failed to cancel task');
      }
      loadTasks();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const addNode = () => {
    const id = 'node-' + Date.now();
    setCustomNodes([...customNodes, { id, type: 'agent', config: { role: 'general', prompt: '' }, dependencies: [] }]);
  };

  const updateNode = (id: string, updates: Partial<TaskNode>) => {
    setCustomNodes(customNodes.map(n => n.id === id ? { ...n, ...updates } : n));
  };

  const removeNode = (id: string) => {
    setCustomNodes(customNodes.filter(n => n.id !== id));
    setCustomEdges(customEdges.filter(e => e.from !== id && e.to !== id));
  };

  const addEdge = () => {
    if (customNodes.length < 2) return;
    const from = customNodes[0].id;
    const to = customNodes[1].id;
    if (!customEdges.find(e => e.from === from && e.to === to)) {
      setCustomEdges([...customEdges, { from, to }]);
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      idle: 'badge-warning',
      running: 'badge-success',
      completed: 'badge-success',
      failed: 'badge-error',
      cancelled: 'badge-error',
    };
    return map[status] || 'badge-warning';
  };

  const getStatusText = (status: string) => {
    const map: Record<string, string> = {
      idle: '等待中',
      running: '运行中',
      completed: '已完成',
      failed: '失败',
      cancelled: '已取消',
    };
    return map[status] || status;
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
          <h1 className="settings-title">多 Agent 协作</h1>
          <p className="settings-subtitle">任务编排、Agent 集群与结果合成</p>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}><span>{error}</span></div>}

      <div className="memory-tabs">
        <button className={`memory-tab ${tab === 'workers' ? 'active' : ''}`} onClick={() => setTab('workers')}><Users size={16} /> Agent 集群</button>
        <button className={`memory-tab ${tab === 'tasks' ? 'active' : ''}`} onClick={() => setTab('tasks')}><Workflow size={16} /> 任务编排</button>
        <button className={`memory-tab ${tab === 'templates' ? 'active' : ''}`} onClick={() => setTab('templates')}><GitBranch size={16} /> 模板库</button>
      </div>

      {tab === 'workers' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              共 {workers.length} 个 Agent Worker
            </div>
            <button className="btn btn-primary" onClick={loadWorkers}><Workflow size={14} /> 刷新</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {workers.map(worker => (
              <div key={worker.id} className="config-card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-tertiary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Cpu size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{worker.id}</div>
                    <div className="tag info">{worker.type}</div>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  <div style={{ marginBottom: 4 }}>能力：{worker.capabilities?.join(', ') || '-'}</div>
                  {worker.maxConcurrentTasks && <div>最大并发：{worker.maxConcurrentTasks}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'tasks' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              共 {tasks.length} 个编排任务
            </div>
            <button className="btn btn-primary" onClick={() => setShowCreateForm(!showCreateForm)}>
              <Plus size={14} /> 新建任务
            </button>
          </div>

          {showCreateForm && (
            <div className="config-card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <div className="title">新建多 Agent 任务</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-item">
                  <label className="form-label">任务名称</label>
                  <input
                    className="input"
                    value={taskName}
                    onChange={e => setTaskName(e.target.value)}
                    placeholder="输入任务名称..."
                  />
                </div>

                <div className="form-item">
                  <label className="form-label">使用模板</label>
                  <select
                    className="input"
                    value={selectedTemplate}
                    onChange={e => {
                      setSelectedTemplate(e.target.value);
                      if (e.target.value) {
                        const tpl = TEMPLATES.find(t => t.id === e.target.value);
                        if (tpl) {
                          setCustomNodes(tpl.nodes as TaskNode[]);
                          setCustomEdges(tpl.edges);
                        }
                      } else {
                        setCustomNodes([]);
                        setCustomEdges([]);
                      }
                    }}
                  >
                    <option value="">-- 选择模板 --</option>
                    {TEMPLATES.map(tpl => (
                      <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                    ))}
                  </select>
                </div>

                {!selectedTemplate && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label className="form-label" style={{ margin: 0 }}>任务节点</label>
                      <button className="btn btn-secondary" onClick={addNode}><Plus size={14} /> 添加节点</button>
                    </div>
                    {customNodes.map((node, idx) => (
                      <div key={node.id} style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>节点 {idx + 1}</span>
                          <button className="row-icon-btn" onClick={() => removeNode(node.id)}><Trash2 size={14} /></button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <input
                            className="input"
                            value={node.id}
                            onChange={e => updateNode(node.id, { id: e.target.value })}
                            placeholder="节点 ID"
                          />
                          <select
                            className="input"
                            value={node.type}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
                            onChange={e => updateNode(node.id, { type: e.target.value as any })}
                          >
                            <option value="agent">Agent</option>
                            <option value="tool">工具</option>
                            <option value="condition">条件</option>
                            <option value="parallel">并行</option>
                          </select>
                          <input
                            className="input"
                            value={(node.config.role as string) || ''}
                            onChange={e => updateNode(node.id, { config: { ...node.config, role: e.target.value } })}
                            placeholder="角色 (如: researcher, coder)"
                          />
                          <textarea
                            className="input"
                            rows={3}
                            value={(node.config.prompt as string) || ''}
                            onChange={e => updateNode(node.id, { config: { ...node.config, prompt: e.target.value } })}
                            placeholder="Prompt..."
                            style={{ resize: 'vertical' }}
                          />
                        </div>
                      </div>
                    ))}
                    {customNodes.length >= 2 && (
                      <button className="btn btn-secondary" onClick={addEdge}><GitBranch size={14} /> 添加连接</button>
                    )}
                    {customEdges.length > 0 && (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        已定义 {customEdges.length} 个连接
                      </div>
                    )}
                  </>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn btn-secondary" onClick={() => setShowCreateForm(false)}>取消</button>
                  <button className="btn btn-primary" onClick={createTask} disabled={!taskName.trim() || (customNodes.length === 0 && !selectedTemplate)}>
                    创建任务
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="config-card" style={{ padding: 0 }}>
            {tasks.length === 0 ? (
              <div className="settings-empty" style={{ padding: '40px 0' }}>暂无编排任务</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {tasks.map(task => (
                  <div key={task.id} style={{ padding: '16px', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{task.name}</div>
                          <span className={`badge ${getStatusBadge(task.status)}`}>{getStatusText(task.status)}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                          ID: {task.id.slice(0, 12)}...
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                          {new Date(task.createdAt).toLocaleString('zh-CN')}
                        </div>
                        {task.error && (
                          <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{task.error}</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {task.status === 'idle' && (
                          <button className="btn btn-primary" onClick={() => runTask(task.id)}><Play size={14} /></button>
                        )}
                        {task.status === 'running' && (
                          <button className="btn btn-secondary" onClick={() => cancelTask(task.id)}><Square size={14} /></button>
                        )}
                        <button className="btn btn-secondary" onClick={() => setSelectedTask(selectedTask?.id === task.id ? null : task)}>
                          {selectedTask?.id === task.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </div>
                    </div>

                    {selectedTask?.id === task.id && (
                      <div style={{ marginTop: 16, padding: 16, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>任务图</div>
                        {task.graph?.nodes && Array.from(task.graph.nodes.entries()).length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {Array.from(task.graph.nodes.entries()).map(([nodeId, node]) => (
                              <div key={nodeId} style={{
                                padding: '10px 12px',
                                background: 'var(--bg-tertiary)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border-color)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}>
                                <div>
                                  <div style={{ fontSize: 13, fontWeight: 600 }}>{nodeId}</div>
                                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                    {node.type} | deps: {node.dependencies.join(', ') || '-'}
                                  </div>
                                  {(node.config?.prompt as string | undefined) && (
                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                      {String(node.config.prompt)}
                                    </div>
                                  )}
                                </div>
                                <span className={`badge ${node.status === 'completed' ? 'success' : node.status === 'failed' ? 'error' : node.status === 'running' ? 'info' : ''}`}>
                                  {node.status || 'pending'}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>无节点数据</div>
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

      {tab === 'templates' && (
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
            选择模板快速创建多 Agent 工作流
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {TEMPLATES.map(tpl => (
              <div
                key={tpl.id}
                className="template-card"
                onClick={() => {
                  setSelectedTemplate(tpl.id);
                  setCustomNodes(tpl.nodes as TaskNode[]);
                  setCustomEdges(tpl.edges);
                  setTab('tasks');
                  setShowCreateForm(true);
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{tpl.name}</div>
                  {tpl.id === 'code-review-pr' && <span className="badge success">推荐</span>}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>{tpl.description}</div>

                {/* Workflow preview */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
                  {tpl.nodes.map((node: { id: string; label?: string; type?: string; config?: Record<string, unknown> }, idx: number) => (
                    <div key={node.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        padding: '4px 8px',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 11,
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap'
                      }}>
                        {(node.config?.role as string) || node.id}
                      </div>
                      {idx < tpl.nodes.length - 1 && (
                        <ArrowRight size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
                  {tpl.nodes.map((node: { id: string; label?: string; type?: string; config?: Record<string, unknown> }) => (
                    <span key={node.id} className="tag info">{node.id}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
