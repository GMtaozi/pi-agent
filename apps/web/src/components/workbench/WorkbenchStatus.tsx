import { authedFetch } from '../../lib/api';
import { useState, useEffect } from 'react';

export interface TaskStatusState {
  taskId: string;
  status: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  result?: any;
}

export interface WorkbenchStatusProps {
  taskId: string;
  onStatusChange?: (status: TaskStatusState) => void;
}

const STATUS_TEXT: Record<string, string> = {
  idle: '等待中',
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

const STATUS_BADGE: Record<string, string> = {
  idle: 'badge-warning',
  running: 'badge-info',
  completed: 'badge-success',
  failed: 'badge-error',
  cancelled: 'badge-error',
};

export function WorkbenchStatus({ taskId, onStatusChange }: WorkbenchStatusProps) {
  const [status, setStatus] = useState<string>('unknown');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  const [result, setResult] = useState<any>(null);
  const [polling, setPolling] = useState(true);

  useEffect(() => {
    if (!taskId || !polling) return;

    const interval = setInterval(async () => {
      try {
        const res = await authedFetch(`/orchestrator/tasks/${taskId}`);
        if (res.ok) {
          const data = await res.json();
          const currentStatus = data.task?.status || 'unknown';
          setStatus(currentStatus);
          setResult(data.task?.result);

          const state: TaskStatusState = {
            taskId,
            status: currentStatus,
            result: data.task?.result,
          };
          onStatusChange?.(state);

          if (currentStatus === 'completed' || currentStatus === 'failed' || currentStatus === 'cancelled') {
            clearInterval(interval);
            setPolling(false);
          }
        }
      } catch (e) {
        console.error('Failed to poll task status:', e);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [taskId, polling, onStatusChange]);

  if (!taskId) return null;

  const statusText = STATUS_TEXT[status] || status;
  const badgeClass = STATUS_BADGE[status] || 'badge-warning';

  return (
    <div className="config-card" style={{ marginBottom: 20, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>当前任务</div>
        <span className={`badge ${badgeClass}`}>{statusText}</span>
      </div>

      {status === 'running' && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
          任务正在执行中，请稍候...
        </div>
      )}

      {status === 'completed' && result && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', padding: 12, borderRadius: 'var(--radius-md)', marginTop: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>执行结果</div>
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflow: 'auto' }}>
            {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
          </div>
        </div>
      )}

      {status === 'failed' && (
        <div style={{ fontSize: 13, color: '#ef4444', marginTop: 8 }}>
          任务执行失败，请检查配置后重试
        </div>
      )}
    </div>
  );
}
