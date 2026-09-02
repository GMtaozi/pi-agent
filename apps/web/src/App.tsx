import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation, matchPath } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import ChatPage from './pages/ChatPage';
import SettingsPage from './pages/SettingsPage';
import WorkspacePage from './pages/WorkspacePage';
import MemoryPage from './pages/MemoryPage';
import SkillsPage from './pages/SkillsPage';
import SkillMarketPage from './pages/SkillMarketPage';
import SkillNewPage from './pages/SkillNewPage';
import SkillDetailPage from './pages/SkillDetailPage';
import SchedulePage from './pages/SchedulePage';
import GovernancePage from './pages/GovernancePage';
import AuditLogPage from './pages/AuditLogPage';
import OrchestratorPage from './pages/OrchestratorPage';
import WorkflowEditorPage from './pages/WorkflowEditorPage';
import WorkflowPage from './pages/WorkflowPage';
import MonitoringPage from './pages/MonitoringPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ExecutionMonitoringPage from './pages/ExecutionMonitoringPage';
import KnowledgeBasePage from './pages/KnowledgeBasePage';
import AgentCreatePage from './pages/AgentCreatePage';
import TrajectoryPage from './pages/TrajectoryPage';
import AgentEvolutionPage from './pages/AgentEvolutionPage';
import MultiAgentPage from './pages/MultiAgentPage';
import DevWorkbenchPage from './pages/DevWorkbenchPage';
import ProductWorkbenchPage from './pages/ProductWorkbenchPage';
import AnalystWorkbenchPage from './pages/AnalystWorkbenchPage';
import Sidebar from './components/Sidebar';
import SettingsDrawer from './components/SettingsDrawer';
import { WorkspaceProvider, useWorkspace } from './contexts/WorkspaceContext';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { apiFetch } from './lib/api';
import { Menu } from 'lucide-react';

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
          </Routes>
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
