import { useNavigate } from 'react-router-dom';
import { Play, Clock } from 'lucide-react';
import { WorkbenchTask } from './WorkbenchConfig';

export interface WorkbenchTaskCardProps {
  task: WorkbenchTask;
  returnPath: string;
}

export function WorkbenchTaskCard({ task, returnPath }: WorkbenchTaskCardProps) {
  const navigate = useNavigate();
  const Icon = task.icon;

  const handleRun = () => {
    if (task.source === 'market') {
      // 已启用的市场技能会自动注入新会话，进入对话即可使用
      navigate('/');
      return;
    }
    navigate(`/multi-agent?template=${task.templateId}&mode=auto&returnTo=${returnPath}`);
  };

  return (
    <div className="template-card" style={{ padding: 20, cursor: 'pointer' }} onClick={handleRun}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-tertiary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Icon size={20} style={{ color: 'var(--accent-color)' }} />
        </div>
        {task.source === 'market' ? (
          <span className="badge badge-warning">🏷️ 市场</span>
        ) : task.badge ? (
          <span className="badge success">{task.badge}</span>
        ) : null}
      </div>

      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>{task.title}</div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>{task.description}</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid var(--border-color)' }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Clock size={12} />
          {task.time}
        </div>
        <button
          className="btn btn-primary"
          style={{ padding: '6px 12px', fontSize: 12 }}
          onClick={(e) => {
            e.stopPropagation();
            handleRun();
          }}
        >
          <Play size={12} style={{ marginRight: 4 }} />
          运行
        </button>
      </div>
    </div>
  );
}
