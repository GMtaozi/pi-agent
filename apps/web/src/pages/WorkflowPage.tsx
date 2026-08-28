import { authedFetch } from '../lib/api';
import { useState, useEffect } from 'react';

interface Workflow {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  steps: number;
  completedSteps: number;
  createdAt: string;
}

export default function WorkflowPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [steps, setSteps] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const fetchWorkflows = async () => {
    try {
      const res = await authedFetch('/workflows');
      if (res.ok) {
        const data = await res.json();
        setWorkflows(data.workflows || []);
      }
    } catch (e) {
      console.error('Failed to fetch workflows:', e);
    } finally {
      setLoading(false);
    }
  };

  const createWorkflow = async () => {
    const stepList = steps.split(',').map(s => s.trim()).filter(Boolean);
    await authedFetch('/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, steps: stepList })
    });
    setName('');
    setSteps('');
    setShowForm(false);
    fetchWorkflows();
  };

  const runWorkflow = async (id: string) => {
    await authedFetch('/workflows/' + id + '/run', { method: 'POST' });
    fetchWorkflows();
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      idle: 'badge-warning',
      running: 'badge-success',
      completed: 'badge-success',
      failed: 'badge-error'
    };
    return map[status] || 'badge-warning';
  };

  const getStatusText = (status: string) => {
    const map: Record<string, string> = {
      idle: '空闲',
      running: '运行中',
      completed: '已完成',
      failed: '失败'
    };
    return map[status] || status;
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>工作流</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? '取消' : '创建工作流'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>创建工作流</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              className="input"
              placeholder="工作流名称"
              value={name}
              onChange={e => setName(e.target.value)}
            />
            <textarea
              className="input"
              placeholder="步骤（用逗号分隔）"
              value={steps}
              onChange={e => setSteps(e.target.value)}
              rows={3}
            />
            <button className="btn btn-primary" onClick={createWorkflow} disabled={!name || !steps}>
              创建
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 16 }}>
        {workflows.length === 0 ? (
          <div className="empty-state">
            <h3>暂无工作流</h3>
            <p>创建工作流来定义多步骤自动化流程</p>
          </div>
        ) : workflows.map(workflow => (
          <div key={workflow.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 500 }}>{workflow.name}</h3>
                  <span className={`badge ${getStatusBadge(workflow.status)}`}>
                    {getStatusText(workflow.status)}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  步骤: {workflow.completedSteps}/{workflow.steps}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                  创建时间: {new Date(workflow.createdAt).toLocaleString()}
                </div>
              </div>
              {workflow.status === 'idle' && (
                <button className="btn btn-primary" onClick={() => runWorkflow(workflow.id)}>
                  运行
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
