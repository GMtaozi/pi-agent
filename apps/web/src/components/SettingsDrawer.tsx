import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Sliders, Route, Sparkles, Rocket, Clock, GitBranch, ShieldCheck, FileText, Activity, X, ArrowRight, BarChart3, Users, Monitor, Target, LineChart } from 'lucide-react';
import GeneralSettings from './GeneralSettings';
import ModelRouterSettings from './ModelRouterSettings';
import SchedulerSettings from './SchedulerSettings';
import GovernanceSettings from './GovernanceSettings';
import AnalyticsPage from '../pages/AnalyticsPage';
import AgentEvolutionPage from '../pages/AgentEvolutionPage';
import MultiAgentPage from '../pages/MultiAgentPage';
import DevWorkbenchPage from '../pages/DevWorkbenchPage';
import ProductWorkbenchPage from '../pages/ProductWorkbenchPage';
import AnalystWorkbenchPage from '../pages/AnalystWorkbenchPage';
import { getScheduledTasks } from '../lib/api';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'general' | 'model-router' | 'scheduler' | 'governance' | 'analytics' | 'evolution' | 'multi-agent' | 'dev-workbench' | 'product-workbench' | 'analyst-workbench';

export default function SettingsDrawer({ isOpen, onClose }: SettingsDrawerProps) {
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [taskCount, setTaskCount] = useState<number>(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    getScheduledTasks()
      .then(data => {
        if (!cancelled) setTaskCount(Array.isArray(data) ? data.length : 0);
      })
      .catch(() => {
        if (!cancelled) setTaskCount(0);
      });
    return () => { cancelled = true; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-drawer" onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="settings-header">
          <h2><Settings size={20} /> 设置</h2>
          <button className="settings-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* 左侧导航 */}
          <nav className="settings-nav">
            <div className="settings-section">
              <div className="settings-section-title">管理</div>
              <div
                className={`settings-nav-item ${activeTab === 'general' ? 'active' : ''}`}
                onClick={() => setActiveTab('general')}
              >
                <Sliders size={18} />
                <span>通用</span>
              </div>
              <div
                className={`settings-nav-item ${activeTab === 'model-router' ? 'active' : ''}`}
                onClick={() => setActiveTab('model-router')}
              >
                <Route size={18} />
                <span>模型路由</span>
                <span className="badge">智能</span>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-title">智能体</div>
              <div
                className="settings-nav-item"
                onClick={() => {
                  onClose();
                  navigate('/skills');
                }}
              >
                <Sparkles size={18} />
                <span>技能管理</span>
              </div>
              <div
                className="settings-nav-item"
                onClick={() => {
                  onClose();
                  navigate('/skills/market');
                }}
              >
                <Rocket size={18} />
                <span>技能市场</span>
                <span className="badge">New</span>
              </div>
              <div
                className={`settings-nav-item ${activeTab === 'scheduler' ? 'active' : ''}`}
                onClick={() => setActiveTab('scheduler')}
              >
                <Clock size={18} />
                <span>任务计划</span>
                <span className="badge">{taskCount}</span>
              </div>
              <div className="settings-nav-item">
                <GitBranch size={18} />
                <span>工作流</span>
                <span className="badge warning">Beta</span>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-title">安全</div>
              <div
                className={`settings-nav-item ${activeTab === 'governance' ? 'active' : ''}`}
                onClick={() => setActiveTab('governance')}
              >
                <ShieldCheck size={18} />
                <span>治理策略</span>
              </div>
              <div className="settings-nav-item">
                <FileText size={18} />
                <span>审计日志</span>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-title">进化</div>
              <div
                className={`settings-nav-item ${activeTab === 'evolution' ? 'active' : ''}`}
                onClick={() => setActiveTab('evolution')}
              >
                <Rocket size={18} />
                <span>自我进化</span>
              </div>
              <div
                className={`settings-nav-item ${activeTab === 'multi-agent' ? 'active' : ''}`}
                onClick={() => setActiveTab('multi-agent')}
              >
                <Users size={18} />
                <span>多 Agent 协作</span>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-title">工作台</div>
              <div
                className={`settings-nav-item ${activeTab === 'dev-workbench' ? 'active' : ''}`}
                onClick={() => setActiveTab('dev-workbench')}
              >
                <Monitor size={18} />
                <span>开发者工作台</span>
              </div>
              <div
                className={`settings-nav-item ${activeTab === 'product-workbench' ? 'active' : ''}`}
                onClick={() => setActiveTab('product-workbench')}
              >
                <Target size={18} />
                <span>产品经理工作台</span>
              </div>
              <div
                className={`settings-nav-item ${activeTab === 'analyst-workbench' ? 'active' : ''}`}
                onClick={() => setActiveTab('analyst-workbench')}
              >
                <LineChart size={18} />
                <span>运营/分析师工作台</span>
              </div>
            </div>

            <div className="settings-section" style={{ marginTop: 'auto' }}>
              <div
                className={`settings-nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
                onClick={() => setActiveTab('analytics')}
              >
                <BarChart3 size={18} />
                <span>数据看板</span>
              </div>
              <div className="settings-nav-item">
                <Activity size={18} />
                <span>监控</span>
              </div>
            </div>
          </nav>

          {/* 右侧内容 */}
          <div className="settings-content">
            {activeTab === 'general' && <GeneralSettings />}
            {activeTab === 'model-router' && <ModelRouterSettings />}
            {activeTab === 'scheduler' && <SchedulerSettings />}
            {activeTab === 'governance' && <GovernanceSettings />}
            {activeTab === 'analytics' && <AnalyticsPage onBack={onClose} />}
            {activeTab === 'evolution' && <AgentEvolutionPage onBack={onClose} />}
            {activeTab === 'multi-agent' && <MultiAgentPage onBack={onClose} />}
            {activeTab === 'dev-workbench' && <DevWorkbenchPage onBack={onClose} />}
            {activeTab === 'product-workbench' && <ProductWorkbenchPage onBack={onClose} />}
            {activeTab === 'analyst-workbench' && <AnalystWorkbenchPage onBack={onClose} />}
          </div>
        </div>

        {/* 底部：查看更多设置入口 */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)' }}>
          <button
            onClick={() => {
              onClose();
              navigate('/settings');
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--accent-color)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
              padding: 0,
            }}
          >
             查看更多设置 <ArrowRight size={14} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
          </button>
        </div>
      </div>
    </div>
  );
}
