import { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation, matchPath } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar from './components/Sidebar';
import SettingsDrawer from './components/SettingsDrawer';
import { WorkspaceProvider, useWorkspace } from './contexts/WorkspaceContext';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { apiFetch } from './lib/api';
import { Menu } from 'lucide-react';

// Lazy-loaded pages
const ChatPage = lazy(() => import('./pages/ChatPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const WorkspacePage = lazy(() => import('./pages/WorkspacePage'));
const MemoryPage = lazy(() => import('./pages/MemoryPage'));
const SkillsPage = lazy(() => import('./pages/SkillsPage'));
const SkillMarketPage = lazy(() => import('./pages/SkillMarketPage'));
const SkillNewPage = lazy(() => import('./pages/SkillNewPage'));
const SkillDetailPage = lazy(() => import('./pages/SkillDetailPage'));
const TemplateMarketPage = lazy(() => import('./pages/templates/TemplateMarketPage'));
const TemplateDetailPage = lazy(() => import('./pages/templates/TemplateDetailPage'));
const TemplateCreatePage = lazy(() => import('./pages/templates/TemplateCreatePage'));
const SchedulePage = lazy(() => import('./pages/SchedulePage'));
const GovernancePage = lazy(() => import('./pages/GovernancePage'));
const AuditLogPage = lazy(() => import('./pages/AuditLogPage'));
const OrchestratorPage = lazy(() => import('./pages/OrchestratorPage'));
const WorkflowEditorPage = lazy(() => import('./pages/WorkflowEditorPage'));
const WorkflowPage = lazy(() => import('./pages/WorkflowPage'));
const MonitoringPage = lazy(() => import('./pages/MonitoringPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const ExecutionMonitoringPage = lazy(() => import('./pages/ExecutionMonitoringPage'));
const KnowledgeBasePage = lazy(() => import('./pages/KnowledgeBasePage'));
const AgentCreatePage = lazy(() => import('./pages/AgentCreatePage'));
const TrajectoryPage = lazy(() => import('./pages/TrajectoryPage'));
const AgentEvolutionPage = lazy(() => import('./pages/AgentEvolutionPage'));
const MultiAgentPage = lazy(() => import('./pages/MultiAgentPage'));
const DevWorkbenchPage = lazy(() => import('./pages/DevWorkbenchPage'));
const ProductWorkbenchPage = lazy(() => import('./pages/ProductWorkbenchPage'));
const AnalystWorkbenchPage = lazy(() => import('./pages/AnalystWorkbenchPage'));
const PluginMarketPage = lazy(() => import('./pages/plugins/PluginMarketPage'));
const PluginDetailPage = lazy(() => import('./pages/plugins/PluginDetailPage'));
const PluginCreatePage = lazy(() => import('./pages/plugins/PluginCreatePage'));
const McpConfigPage = lazy(() => import('./pages/plugins/McpConfigPage'));

function PageLoader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--text-secondary)' }}>
      <div className="spinner" style={{ width: 24, height: 24, border: '2px solid var(--border-color)', borderTopColor: 'var(--accent-color)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );
}

export type Page = 'chat'
  | 'settings'
  | 'workspace'
  | 'memory'
  | 'skills'
  | 'schedule'
  | 'governance'
  | 'audit-log'
  | 'orchestrator'
  | 'workflow'
  | 'workflow-editor'
  | 'monitoring'
  | 'execution-monitoring'
  | 'knowledge-base'
  | 'agent-create';

function AppContent() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem('sidebar-collapsed');
      return saved ? saved === 'true' : false;
    } catch {
      return false;
    }
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // 从 URL 解析 workspaceId/sessionId。
  // ⚠️ 不能用 useParams()：AppContent 在 <Routes> 之外，useParams 永远返回 {}。
  const location = useLocation();
  const sessionMatch = matchPath('/workspace/:workspaceId/session/:sessionId', location.pathname);
  const wsMatch = sessionMatch || matchPath('/workspace/:workspaceId', location.pathname);
  const urlWorkspaceId = wsMatch?.params.workspaceId;
  const urlSessionId = sessionMatch?.params.sessionId;
  const { setWorkspaceId, setSessionId } = useWorkspace();

  // 主题：默认深色；先读本地缓存避免闪烁，再以服务端持久化配置为准
  useEffect(() => {
    try {
      const cached = localStorage.getItem('app-theme');
      if (cached === 'light' || cached === 'dark') {
        document.documentElement.setAttribute('data-theme', cached);
      }
    } catch {
      // ignore
    }
    let cancelled = false;
    apiFetch<{ theme?: 'light' | 'dark' }>('/settings')
      .then(settings => {
        if (cancelled) return;
        const theme = settings.theme === 'light' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', theme);
        try {
          localStorage.setItem('app-theme', theme);
        } catch {
          // ignore
        }
      })
      .catch(() => {
        // 服务端不可用时保持默认深色
      });
    return () => { cancelled = true; };
  }, []);

  // 持久化 Sidebar 折叠状态
  useEffect(() => {
    try {
      localStorage.setItem('sidebar-collapsed', String(sidebarCollapsed));
    } catch {
      // ignore
    }
  }, [sidebarCollapsed]);

  // URL → Context 同步（单向：URL 变化时更新 Context）
  // 确保 URL 是唯一的真实来源，Context 只是 URL 的"投影"
  useEffect(() => {
    if (urlWorkspaceId) {
      setWorkspaceId(urlWorkspaceId);
    }
    if (urlSessionId) {
      setSessionId(urlSessionId);
    } else if (urlWorkspaceId) {
      // 切换到没有 session 的工作区时，清除旧的 sessionId，
      // 防止发送消息时复用前一个工作区的失效 session
      setSessionId(null);
    }
  }, [urlWorkspaceId, urlSessionId, setWorkspaceId, setSessionId]);

  // 全局快捷键
  useKeyboardShortcuts({
    'Ctrl+B': () => setSidebarCollapsed(prev => !prev),
    'Ctrl+,': () => setIsSettingsOpen(true),
    'Escape': () => {
      setIsSettingsOpen(false);
      setSidebarOpen(false);
    },
  });

  const toggleSidebar = () => setSidebarOpen(prev => !prev);
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="app">
      {/* 左侧边栏 */}
      <Sidebar
        collapsed={sidebarCollapsed}
        isOpen={sidebarOpen}
        onClose={closeSidebar}
      />

      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={closeSidebar}
        />
      )}

      {/* 主聊天区 flex:1 */}
      <main className="dsh-main">
        <button
          className="hamburger"
          onClick={toggleSidebar}
          title="菜单"
        >
          <Menu size={20} />
        </button>
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<ChatPage onToggleSidebar={toggleSidebar} />} />
              <Route path="/workspace/:workspaceId" element={<ChatPage onToggleSidebar={toggleSidebar} />} />
              <Route path="/workspace/:workspaceId/session/:sessionId" element={<ChatPage onToggleSidebar={toggleSidebar} />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/workspace" element={<WorkspacePage />} />
              <Route path="/memory" element={<MemoryPage />} />
              <Route path="/skills" element={<SkillsPage />} />
              <Route path="/skills/market" element={<SkillMarketPage />} />
              <Route path="/skills/new" element={<SkillNewPage />} />
              <Route path="/skills/:id" element={<SkillDetailPage />} />
              <Route path="/templates" element={<TemplateMarketPage />} />
              <Route path="/templates/new" element={<TemplateCreatePage />} />
              <Route path="/templates/:id" element={<TemplateDetailPage />} />
              <Route path="/schedule" element={<SchedulePage />} />
              <Route path="/governance" element={<GovernancePage />} />
              <Route path="/audit-log" element={<AuditLogPage />} />
              <Route path="/orchestrator" element={<OrchestratorPage />} />
              <Route path="/workflow" element={<WorkflowPage />} />
              <Route path="/workflow-editor" element={<WorkflowEditorPage />} />
              <Route path="/monitoring" element={<MonitoringPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/execution-monitoring" element={<ExecutionMonitoringPage />} />
              <Route path="/knowledge-base" element={<KnowledgeBasePage />} />
              <Route path="/agent-create" element={<AgentCreatePage />} />
              <Route path="/trajectory" element={<TrajectoryPage />} />
              <Route path="/evolution" element={<AgentEvolutionPage />} />
              <Route path="/multi-agent" element={<MultiAgentPage />} />
              <Route path="/dev-workbench" element={<DevWorkbenchPage />} />
              <Route path="/product-workbench" element={<ProductWorkbenchPage />} />
              <Route path="/analyst-workbench" element={<AnalystWorkbenchPage />} />
              <Route path="/plugins" element={<PluginMarketPage />} />
              <Route path="/plugins/new" element={<PluginCreatePage />} />
              <Route path="/plugins/:id" element={<PluginDetailPage />} />
              <Route path="/mcp-config" element={<McpConfigPage />} />
              <Route path="/solutions" element={<SolutionMarketPage />} />
              <Route path="/solutions/new" element={<SolutionCreatePage />} />
              <Route path="/solutions/:id" element={<SolutionDetailPage />} />
              <Route path="/cloud/subscription" element={<CloudSubscriptionPage />} />
              <Route path="/cloud/usage" element={<CloudUsagePage />} />
              <Route path="/cloud/plans" element={<CloudPlansPage />} />
              <Route path="/sso/config" element={<SsoConfigPage />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* 右侧设置面板 */}
      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <WorkspaceProvider>
        <AppContent />
      </WorkspaceProvider>
    </BrowserRouter>
  );
}
