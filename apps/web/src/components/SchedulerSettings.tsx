import { useState, useEffect } from 'react';
import { X, Play, Pause, Edit3, Plus } from 'lucide-react';
import { getScheduledTasks, createScheduledTask } from '../lib/api';
import { getFriendlyMessage } from '../lib/errors';

function SchedulerSettings() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  const [tasks, setTasks] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ workspaceId: '', cron: '', prompt: '' });

  const loadTasks = () => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getScheduledTasks()
      .then(data => {
        if (!cancelled) setTasks(data || []);
      })
      .catch(err => {
        if (!cancelled) setError(getFriendlyMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const handleCreate = async () => {
    if (!form.workspaceId.trim() || !form.cron.trim() || !form.prompt.trim()) {
      setError('请填写工作区 ID、Cron 表达式和提示词');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await createScheduledTask(form);
      setSuccess('任务已创建');
      setForm({ workspaceId: '', cron: '', prompt: '' });
      setShowForm(false);
      loadTasks();
    } catch (err) {
      setError(getFriendlyMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="scheduler-settings">
      <div className="page-header">
        <h2>任务计划</h2>
        <p>管理自动执行的定时任务与计划。</p>
      </div>

      {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError(null)}><X size={16} /></button></div>}
      {success && <div className="success-banner"><span>{success}</span><button onClick={() => setSuccess(null)}><X size={16} /></button></div>}

      {showForm && (
        <div className="config-card">
          <div className="card-header">
            <div>
              <div className="title">新建任务</div>
              <div className="desc">创建一个新的定时执行任务</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-item">
              <label className="form-label">工作区 ID</label>
              <input
                className="input"
                value={form.workspaceId}
                onChange={event => setForm({ ...form, workspaceId: event.target.value })}
                placeholder="default"
              />
            </div>
            <div className="form-item">
              <label className="form-label">Cron 表达式</label>
              <input
                className="input"
                value={form.cron}
                onChange={event => setForm({ ...form, cron: event.target.value })}
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
                onChange={event => setForm({ ...form, prompt: event.target.value })}
                placeholder="请总结今日工作重点..."
                style={{ resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
                {saving ? '创建中...' : '创建任务'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="settings-loading">加载中...</div>
      ) : tasks.length === 0 ? (
        <div className="settings-empty">暂无定时任务</div>
      ) : (
        <div className="config-card" style={{ padding: 0 }}>
          {tasks.map((task, idx) => (
            <div key={task.id} className="task-row" style={{ borderBottom: idx < tasks.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
              <div className="info">
                <div className="name">{task.workspaceId || '默认工作区'}</div>
                <div className="cron">CRON: {task.cron || task.cronExpr}</div>
              </div>
              <div className="status">
                <span className={`tag ${task.enabled ? 'success' : 'warning'}`}>{task.enabled ? '运行中' : '已暂停'}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, color: 'var(--text-muted)', alignItems: 'center' }}>
                <button className="row-icon-btn" title={task.enabled ? '暂停' : '启动'}>
                  {task.enabled ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <button className="row-icon-btn" title="编辑">
                  <Edit3 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        style={{
          marginTop: 12,
          background: 'transparent',
          border: '1px dashed var(--border-color)',
          borderRadius: 'var(--radius-md)',
          padding: 10,
          width: '100%',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          transition: 'var(--transition)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
        onClick={() => setShowForm(true)}
      >
        <Plus size={16} /> 创建新任务
      </button>
    </div>
  );
}

export default SchedulerSettings;
