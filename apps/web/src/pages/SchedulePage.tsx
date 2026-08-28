import { useState, useEffect } from 'react';
import { X, Play, Pause, Edit3, Trash2, Plus, History } from 'lucide-react';
import {
  getScheduledTasks,
  createScheduledTask,
  updateScheduledTask,
  deleteScheduledTask,
  getTaskHistory,
  runTaskNow,
  type ScheduledTask,
  type TaskHistory,
} from '../lib/api';
import { getFriendlyMessage } from '../lib/errors';

type FormState = {
  name: string;
  cron: string;
  prompt: string;
  workspaceId: string;
};

const EMPTY_FORM: FormState = { name: '', cron: '', prompt: '', workspaceId: '' };

export default function SchedulePage() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [history, setHistory] = useState<TaskHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const loadTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getScheduledTasks();
      setTasks(data || []);
    } catch (e) {
      setError(getFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, workspaceId: 'default' });
    setShowForm(true);
  };

  const openEdit = (task: ScheduledTask) => {
    setEditingId(task.id);
    setForm({
      name: task.name || '',
      cron: task.cron || task.cronExpr || '',
      prompt: task.prompt || '',
      workspaceId: task.workspaceId || 'default',
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.workspaceId.trim() || !form.cron.trim() || !form.prompt.trim()) {
      setError('请填写工作区 ID、Cron 表达式和提示词');
      return;
    }
    setActionLoading('save');
    setError(null);
    setSuccess(null);
    try {
      if (editingId) {
        await updateScheduledTask(editingId, {
          name: form.name,
          cron: form.cron,
          prompt: form.prompt,
        });
        setSuccess('任务已更新');
      } else {
        await createScheduledTask({
          workspaceId: form.workspaceId,
          cron: form.cron,
          prompt: form.prompt,
        });
        setSuccess('任务已创建');
      }
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      await loadTasks();
    } catch (e) {
      setError(getFriendlyMessage(e));
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setActionLoading('delete');
    setError(null);
    try {
      await deleteScheduledTask(deleteTarget);
      setSuccess('任务已删除');
      setDeleteTarget(null);
      await loadTasks();
    } catch (e) {
      setError(getFriendlyMessage(e));
    } finally {
      setActionLoading(null);
    }
  };

  const handleRun = async (id: string) => {
    setActionLoading(id);
    setError(null);
    try {
      await runTaskNow(id);
      setSuccess('任务已触发执行');
      await loadTasks();
    } catch (e) {
      setError(getFriendlyMessage(e));
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggle = async (task: ScheduledTask) => {
    setActionLoading(task.id);
    setError(null);
    try {
      await updateScheduledTask(task.id, { enabled: !task.enabled });
      await loadTasks();
    } catch (e) {
      setError(getFriendlyMessage(e));
    } finally {
      setActionLoading(null);
    }
  };

  const loadHistory = async (taskId: string) => {
    setHistoryId(taskId);
    setHistoryLoading(true);
    setHistory([]);
    try {
      const data = await getTaskHistory(taskId);
      setHistory(data || []);
    } catch (e) {
      setError(getFriendlyMessage(e));
    } finally {
      setHistoryLoading(false);
    }
  };

  if (loading) {
    return <div className="settings-loading">加载任务计划...</div>;
  }

  return (
    <div className="schedule-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>任务计划</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 14 }}>管理自动执行的定时任务与计划</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={16} style={{ marginRight: 6 }} /> 新建任务
        </button>
      </div>

      {error && (
        <div className="error-banner" style={{ marginBottom: 16 }}>
          <span>{error}</span>
          <button onClick={() => setError(null)}><X size={16} /></button>
        </div>
      )}
      {success && (
        <div className="success-banner" style={{ marginBottom: 16 }}>
          <span>{success}</span>
          <button onClick={() => setSuccess(null)}><X size={16} /></button>
        </div>
      )}

      {showForm && (
        <div className="config-card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <div>
              <div className="title">{editingId ? '编辑任务' : '新建任务'}</div>
              <div className="desc">{editingId ? '修改定时任务配置' : '创建一个新的定时执行任务'}</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-item">
              <label className="form-label">工作区 ID</label>
              <input
                className="input"
                value={form.workspaceId}
                onChange={e => setForm({ ...form, workspaceId: e.target.value })}
                placeholder="default"
              />
            </div>
            <div className="form-item">
              <label className="form-label">任务名称</label>
              <input
                className="input"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="每日晨报"
              />
            </div>
            <div className="form-item">
              <label className="form-label">Cron 表达式</label>
              <input
                className="input"
                value={form.cron}
                onChange={e => setForm({ ...form, cron: e.target.value })}
                placeholder="0 8 * * *"
              />
              <div className="form-hint">例如：每天 8 点执行。</div>
            </div>
            <div className="form-item">
              <label className="form-label">提示词</label>
              <textarea
                className="input"
                rows={3}
                value={form.prompt}
                onChange={e => setForm({ ...form, prompt: e.target.value })}
                placeholder="请总结今日工作重点..."
                style={{ resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => { setShowForm(false); setEditingId(null); }} disabled={!!actionLoading}>
                取消
              </button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={!!actionLoading}>
                {actionLoading === 'save' ? '保存中...' : (editingId ? '更新任务' : '创建任务')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="config-card" style={{ padding: 0 }}>
        {tasks.length === 0 ? (
          <div className="settings-empty" style={{ padding: '40px 0' }}>暂无定时任务</div>
        ) : (
          tasks.map(task => (
            <div key={task.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
              <div className="task-row" style={{ borderBottom: 'none' }}>
                <div className="info">
                  <div className="name">{task.name || task.workspaceId || '默认工作区'}</div>
                  <div className="cron">CRON: {task.cron || task.cronExpr}</div>
                </div>
                <div className="status">
                  <span className={`tag ${task.enabled ? 'success' : 'warning'}`}>{task.enabled ? '运行中' : '已暂停'}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button className="row-icon-btn" title="立即执行" onClick={() => handleRun(task.id)} disabled={actionLoading === task.id}>
                    <Play size={14} />
                  </button>
                  <button className="row-icon-btn" title={task.enabled ? '暂停' : '启动'} onClick={() => handleToggle(task)} disabled={actionLoading === task.id}>
                    {task.enabled ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                  <button className="row-icon-btn" title="编辑" onClick={() => openEdit(task)} disabled={!!actionLoading}>
                    <Edit3 size={14} />
                  </button>
                  <button className="row-icon-btn" title="历史" onClick={() => historyId === task.id ? setHistoryId(null) : loadHistory(task.id)}>
                    <History size={14} />
                  </button>
                  <button className="row-icon-btn" title="删除" onClick={() => setDeleteTarget(task.id)} disabled={!!actionLoading}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {historyId === task.id && (
                <div style={{ padding: '12px 16px', background: 'var(--bg-primary)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>执行历史</div>
                  {historyLoading ? (
                    <div className="settings-loading" style={{ padding: '12px 0' }}>加载中...</div>
                  ) : history.length === 0 ? (
                    <div className="settings-empty" style={{ padding: '12px 0', fontSize: 13 }}>暂无执行记录</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {history.map(h => (
                        <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                          <div>
                            <div style={{ fontSize: 13 }}>{new Date(h.startedAt).toLocaleString('zh-CN')}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{h.status}{h.error ? `: ${h.error}` : ''}</div>
                          </div>
                          <span className={`tag ${h.status === 'completed' ? 'success' : h.status === 'failed' ? 'danger' : 'warning'}`}>{h.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>删除任务</h3>
              <button className="modal-close" onClick={() => setDeleteTarget(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, color: 'var(--text-secondary)' }}>确定要删除这个定时任务吗？此操作无法撤销。</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)} disabled={actionLoading === 'delete'}>取消</button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={actionLoading === 'delete'}>
                {actionLoading === 'delete' ? '删除中...' : '删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
