import { useState, useEffect } from 'react';
import { ArrowLeft, AlertTriangle, Settings, Sliders, Route, Sparkles, Clock, ShieldCheck, FileText, GitBranch, Activity, Cpu } from 'lucide-react';
import GeneralSettings from '../components/GeneralSettings';
import ModelRouterSettings from '../components/ModelRouterSettings';
import ModelsSettings from '../components/ModelsSettings';
import SkillsPage from './SkillsPage';
import MonitoringPage from './MonitoringPage';
import SchedulePage from './SchedulePage';
import GovernancePage from './GovernancePage';
import AuditLogPage from './AuditLogPage';
import OrchestratorPage from './OrchestratorPage';
import WorkflowPage from './WorkflowPage';
import { useSettingsApi } from '../hooks/useSettingsApi';
import { apiFetch } from '../lib/api';

type SettingsTab = 'general' | 'model-router' | 'skills' | 'monitoring' | 'schedule' | 'governance' | 'audit' | 'orchestrator' | 'workflow' | 'advanced' | 'api-keys';

interface SettingsPageProps {
  onNavigate?: (page: string) => void;
  onBack?: () => void;
}

interface NavItem {
  id: SettingsTab;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  icon: any;
  /** 静态徽章（如「智能」「Beta」） */
  badge?: string;
  badgeWarning?: boolean;
  /** 动态计数徽章的来源 */
  countSource?: 'skills' | 'schedule';
}

export default function SettingsPage({ onBack }: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [message, _setMessage] = useState<string | null>(null);
  const [error, _setError] = useState<string | null>(null);

  const {
    providers,
    apiKeys,
    serverError,
    fetchSettings,
    fetchModels,
    saveApiKey,
    deleteApiKey,
    addProvider
  } = useSettingsApi();

  useEffect(() => {
    fetchSettings();
    fetchModels();
  }, [fetchSettings, fetchModels]);

  // 导航徽章的动态计数（技能数 / 任务计划数）
  const [skillCount, setSkillCount] = useState(0);
  const [taskCount, setTaskCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    apiFetch<any[]>('/skills')
      .then(list => { if (!cancelled) setSkillCount(Array.isArray(list) ? list.length : 0); })
      .catch(() => {});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    apiFetch<{ tasks: any[] }>('/schedule/tasks')
      .then(data => { if (!cancelled) setTaskCount(data?.tasks?.length ?? 0); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const navItems: Record<SettingsTab, NavItem> = {
    general: { id: 'general', label: '通用', icon: Sliders },
    'api-keys': { id: 'api-keys', label: '模型供应商', icon: Cpu },
    'model-router': { id: 'model-router', label: '模型路由', icon: Route, badge: '智能' },
    advanced: { id: 'advanced', label: '高级', icon: Settings },
    skills: { id: 'skills', label: '技能', icon: Sparkles, countSource: 'skills' },
    schedule: { id: 'schedule', label: '任务计划', icon: Clock, countSource: 'schedule' },
    workflow: { id: 'workflow', label: '工作流', icon: GitBranch, badge: 'Beta', badgeWarning: true },
    orchestrator: { id: 'orchestrator', label: '任务编排', icon: GitBranch },
    governance: { id: 'governance', label: '治理策略', icon: ShieldCheck },
    audit: { id: 'audit', label: '审计日志', icon: FileText },
    monitoring: { id: 'monitoring', label: '监控', icon: Activity },
  };

  const navSections: Array<{ title: string; items: NavItem[]; bottom?: boolean }> = [
    { title: '管理', items: [navItems.general, navItems['api-keys'], navItems['model-router'], navItems.advanced] },
    { title: '智能体', items: [navItems.skills, navItems.schedule, navItems.workflow, navItems.orchestrator] },
    { title: '安全', items: [navItems.governance, navItems.audit] },
    { title: '', items: [navItems.monitoring], bottom: true },
  ];

  const renderBadge = (item: NavItem) => {
    if (item.countSource === 'skills') return skillCount > 0 ? String(skillCount) : undefined;
    if (item.countSource === 'schedule') return taskCount > 0 ? String(taskCount) : undefined;
    return item.badge;
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return <GeneralSettings onGoTo={tab => setActiveTab(tab)} />;
      case 'model-router':
        return <ModelRouterSettings />;
      case 'api-keys':
        return (
          <ModelsSettings
            providers={providers}
            apiKeys={apiKeys}
            onSaveKey={async (provider, key) => {
              await saveApiKey(provider, key);
              await fetchSettings();
            }}
            onDeleteKey={async (provider) => {
              await deleteApiKey(provider);
              await Promise.all([fetchSettings(), fetchModels()]);
            }}
            onAddCustomProvider={async (provider) => {
              await addProvider(provider);
              await Promise.all([fetchSettings(), fetchModels()]);
            }}
          />
        );
      case 'skills':
        return <SkillsPage />;
      case 'monitoring':
        return <MonitoringPage />;
      case 'schedule':
        return <SchedulePage />;
      case 'governance':
        return <GovernancePage />;
      case 'audit':
        return <AuditLogPage />;
      case 'orchestrator':
        return <OrchestratorPage />;
      case 'workflow':
        return <WorkflowPage />;
      case 'advanced':
        return (
          <div className="config-card">
            <div className="card-header">
              <div>
                <div className="title">高级设置</div>
                <div className="desc">应用数据存储位置与日志配置</div>
              </div>
            </div>
            <div className="setting-item">
              <div>
                <div className="setting-label">数据目录</div>
                <div className="setting-description">应用数据存储位置</div>
              </div>
              <code className="code-block">./data</code>
            </div>
            <div className="setting-item">
              <div>
                <div className="setting-label">日志级别</div>
                <div className="setting-description">控制日志输出详细程度</div>
              </div>
              <select className="input" style={{ width: 200 }}>
                <option>info</option>
                <option>warn</option>
                <option>error</option>
                <option>debug</option>
              </select>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="settings-page">
      {message && (
        <div className="alert alert-success">
          {message}
        </div>
      )}
      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}
      {serverError && (
        <div className="alert alert-error" style={{ border: '1px solid #ff4444', backgroundColor: '#2a1a1a' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><AlertTriangle size={18} />{serverError}</span>
        </div>
      )}

      <div className="settings-layout">
        <aside className="settings-nav">
          {onBack && (
            <button className="settings-back-btn nav-back-btn" onClick={onBack} title="返回对话">
              <ArrowLeft size={18} />
              <span>返回</span>
            </button>
          )}

          {navSections.filter(s => !s.bottom).map(section => (
            <div key={section.title} className="settings-section">
              <div className="settings-section-title">{section.title}</div>
              {section.items.map(item => {
                const Icon = item.icon;
                const badge = renderBadge(item);
                return (
                  <div
                    key={item.id}
                    className={`settings-nav-item ${activeTab === item.id ? 'active' : ''}`}
                    onClick={() => setActiveTab(item.id)}
                  >
                    <Icon size={16} />
                    <span className="nav-label">{item.label}</span>
                    {badge && <span className={`badge ${item.badgeWarning ? 'warning' : ''}`}>{badge}</span>}
                  </div>
                );
              })}
            </div>
          ))}

          {/* 底部固定项 */}
          <div className="settings-section" style={{ marginTop: 'auto' }}>
            {navSections.find(s => s.bottom)!.items.map(item => {
              const Icon = item.icon;
              return (
                <div
                  key={item.id}
                  className={`settings-nav-item ${activeTab === item.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(item.id)}
                >
                  <Icon size={16} />
                  <span className="nav-label">{item.label}</span>
                </div>
              );
            })}
          </div>
        </aside>

        <main className="settings-content">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
