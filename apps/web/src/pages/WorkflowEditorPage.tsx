import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  BackgroundVariant,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Play, Save, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';

import { listWorkflows, saveWorkflow, executeWorkflow, getWorkflow } from '../lib/workflow-api';

// ============================================================
// Node type registry — each type defines defaults + config form
// ============================================================
interface NodeTypeDef {
  label: string;
  icon: string;
  category: string;
  color: string;
  defaults: Record<string, unknown>;
  configFields: ConfigField[];
}

type ConfigField = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'textarea';
  options?: { label: string; value: string }[];
  placeholder?: string;
};

const NODE_TYPES: Record<string, NodeTypeDef> = {
  start: {
    label: '开始',
    icon: '▶',
    category: '触发器',
    color: '#22c55e',
    defaults: {},
    configFields: [],
  },
  llm: {
    label: 'LLM 调用',
    icon: '🧠',
    category: 'AI 能力',
    color: '#8b5cf6',
    defaults: { model: 'gpt-4o', temperature: 0.7, maxTokens: 2000, systemPrompt: '', userPrompt: '' },
    configFields: [
      { key: 'model', label: '模型', type: 'select', options: [
        { label: 'GPT-4o', value: 'gpt-4o' },
        { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
        { label: 'Claude 3.5', value: 'claude-3.5-sonnet' },
      ]},
      { key: 'temperature', label: '温度', type: 'number', placeholder: '0.0-2.0' },
      { key: 'maxTokens', label: '最大 Token', type: 'number' },
      { key: 'systemPrompt', label: '系统提示词', type: 'textarea' },
      { key: 'userPrompt', label: '用户提示词', type: 'textarea' },
    ],
  },
  knowledge: {
    label: '知识库检索',
    icon: '📚',
    category: 'AI 能力',
    color: '#f59e0b',
    defaults: { topK: 5, hybrid: true },
    configFields: [
      { key: 'topK', label: '返回数量', type: 'number' },
      { key: 'hybrid', label: '混合搜索', type: 'select', options: [
        { label: '是', value: 'true' },
        { label: '否', value: 'false' },
      ]},
    ],
  },
  http: {
    label: 'HTTP 请求',
    icon: '🌐',
    category: '外部交互',
    color: '#3b82f6',
    defaults: { method: 'GET', url: '', headers: '{}', body: '' },
    configFields: [
      { key: 'method', label: '方法', type: 'select', options: [
        { label: 'GET', value: 'GET' },
        { label: 'POST', value: 'POST' },
        { label: 'PUT', value: 'PUT' },
        { label: 'DELETE', value: 'DELETE' },
      ]},
      { key: 'url', label: 'URL', type: 'text' },
      { key: 'headers', label: 'Headers (JSON)', type: 'textarea' },
      { key: 'body', label: 'Body', type: 'textarea' },
    ],
  },
  condition: {
    label: '条件分支',
    icon: '◆',
    category: '逻辑控制',
    color: '#ec4899',
    defaults: { expression: '' },
    configFields: [
      { key: 'expression', label: '条件表达式', type: 'textarea', placeholder: 'e.g. {{llm.result}} == "yes"' },
    ],
  },
  code: {
    label: '代码执行',
    icon: '💻',
    category: '数据处理',
    color: '#14b8a6',
    defaults: { language: 'python', code: '' },
    configFields: [
      { key: 'language', label: '语言', type: 'select', options: [
        { label: 'Python', value: 'python' },
        { label: 'JavaScript', value: 'javascript' },
      ]},
      { key: 'code', label: '代码', type: 'textarea' },
    ],
  },
  end: {
    label: '结束输出',
    icon: '⏹',
    category: '输出',
    color: '#ef4444',
    defaults: {},
    configFields: [],
  },
};

// ============================================================
// Custom node components
// ============================================================
function WorkflowNode({ data, selected }: { data: any; selected?: boolean }) {
  const def = NODE_TYPES[data.nodeType];
  return (
    <div className={`wf-node ${selected ? 'selected' : ''}`} style={{ borderColor: def?.color || '#666' }}>
      <div className="wf-node-header" style={{ background: def?.color + '20' }}>
        <span className="wf-node-icon">{def?.icon}</span>
        <span className="wf-node-label">{data.label || def?.label || data.nodeType}</span>
      </div>
      {data.subtitle && <div className="wf-node-subtitle">{data.subtitle}</div>}
    </div>
  );
}

const nodeTypes = { workflow: WorkflowNode };

// ============================================================
// Sidebar — draggable node palette
// ============================================================
function NodePalette() {
  const categories = useMemo(() => {
    const cats: Record<string, NodeTypeDef[]> = {};
    for (const [type, def] of Object.entries(NODE_TYPES)) {
      if (!cats[def.category]) cats[def.category] = [];
      cats[def.category].push({ ...def, ...{ nodeType: type } } as any);
    }
    return cats;
  }, []);

  return (
    <div className="wf-palette">
      <h4>节点库</h4>
      {Object.entries(categories).map(([cat, items]) => (
        <div key={cat} className="palette-category">
          <div className="palette-cat-title">{cat}</div>
          {items.map((def: any) => (
            <div
              key={def.nodeType}
              className="palette-item"
              style={{ borderColor: def.color }}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/reactflow', JSON.stringify({ nodeType: def.nodeType }));
              }}
            >
              <span className="palette-icon">{def.icon}</span>
              <span>{def.label}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Config Panel — edit selected node
// ============================================================
function ConfigPanel({ node, onUpdate, onDelete }: { node: any; onUpdate: (data: any) => void; onDelete: () => void }) {
  const def = NODE_TYPES[node?.data?.nodeType];
  if (!def || !node) return <div className="wf-config-empty">选择一个节点来编辑</div>;

  const updateField = (key: string, value: any) => {
    onUpdate({ ...node.data.config, [key]: value });
  };

  return (
    <div className="wf-config-panel">
      <div className="config-header">
        <h4><span className="config-icon" style={{ color: def.color }}>{def.icon}</span> {def.label}</h4>
        <button className="btn-icon" onClick={onDelete}><Trash2 size={14} /></button>
      </div>
      {def.configFields.map((field) => (
        <div key={field.key} className="config-field">
          <label>{field.label}</label>
          {field.type === 'select' ? (
            <select
              className="config-input"
              value={String(node.data.config?.[field.key] ?? '')}
              onChange={(e) => updateField(field.key, e.target.value)}
            >
              {field.options?.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          ) : field.type === 'textarea' ? (
            <textarea
              className="config-input"
              value={String(node.data.config?.[field.key] ?? '')}
              onChange={(e) => updateField(field.key, e.target.value)}
              placeholder={field.placeholder}
              rows={4}
            />
          ) : (
            <input
              className="config-input"
              type={field.type}
              value={String(node.data.config?.[field.key] ?? '')}
              onChange={(e) => updateField(field.key, field.type === 'number' ? parseFloat(e.target.value) : e.target.value)}
              placeholder={field.placeholder}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Main page
// ============================================================
let idCounter = 0;
const nextId = () => `node_${++idCounter}`;

export default function WorkflowEditorPage() {
  const [nodes, setNodes] = useState<any[]>([]);
  const [edges, setEdges] = useState<any[]>([]);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [workflowName, setWorkflowName] = useState('新工作流');
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [workflowList, setWorkflowList] = useState<any[]>([]);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();

  // Load workflow list on mount
  useEffect(() => {
    listWorkflows().then(setWorkflowList);
  }, []);

  const onNodesChange = useCallback((changes: any) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes: any) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);

  const onConnect = useCallback((connection: any) => {
    setEdges((eds) => addEdge({ ...connection, animated: true, style: { stroke: '#8b5cf6' } }, eds));
  }, []);

  // Drop handler
  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const data = event.dataTransfer.getData('application/reactflow');
    if (!data) return;
    try {
      const { nodeType } = JSON.parse(data);
      const def = NODE_TYPES[nodeType];
      if (!def) return;

      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const id = nextId();
      const newNode = {
        id,
        type: 'workflow',
        position,
        data: {
          nodeType,
          label: def.label,
          config: { ...def.defaults },
          subtitle: def.icon,
        },
      };
      setNodes((nds) => [...nds, newNode]);
    } catch (err) {
      console.error('Failed to save workflow:', err);
    }
  }, [screenToFlowPosition]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onNodeClick = useCallback((_: any, node: any) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const updateNodeData = useCallback((data: any) => {
    setNodes((nds) => nds.map((n) => n.id === selectedNode.id ? { ...n, data: { ...n.data, config: data } } : n));
    setSelectedNode((prev: any) => prev ? { ...prev, data: { ...prev.data, config: data } } : null);
  }, [selectedNode]);

  const deleteNode = useCallback(() => {
    if (!selectedNode) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNode(null);
  }, [selectedNode]);

  // Save workflow
  const handleSave = async () => {
    setSaving(true);
    try {
      const workflow = {
        name: workflowName,
        steps: nodes.map((n) => ({
          id: n.id,
          type: n.data.nodeType === 'llm' ? 'agent' : n.data.nodeType === 'condition' ? 'condition' : 'tool',
          config: n.data.config,
          next: edges.filter((e) => e.source === n.id).map((e) => e.target),
        })),
        triggers: [{ type: 'manual' }],
      };
      await saveWorkflow(workflow);
      setWorkflowList(await listWorkflows());
      alert('保存成功');
    } catch (err) {
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  };

  // Execute workflow
  const handleExecute = async () => {
    setExecuting(true);
    setExecutionResult(null);
    try {
      const workflow = {
        name: workflowName,
        steps: nodes.map((n) => ({
          id: n.id,
          type: n.data.nodeType === 'llm' ? 'agent' : n.data.nodeType === 'condition' ? 'condition' : 'tool',
          config: n.data.config,
          next: edges.filter((e) => e.source === n.id).map((e) => e.target),
        })),
        triggers: [],
      };
      const saved = await saveWorkflow(workflow);
      const result = await executeWorkflow(saved.id || 'temp');
      setExecutionResult(result);
    } catch (err) {
      setExecutionResult({ status: 'failed', error: err instanceof Error ? err.message : '执行失败' });
    } finally {
      setExecuting(false);
    }
  };

  // Load workflow
  const handleLoad = async (id: string) => {
    try {
      const wf = await getWorkflow(id);
      setWorkflowName(wf.name);
      const newNodes = (wf.steps || []).map((step: any, i: number) => ({
        id: step.id || `node_${i}`,
        type: 'workflow',
        position: { x: 100 + i * 200, y: 100 + (i % 2) * 150 },
        data: {
          nodeType: step.type === 'agent' ? 'llm' : step.type === 'condition' ? 'condition' : 'tool',
          label: NODE_TYPES[step.type === 'agent' ? 'llm' : step.type === 'condition' ? 'condition' : 'tool']?.label || step.type,
          config: step.config || {},
        },
      }));
      const newEdges = (wf.steps || []).flatMap((step: any) =>
        (step.next || []).map((target: string) => ({
          id: `${step.id}-${target}`,
          source: step.id,
          target,
          animated: true,
          style: { stroke: '#8b5cf6' },
        }))
      );
      setNodes(newNodes);
      setEdges(newEdges);
      setTimeout(() => fitView({ padding: 0.2 }), 100);
    } catch (err) {
      alert('加载失败');
    }
  };

  return (
    <div className="wf-editor-layout">
      {/* Left sidebar: node palette */}
      <div className={`wf-sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
        <NodePalette />
        <div className="wf-sidebar-footer">
          <h4>我的工作流</h4>
          {workflowList.map((wf) => (
            <div key={wf.id} className="wf-list-item" onClick={() => handleLoad(wf.id)}>
              <span>{wf.name}</span>
              <span>{wf.steps?.length || 0} 节点</span>
            </div>
          ))}
        </div>
      </div>

      {/* Center: canvas */}
      <div className="wf-canvas-area" ref={reactFlowWrapper}>
        <div className="wf-toolbar">
          <input
            className="wf-name-input"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
          />
          <div className="wf-toolbar-actions">
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              <Save size={16} /> {saving ? '保存中...' : '保存'}
            </button>
            <button className="btn-secondary" onClick={handleExecute} disabled={executing || nodes.length === 0}>
              <Play size={16} /> {executing ? '执行中...' : '执行'}
            </button>
            <button className="btn-icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
              {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            </button>
          </div>
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          deleteKeyCode={['Backspace', 'Delete']}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#334155" />
          <Controls />
          <MiniMap nodeColor="#8b5cf6" />
        </ReactFlow>
      </div>

      {/* Right panel: config */}
      <div className="wf-right-panel">
        <ConfigPanel
          node={selectedNode}
          onUpdate={updateNodeData}
          onDelete={deleteNode}
        />
        {executionResult && (
          <div className="wf-execution-result">
            <h4>执行结果</h4>
            <pre>{JSON.stringify(executionResult, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
