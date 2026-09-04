import { authedFetch } from '../../lib/api';
import { ArrowLeft, Puzzle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { WorkbenchConfig, WorkbenchTask } from './WorkbenchConfig';
import { WorkbenchTaskCard } from './WorkbenchTaskCard';
import { WorkbenchStatus, TaskStatusState } from './WorkbenchStatus';

export interface WorkbenchLayoutProps {
  config: WorkbenchConfig;
  onBack?: () => void;
  loadMarketSkills?: boolean;
  children?: React.ReactNode;
}

interface MarketSkillItem {
  id: string;
  name: string;
  description?: string;
}

function toMarketTask(skill: MarketSkillItem): WorkbenchTask {
  return {
    id: `market-${skill.id}`,
    title: skill.name,
    description: skill.description || '来自技能市场的已启用技能。',
    icon: Puzzle,
    time: '市场技能',
    templateId: '',
    source: 'market',
  };
}

export function WorkbenchLayout({ config, onBack, loadMarketSkills, children }: WorkbenchLayoutProps) {
  const [marketTasks, setMarketTasks] = useState<WorkbenchTask[]>([]);

  useEffect(() => {
    if (!loadMarketSkills) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch('/skills');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const tasks: WorkbenchTask[] = (Array.isArray(data) ? data : [])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
          .filter((s: any) => s.enabled && s.source === 'market')
          .map(toMarketTask);
        setMarketTasks(tasks);
      } catch {
        // 加载失败时仅展示预设任务
      }
    })();
    return () => { cancelled = true; };
  }, [loadMarketSkills]);

  const allTasks = [...config.tasks, ...marketTasks];

  return (
    <div className="dev-workbench">
      <div className="settings-header">
        {onBack && (
          <button className="settings-back-btn" onClick={onBack} title="返回对话">
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="settings-header-content">
          <h1 className="settings-title">{config.name}</h1>
          <p className="settings-subtitle">{config.subtitle}</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
          <span>📋</span>
          <span>{config.tasks.length} 个预设任务</span>
          {marketTasks.length > 0 && (
            <>
              <span>·</span>
              <span>🏷️ {marketTasks.length} 个市场技能</span>
            </>
          )}
        </div>
      </div>

      <StatusPanel returnPath={config.returnPath} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {allTasks.map(task => (
          <WorkbenchTaskCard key={task.id} task={task} returnPath={config.returnPath} />
        ))}
      </div>

      {children}
    </div>
  );
}

function StatusPanel(_props: { returnPath: string }) {
  const [searchParams] = useSearchParams();
  const taskId = searchParams.get('taskId');

  const handleStatusChange = (_state: TaskStatusState) => {
    // Optional: could emit events or update global state here
  };

  if (!taskId) return null;

  return <WorkbenchStatus taskId={taskId} onStatusChange={handleStatusChange} />;
}
