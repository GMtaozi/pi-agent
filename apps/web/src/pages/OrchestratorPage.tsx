import { authedFetch } from '../lib/api';
import { useState, useEffect } from 'react';

interface Task {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  workerId?: string;
  createdAt: string;
  completedAt?: string;
}

export default function OrchestratorPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  const [workers, setWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskName, setNewTaskName] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [tasksRes, workersRes] = await Promise.all([
        authedFetch('/orchestrator/tasks'),
        authedFetch('/orchestrator/workers')
      ]);
      if (tasksRes.ok) {
        const data = await tasksRes.json();
        setTasks(data.tasks || []);
      }
      if (workersRes.ok) {
        const data = await workersRes.json();
        setWorkers(data.workers || []);
      }
    } catch (e) {
      console.error('Failed to fetch orchestrator data:', e);
    } finally {
      setLoading(false);
    }
  };

  const createTask = async () => {
    if (!newTaskName.trim()) return;
    await authedFetch('/orchestrator/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newTaskName, type: 'general' })
    });
    setNewTaskName('');
    fetchData();
  };

  const cancelTask = async (id: string) => {
    await authedFetch('/orchestrator/tasks/' + id + '/cancel', { method: 'POST' });
    fetchData();
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'badge-warning',
      running: 'badge-success',
      completed: 'badge-success',
      failed: 'badge-error'
    };
    return map[status] || 'badge-warning';
  };

  const getStatusText = (status: string) => {
    const map: Record<string, string> = {
      pending: '等待中',
      running: '运行中',
      completed: '已完成',
      failed: '失败'
    };
    return map[status] || status;
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>任务编排</h1>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Worker 状态</h3>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {workers.map(worker => (
            <div key={worker.id} style={{ 
              padding: 16, 
              background: 'var(--bg-secondary)', 
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              minWidth: 200
            }}>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>{worker.id}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                类型: {worker.type}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                能力: {worker.capabilities?.join(', ') || '-'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>新建任务</h3>
        <div style={{ display: 'flex', gap: 12 }}>
          <input
            className="input"
            placeholder="任务名称..."
            value={newTaskName}
            onChange={e => setNewTaskName(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" onClick={createTask} disabled={!newTaskName.trim()}>
            创建任务
          </button>
        </div>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>名称</th>
              <th>状态</th>
              <th>Worker</th>
              <th>创建时间</th>
              <th>完成时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                  暂无任务
                </td>
              </tr>
            ) : tasks.map(task => (
              <tr key={task.id}>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{task.id.slice(0, 8)}</td>
                <td style={{ fontWeight: 500 }}>{task.name}</td>
                <td>
                  <span className={`badge ${getStatusBadge(task.status)}`}>
                    {getStatusText(task.status)}
                  </span>
                </td>
                <td style={{ fontSize: 13 }}>{task.workerId || '-'}</td>
                <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                  {new Date(task.createdAt).toLocaleString()}
                </td>
                <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                  {task.completedAt ? new Date(task.completedAt).toLocaleString() : '-'}
                </td>
                <td>
                  {task.status === 'running' && (
                    <button className="btn btn-sm btn-danger" onClick={() => cancelTask(task.id)}>
                      取消
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
