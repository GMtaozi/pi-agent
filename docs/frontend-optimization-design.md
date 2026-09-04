# Frontend Optimization Design Document

> 基于当前 React 18 + TypeScript + Vite 技术栈，结合路线图 v3.1 的产品能力规划，制定前端优化设计方案。
> 当前前端版本：`apps/web` v0.1.0
>
> **版本历史**
> - v2.2（本版）：Sidebar 改用 React Router 驱动、SettingsDrawer 增加完整设置入口、SSE 去重、API 前缀环境变量、URL-Context 同步
> - v2.1：SSE 连接管理与断线重连、错误处理分级策略、Zustand 升级路径
> - v2.0：补充路由方案、状态管理、联动机制、响应式策略、本地存储、骨架屏、快捷键等 8 项关键设计
> - v1.0：初始三栏布局 + 组件化方案

---

## 1. 当前前端架构分析

### 1.1 技术栈确认

| 层次 | 技术 | 版本 | 备注 |
|------|------|------|------|
| 框架 | React | 18.3.1 | 计划引入 react-router-dom v6 |
| 语言 | TypeScript | 5.6.2 | 严格模式 |
| 构建 | Vite | 6.0.5 | HMR 正常 |
| 状态 | useState/useEffect → Context | 内置 | 后续可升级到 Zustand |
| 样式 | CSS 变量 + 全局类 | 无 CSS-in-JS | 已有完整 design tokens |
| 路由 | history.pushState → react-router-dom v6 | 计划迁移 | 支持嵌套路由 |
| 测试 | Vitest + Testing Library | - | 已有基础测试 |
| 图标 | emoji → lucide-react | 计划迁移 | package.json 已包含 |

### 1.2 现有文件结构

```
apps/web/src/
├── components/
│   ├── ApprovalModal.tsx
│   ├── DiffViewer.tsx
│   ├── ErrorBanner.tsx
│   ├── ErrorBoundary.tsx
│   ├── LoadingSkeleton.tsx
│   ├── MarkdownRenderer.tsx
│   ├── ModelSelect.tsx
│   ├── ModelsSettings.tsx
│   └── Sidebar.tsx              ← 当前：简单导航，无 workspace/session 管理
├── hooks/
│   ├── useMonitoringWebSocket.ts
│   ├── useSettingsApi.ts
│   └── useWorkspaceRefresh.ts
├── lib/
│   ├── api.ts                   ← 基础 fetch 封装，有重试逻辑
│   ├── errors.ts
│   └── providers.ts
├── pages/
│   ├── ChatPage.tsx
│   ├── SettingsPage.tsx
│   ├── WorkspacePage.tsx
│   ├── MemoryPage.tsx
│   ├── SkillsPage.tsx
│   ├── SchedulePage.tsx
│   ├── GovernancePage.tsx
│   ├── AuditLogPage.tsx
│   ├── OrchestratorPage.tsx
│   ├── WorkflowPage.tsx
│   └── MonitoringPage.tsx
├── App.tsx                      ← 当前：简单页面切换，无布局
├── main.tsx
└── index.css                    ← 已有完整 design tokens
```

### 1.3 当前痛点

| 痛点 | 影响 | 优先级 |
|------|------|--------|
| App.tsx 是简单页面切换，无三栏布局 | 无法同时看到工作区 + 对话 + 设置 | 🔴 高 |
| Sidebar 只有导航，无 workspace/session 树 | 用户无法在不同会话间切换 | 🔴 高 |
| 手动路由，无浏览器前进/后退 | 用户体验差，无法分享链接 | 🔴 高 |
| 无全局状态管理，props drilling | 页面间共享状态困难 | 🟡 中 |
| 无错误边界 + 重试机制 | 异常时用户体验差 | 🟡 中 |
| 样式零散，部分内联 | 维护困难，主题切换不完整 | 🟡 中 |
| 无响应式策略 | 小屏幕体验未定义 | 🟡 中 |
| 用户偏好不持久化 | 刷新后状态丢失 | 🟡 中 |

---

## 2. 优化方案：三步走（v2.0 更新）

### 2.1 第一步：统一设计语言 + 路由升级 + 状态管理

**目标**：建立可维护的基础架构，为后续组件化铺路。

#### 2.1.1 扩展 Design Tokens

在现有 `index.css` 基础上，增加以下变量：

```css
/* ========================================
   Extended Design Tokens
   ======================================== */

/* 语义化颜色 */
--bg-primary: #0b0e14;          /* 主背景 */
--bg-secondary: #131820;        /* 次级背景 */
--bg-elevated: #1c2430;         /* 悬浮/卡片背景 */
--bg-input: #0f141c;            /* 输入框背景 */
--border-color: rgba(255, 255, 255, 0.06);
--text-primary: #f1f5f9;
--text-secondary: #94a3b8;
--text-muted: #475569;

/* 品牌色 */
--accent: #8b5cf6;              /* 主品牌色 */
--accent-glow: rgba(139, 92, 246, 0.25);
--accent-cyan: #06b6d4;         /* 辅助色 */

/* 圆角 */
--radius-sm: 6px;
--radius-md: 12px;
--radius-lg: 20px;

/* 阴影 */
--shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
--shadow-md: 0 2px 8px rgba(0,0,0,0.06);
--shadow-lg: 0 4px 16px rgba(0,0,0,0.08);
--shadow-elevated: 0 20px 60px -12px rgba(0,0,0,0.8);

/* 动画 */
--transition-fast: 150ms ease;
--transition-normal: 200ms ease;
--transition-slow: 300ms cubic-bezier(0.4, 0, 0.2, 1);
```

**注意**：当前已有 `[data-theme="dark"]` 主题，建议：
- 新增的暗色变量直接覆盖默认值
- 保留 `[data-theme="light"]` 用于浅色模式

#### 2.1.2 引入 React Router v6

**安装**：
```bash
pnpm add react-router-dom
```

**改造 App.tsx**：

```tsx
// App.tsx (改造后)
import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import ChatPage from './pages/ChatPage';
import SettingsPage from './pages/SettingsPage';
import WorkspacePage from './pages/WorkspacePage';
import MemoryPage from './pages/MemoryPage';
import SkillsPage from './pages/SkillsPage';
import SchedulePage from './pages/SchedulePage';
import GovernancePage from './pages/GovernancePage';
import AuditLogPage from './pages/AuditLogPage';
import OrchestratorPage from './pages/OrchestratorPage';
import WorkflowPage from './pages/WorkflowPage';
import MonitoringPage from './pages/MonitoringPage';
import Sidebar from './components/Sidebar';
import SettingsDrawer from './components/SettingsDrawer';

export type Page = 'chat' | 'settings' | 'workspace' | 'memory' | 'skills' 
  | 'schedule' | 'governance' | 'audit-log' | 'orchestrator' | 'workflow' | 'monitoring';

function AppContent() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { workspaceId: urlWorkspaceId, sessionId: urlSessionId } = useParams();
  const { setWorkspaceId, setSessionId } = useWorkspace();
  
  // URL → Context 同步（单向：URL 变化时更新 Context）
  // 确保 URL 是唯一的真实来源，Context 只是 URL 的"投影"
  useEffect(() => {
    if (urlWorkspaceId) {
      setWorkspaceId(urlWorkspaceId);
    }
    if (urlSessionId) {
      setSessionId(urlSessionId);
    }
  }, [urlWorkspaceId, urlSessionId, setWorkspaceId, setSessionId]);
  
  return (
    <div className="app">
      {/* 左侧边栏 280px - 完全由 React Router 驱动，无需 props */}
      <Sidebar />
      
      {/* 主聊天区 flex:1 */}
      <main className="dsh-main">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<ChatPage onOpenSettings={() => setIsSettingsOpen(true)} />} />
            <Route path="/workspace/:workspaceId" element={<ChatPage onOpenSettings={() => setIsSettingsOpen(true)} />} />
            <Route path="/workspace/:workspaceId/session/:sessionId" element={<ChatPage onOpenSettings={() => setIsSettingsOpen(true)} />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/workspace" element={<WorkspacePage />} />
            <Route path="/memory" element={<MemoryPage />} />
            <Route path="/skills" element={<SkillsPage />} />
            <Route path="/schedule" element={<SchedulePage />} />
            <Route path="/governance" element={<GovernancePage />} />
            <Route path="/audit-log" element={<AuditLogPage />} />
            <Route path="/orchestrator" element={<OrchestratorPage />} />
            <Route path="/workflow" element={<WorkflowPage />} />
            <Route path="/monitoring" element={<MonitoringPage />} />
          </Routes>
        </ErrorBoundary>
      </main>
      
      {/* 右侧设置面板 260px (可折叠) */}
      <SettingsDrawer isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
```

**关键变化**：
- 使用 `react-router-dom` v6 的 `Routes`/`Route` 声明式路由
- 支持 `/workspace/:workspaceId/session/:sessionId` 嵌套路由
- 刷新页面后 URL 状态保持不变
- 浏览器前进/后退正常工作
- 可分享会话链接

#### 2.1.3 WorkspaceContext 状态管理

**创建 Context**：

```tsx
// contexts/WorkspaceContext.tsx
import { createContext, useContext, useState, ReactNode } from 'react';

interface WorkspaceContextValue {
  workspaceId: string;
  setWorkspaceId: (id: string) => void;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaceId, setWorkspaceId] = useState(() => {
    // 从 URL 或 localStorage 初始化
    const saved = localStorage.getItem('last-workspace');
    return saved || 'default';
  });
  
  const [sessionId, setSessionId] = useState<string | null>(null);
  
  return (
    <WorkspaceContext.Provider value={{ workspaceId, setWorkspaceId, sessionId, setSessionId }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return context;
}
```

**在 App.tsx 中使用**：

```tsx
// App.tsx
import { WorkspaceProvider } from './contexts/WorkspaceContext';

function AppContent() {
  return (
    <WorkspaceProvider>
      <div className="app">
        <Sidebar />
        <main className="dsh-main">...</main>
        <SettingsDrawer />
      </div>
    </WorkspaceProvider>
  );
}
```

**在组件中使用**：

```tsx
// Sidebar.tsx
const { workspaceId, setWorkspaceId, sessionId, setSessionId } = useWorkspace();

// ChatPage.tsx
const { workspaceId, sessionId } = useWorkspace();
```

---

### 2.2 第二步：组件化移植（侧边栏 + 设置面板）

#### 2.2.1 Sidebar 组件升级

**当前**：只有导航，无 workspace/session 管理
**目标**：支持 workspace 折叠、session 列表、新建会话

```tsx
// components/Sidebar.tsx (升级版 - 方案 A：完全由 React Router 驱动)
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useWorkspace } from '../contexts/WorkspaceContext';

interface Workspace {
  id: string;
  name: string;
  sessions: Session[];
}

interface Session {
  id: string;
  title: string;
  updatedAt: string;
}

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { workspaceId, setWorkspaceId, sessionId, setSessionId } = useWorkspace();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [expandedWs, setExpandedWs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // 判断当前页面
  const currentPath = location.pathname;
  const isChatPage = currentPath === '/' || currentPath.startsWith('/workspace');

  // 加载 workspace 列表
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<Workspace[]>('/workspaces')
      .then(data => {
        if (!cancelled) {
          setWorkspaces(data);
          // 默认展开当前 workspace
          const current = data.find(ws => ws.id === workspaceId);
          if (current && !expandedWs.includes(current.id)) {
            setExpandedWs([current.id]);
          }
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [workspaceId]);

  const toggleWorkspace = (id: string) => {
    setExpandedWs(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectWorkspace = (id: string) => {
    setWorkspaceId(id);
    navigate(`/workspace/${id}`);
    toggleWorkspace(id);
  };

  const handleSelectSession = (sessionId: string) => {
    setSessionId(sessionId);
    // 路由会自动更新，ChatPage 通过监听 sessionId 变化响应
  };

  return (
    <aside className="dsh-sidebar">
      {/* 品牌 */}
      <div className="sidebar-brand-row">
        <button className="brand-wordmark" onClick={() => navigate('/')}>
          Pi Agent
        </button>
      </div>

      {/* 新建会话按钮 */}
      <button className="new-session-btn" onClick={() => navigate('/')}>
        <span>+ 新会话</span>
      </button>

      {/* 工作区列表 */}
      <div className="sidebar-browsing">
        {loading ? (
          <div className="skeleton-sidebar">
            <div className="skeleton-row" />
            <div className="skeleton-row" />
            <div className="skeleton-row" />
          </div>
        ) : (
          <>
            <div className="sidebar-section-label">工作区</div>
            <div className="workspace-list">
              {workspaces.map(ws => (
                <div key={ws.id} className="workspace-group">
                  <div
                    className={`workspace-row ${workspaceId === ws.id ? 'active' : ''}`}
                    onClick={() => handleSelectWorkspace(ws.id)}
                  >
                    <FolderIcon />
                    <span className="workspace-name">{ws.name}</span>
                    <ChevronIcon expanded={expandedWs.includes(ws.id)} />
                  </div>

                  {expandedWs.includes(ws.id) && (
                    <div className="session-list">
                      {ws.sessions.map(session => (
                        <div
                          key={session.id}
                          className={`session-row ${sessionId === session.id ? 'active' : ''}`}
                          onClick={() => handleSelectSession(session.id)}
                        >
                          <span className="session-row-title">{session.title}</span>
                          <span className="session-row-time">
                            {formatRelativeTime(session.updatedAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 底部设置入口 */}
      <div className="sidebar-footer">
        <button className="settings-trigger" onClick={() => navigate('/settings')}>
          <SettingsIcon />
          <span>设置</span>
        </button>
      </div>
    </aside>
  );
}
```

**新增 CSS 类**：

```css
.workspace-group { margin-bottom: 8px; }
.workspace-name { flex: 1; font-size: 13px; font-weight: 500; }
.session-list { padding-left: 20px; margin-top: 4px; }

/* 骨架屏 */
.skeleton-sidebar { display: flex; flex-direction: column; gap: 8px; padding: 0 8px; }
.skeleton-row { height: 32px; background: var(--bg-tertiary); border-radius: var(--radius-md); animation: pulse 1.5s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
```

#### 2.2.2 SettingsDrawer 组件（新建）

**设置面板优先级分层**：

| 配置项 | 放在 Drawer | 放在 Page | 理由 |
|--------|------------|-----------|------|
| 模型路由（小/大/视觉） | ✅ | | 用户经常切换查看 |
| 数据飞轮开关 | ✅ | | 一键控制，高频操作 |
| 任务计划列表 | ✅ | | 用户需要快速查看任务状态 |
| 供应商管理 | | ✅ | 低频操作（新增/删除 API Key） |
| 审计日志 | | ✅ | 低频，需要详细表格 |
| 监控指标 | | ✅ | 低频，需要图表展示 |

```tsx
// components/SettingsDrawer.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'general' | 'model-router' | 'scheduler' | 'governance';

export default function SettingsDrawer({ isOpen, onClose }: SettingsDrawerProps) {
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const navigate = useNavigate();

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-drawer" onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="settings-header">
          <h2>⚙️ 设置</h2>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* 左侧导航 */}
          <nav className="settings-nav">
            {[
              { key: 'general', label: '通用', icon: '⚙️' },
              { key: 'model-router', label: '模型路由', icon: '🧭' },
              { key: 'scheduler', label: '任务计划', icon: '⏰' },
              { key: 'governance', label: '治理策略', icon: '🛡️' },
            ].map(tab => (
              <div
                key={tab.key}
                className={`settings-nav-item ${activeTab === tab.key ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </div>
            ))}
          </nav>

          {/* 右侧内容 */}
          <div className="settings-content">
            {activeTab === 'general' && <GeneralSettings />}
            {activeTab === 'model-router' && <ModelRouterSettings />}
            {activeTab === 'scheduler' && <SchedulerSettings />}
            {activeTab === 'governance' && <GovernanceSettings />}
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
              color: 'var(--accent)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
              padding: 0,
            }}
          >
            查看更多设置 →
          </button>
        </div>
      </div>
    </div>
  );
}
```

**新增 CSS**：

```css
.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
}

.settings-drawer {
  width: 640px;
  max-width: 90%;
  height: 100%;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  animation: slideIn 0.25s ease-out;
}

@keyframes slideIn {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 32px;
  border-bottom: 1px solid var(--border-color);
}

.settings-nav {
  width: 200px;
  padding: 24px 16px;
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
}

.settings-content {
  flex: 1;
  padding: 24px 32px;
  overflow-y: auto;
}
```

---

### 2.3 第三步：数据对接 + 联动机制 + 本地存储

#### 2.3.1 扩展 API 客户端

```ts
// lib/api.ts (扩展)
// 使用环境变量配置 API 前缀，便于后续后端路径变更（如 /api/v1）
const API_PREFIX = (import.meta.env?.VITE_API_PREFIX as string | undefined) || '/api';

// 现有 apiFetch 需同步修改，内部统一使用 API_PREFIX
// 原始实现参考 src/lib/api.ts，只需将路径拼接逻辑改为：
// const url = path.startsWith('http') ? path : `${API_PREFIX}${path}`;

// 现有 apiFetch 保留，增加以下专用方法：

export async function fetchWorkspaces(): Promise<Workspace[]> {
  return apiFetch<Workspace[]>('/workspaces');
}

export async function fetchSessions(workspaceId: string): Promise<Session[]> {
  return apiFetch<Session[]>(`/workspaces/${workspaceId}/sessions`);
}

export async function createSession(workspaceId: string, model: string): Promise<Session> {
  return apiFetch<Session>('/sessions', {
    method: 'POST',
    body: JSON.stringify({ workspaceId, model }),
  });
}

export async function deleteSession(sessionId: string): Promise<void> {
  return apiFetch<void>(`/sessions/${sessionId}`, { method: 'DELETE' });
}

export async function updateSessionTitle(sessionId: string, title: string): Promise<void> {
  return apiFetch<void>(`/sessions/${sessionId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
}

// 模型路由相关
export async function getModelRouterConfig(): Promise<ModelRouterConfig> {
  return apiFetch<ModelRouterConfig>('/settings/model-router');
}

export async function updateModelRouterConfig(config: ModelRouterConfig): Promise<void> {
  return apiFetch<void>('/settings/model-router', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

// 任务计划相关
export async function getScheduledTasks(): Promise<ScheduledTask[]> {
  return apiFetch<ScheduledTask[]>('/scheduled-tasks');
}

export async function createScheduledTask(task: CreateTaskInput): Promise<ScheduledTask> {
  return apiFetch<ScheduledTask>('/scheduled-tasks', {
    method: 'POST',
    body: JSON.stringify(task),
  });
}

// 反馈相关
export async function submitFeedback(sessionId: string, messageId: string, rating: number): Promise<void> {
  return apiFetch<void>(`/sessions/${sessionId}/feedback`, {
    method: 'POST',
    body: JSON.stringify({ messageId, rating }),
  });
}
```

**配套类型定义**：

```ts
// lib/types.ts (新建)
export interface Workspace {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export interface Session {
  id: string;
  workspaceId: string;
  title: string;
  model: string;
  updatedAt: string;
}

export interface ModelRouterConfig {
  smallModel: string;
  largeModel: string;
  visionModel?: string;
  threshold: number;
}

export interface ScheduledTask {
  id: string;
  name: string;
  cronExpr: string;
  prompt: string;
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
}
```

#### 2.3.1.1 SSE 连接管理与断线重连

**现状**：ChatPage 联动中提到了 `subscribeToSession`，但没有详细设计。Agent 流式响应是长连接，网络波动时自动重连能显著提升用户体验。

**设计方案**：

```ts
// lib/sse.ts (新建)
import { API_PREFIX } from './api';

export interface SSEEvent {
  type: string;
  data: any;
}

export function createSSEConnection(
  sessionId: string,
  onEvent: (event: SSEEvent) => void
) {
  let eventSource: EventSource | null = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 1000;

  function connect() {
    // 从 localStorage 获取最后收到的消息 ID，避免重连时重复消息
    const lastEventId = localStorage.getItem(`sse-last-event-${sessionId}`) || '';
    const url = `${API_PREFIX}/sessions/${sessionId}/stream${lastEventId ? `?since=${encodeURIComponent(lastEventId)}` : ''}`;
    
    eventSource = new EventSource(url);
    
    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        // 保存最后收到的消息 ID，用于下次重连
        if (data.id) {
          localStorage.setItem(`sse-last-event-${sessionId}`, data.id);
        }
        onEvent(data);
        reconnectAttempts = 0; // 重置重试计数
      } catch (err) {
        console.error('SSE parse error', err);
      }
    };
    
    eventSource.onerror = () => {
      eventSource?.close();
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        setTimeout(connect, RECONNECT_DELAY * reconnectAttempts);
      } else {
        // 超过最大重试次数，通知用户
        onEvent({ type: 'connection_failed', data: null });
      }
    };
  }

  connect();

  return () => {
    eventSource?.close();
  };
}
```

**使用示例**：

```tsx
// hooks/useSSE.ts
import { useEffect, useRef } from 'react';
import { createSSEConnection } from '../lib/sse';

export function useSSE(sessionId: string | null, onEvent: (event: SSEEvent) => void) {
  const cleanupRef = useRef<(() => void) | null>(null);
  
  useEffect(() => {
    if (!sessionId) return;
    
    // 清理旧连接
    if (cleanupRef.current) {
      cleanupRef.current();
    }
    
    cleanupRef.current = createSSEConnection(sessionId, onEvent);
    
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, [sessionId, onEvent]);
}
```

**在 ChatPage 中使用**：

```tsx
// pages/ChatPage.tsx
export default function ChatPage() {
  const { sessionId } = useWorkspace();
  const [messages, setMessages] = useState<Message[]>([]);
  
  useSSE(sessionId, (event) => {
    switch (event.type) {
      case 'agent_event':
        setMessages(prev => [...prev, event.data]);
        break;
      case 'connection_failed':
        showToast('连接断开，请刷新页面重试', 'error');
        break;
    }
  });
  
  // ...
}
```

**验收标准**：
- [ ] 网络波动时自动重连，重连后消息不丢失
- [ ] 超过 5 次重试失败后提示用户
- [ ] 组件卸载时正确关闭连接，无内存泄漏

#### 2.3.2 ChatPage 与 Sidebar 联动机制

**联动流程**：

```
Sidebar 点击会话
    ↓
setSessionId(sessionId)
    ↓
ChatPage 监听 sessionId 变化
    ↓
├── 1. 加载会话历史 (loadSession)
├── 2. 订阅 SSE 流 (subscribeToSession)
└── 3. 更新聊天界面
```

**ChatPage 实现**：

```tsx
// pages/ChatPage.tsx
import { useEffect } from 'react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { apiFetch } from '../lib/api';

export default function ChatPage() {
  const { workspaceId, sessionId } = useWorkspace();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  // 监听 sessionId 变化，自动加载会话
  useEffect(() => {
    if (!sessionId) return;
    
    let unsubscribe: (() => void) | null = null;
    
    async function loadSession() {
      setLoading(true);
      try {
        // 1. 加载会话历史
        const history = await apiFetch<Message[]>(`/sessions/${sessionId}/messages`);
        setMessages(history);
        
        // 2. 订阅 SSE 流
        unsubscribe = subscribeToSession(sessionId, (event) => {
          setMessages(prev => [...prev, event]);
        });
      } finally {
        setLoading(false);
      }
    }
    
    loadSession();
    
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [sessionId]);

  const sendMessage = async (text: string) => {
    if (!sessionId) return;
    
    await apiFetch(`/sessions/${sessionId}/message`, {
      method: 'POST',
      body: JSON.stringify({ text, workspaceId }),
    });
  };

  return (
    <div className="chat-page">
      {messages.map(msg => (
        <div key={msg.id} className="msg-row">
          <div className="msg-bubble">{msg.content}</div>
        </div>
      ))}
      <Composer onSend={sendMessage} />
    </div>
  );
}
```

#### 2.3.3 本地存储封装

```ts
// lib/storage.ts
export const storage = {
  getExpandedWorkspaces: (): string[] => {
    try {
      const data = localStorage.getItem('ui-expanded-workspaces');
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  },
  
  setExpandedWorkspaces: (ids: string[]) => {
    localStorage.setItem('ui-expanded-workspaces', JSON.stringify(ids));
  },
  
  getLastWorkspace: (): string => {
    return localStorage.getItem('last-workspace') || 'default';
  },
  
  setLastWorkspace: (id: string) => {
    localStorage.setItem('last-workspace', id);
  },
  
  getModelPreference: (): string => {
    return localStorage.getItem('model-preference') || 'step-3.7-flash';
  },
  
  setModelPreference: (model: string) => {
    localStorage.setItem('model-preference', model);
  },
};
```

**使用示例**：

```tsx
// Sidebar.tsx
const [expandedWs, setExpandedWs] = useState<string[]>(() => storage.getExpandedWorkspaces());

useEffect(() => {
  storage.setExpandedWorkspaces(expandedWs);
}, [expandedWs]);
```

#### 2.3.4 响应式策略

```css
/* ========================================
   Responsive Breakpoints
   ======================================== */

/* 大屏幕：三栏完整显示 */
@media (min-width: 1400px) {
  .sidebar { width: 280px; }
  .settings-drawer { width: 260px; }
}

/* 中等屏幕：设置面板改为右侧抽屉 */
@media (max-width: 1399px) and (min-width: 768px) {
  .sidebar { width: 240px; }
  .settings-drawer { width: 600px; }
}

/* 小屏幕：侧边栏折叠为浮动菜单 */
@media (max-width: 767px) {
  .app { flex-direction: column; }
  
  .sidebar {
    position: fixed;
    left: -280px;
    top: 0;
    bottom: 0;
    z-index: 999;
    transition: left 0.2s ease;
  }
  
  .sidebar.open { left: 0; }
  
  .hamburger {
    display: flex !important;
    position: fixed;
    top: 12px;
    left: 12px;
    z-index: 998;
  }
}
```

**新增组件**：

```tsx
// components/HamburgerButton.tsx
export default function HamburgerButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="hamburger" onClick={onClick} aria-label="打开菜单">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    </button>
  );
}
```

```css
.hamburger {
  display: none;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
  color: var(--text-primary);
  cursor: pointer;
}
```

#### 2.3.5 快捷键设计

```ts
// hooks/useKeyboardShortcuts.ts
import { useEffect } from 'react';

export function useKeyboardShortcuts(shortcuts: Record<string, () => void>) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // 忽略在输入框内的按键
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      const key = `${e.ctrlKey ? 'Ctrl+' : ''}${e.metaKey ? 'Cmd+' : ''}${e.key}`;
      const handler = shortcuts[key];
      if (handler) {
        e.preventDefault();
        handler();
      }
    }
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}
```

**使用示例**：

```tsx
// App.tsx
function AppContent() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  useKeyboardShortcuts({
    'Ctrl+B': () => setSidebarOpen(prev => !prev),
    'Ctrl+,': () => setSettingsOpen(true),
    'Escape': () => {
      setSettingsOpen(false);
      setSidebarOpen(false);
    },
  });
  
  // ...
}
```

**快捷键清单**：

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+B` | 切换侧边栏 |
| `Ctrl+,` | 打开设置 |
| `Ctrl+K` | 快速搜索工作区/会话 |
| `Esc` | 关闭设置/弹窗 |
| `Ctrl+Enter` | 发送消息 |

#### 2.3.6 错误处理分级策略

**现状**：文档有 ErrorBoundary 组件，但未说明分级错误处理策略。不同错误需要不同展示方式（网络错误用 Toast，权限错误用重定向），统一的错误处理策略能让用户体验更一致。

**设计方案**：

```ts
// lib/error-handler.ts (新建)
export const ErrorLevel = {
  SILENT: 'silent',     // 静默记录，用户无感知
  TOAST: 'toast',       // 弹出轻提示
  BANNER: 'banner',     // 显示错误横幅
  REDIRECT: 'redirect', // 重定向到错误页
} as const;

export type ErrorLevel = typeof ErrorLevel[keyof typeof ErrorLevel];

export interface AppError {
  message: string;
  level: ErrorLevel;
  cause?: unknown;
}

export function handleApiError(error: unknown, fallback?: string): AppError {
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return {
      message: '网络连接失败，请检查网络设置',
      level: ErrorLevel.BANNER,
      cause: error,
    };
  }
  
  if (error instanceof Error && error.message.includes('timeout')) {
    return {
      message: '请求超时，请稍后重试',
      level: ErrorLevel.TOAST,
      cause: error,
    };
  }
  
  if (error instanceof Error && error.message.includes('401')) {
    return {
      message: '登录已过期，请重新登录',
      level: ErrorLevel.REDIRECT,
      cause: error,
    };
  }
  
  return {
    message: fallback || '发生未知错误',
    level: ErrorLevel.BANNER,
    cause: error,
  };
}
```

**使用示例**：

```tsx
// hooks/useErrorHandler.ts
import { useState } from 'react';
import { handleApiError, ErrorLevel } from '../lib/error-handler';

export function useErrorHandler() {
  const [error, setError] = useState<AppError | null>(null);
  
  const handleError = (e: unknown, fallback?: string) => {
    const appError = handleApiError(e, fallback);
    setError(appError);
    
    if (appError.level === ErrorLevel.REDIRECT) {
      // 跳转到登录页
      window.location.href = '/login';
    }
  };
  
  const clearError = () => setError(null);
  
  return { error, handleError, clearError };
}
```

**错误分级展示**：

| 错误级别 | 展示方式 | 适用场景 |
|----------|----------|----------|
| `silent` | 仅记录到日志 | 非关键错误，用户无需感知 |
| `toast` | 轻提示（右下角） | 操作失败、网络超时 |
| `banner` | 错误横幅（页面顶部） | 系统级错误、加载失败 |
| `redirect` | 跳转到错误页/登录页 | 权限错误、会话过期 |

**验收标准**：
- [ ] 网络错误显示 banner，包含重试按钮
- [ ] 超时错误显示 toast，3 秒后自动消失
- [ ] 401 错误自动跳转到登录页
- [ ] 错误日志包含 requestId，便于排查

---

## 3. 实施计划（v2.0 更新）

### 3.1 工时估算

| 步骤 | 任务 | 工时 | 依赖 |
|------|------|------|------|
| 2.1.1 | 扩展 CSS 变量 | 2h | 无 |
| 2.1.2 | 引入 React Router v6 | 3h | 无 |
| 2.1.3 | WorkspaceContext 状态管理 | 2h | 无 |
| 2.2.1 | Sidebar 组件升级 | 6h | 2.1 |
| 2.2.2 | SettingsDrawer 组件 | 6h | 2.1 |
| 2.3.1 | 扩展 API 客户端 | 4h | 无 |
| 2.3.1.0 | 确认后端 API 路径格式，配置 VITE_API_PREFIX | 0.5h | 无 |
| 2.3.2 | ChatPage-Sidebar 联动 | 4h | 2.2.1 |
| 2.3.3 | 本地存储封装 | 2h | 无 |
| 2.3.4 | 响应式策略 + 快捷键 | 3h | 2.1 |
| 2.3.5 | SSE 连接管理与断线重连 | 4h | 2.3.2 |
| 2.3.6 | 错误处理分级策略 | 2h | 无 |
| **总计** | | **38.5h** | |

### 3.2 实施顺序

```
第 1 天（8h）
├── 上午：2.1.1 扩展 CSS 变量 + 2.1.2 React Router 迁移
│   └── 2.1.2 包含：确认后端 API 路径格式，配置 VITE_API_PREFIX
└── 下午：2.1.3 WorkspaceContext + 2.2.1 Sidebar 基础结构

第 2 天（8h）
├── 上午：2.2.1 Sidebar workspace/session 逻辑
└── 下午：2.2.2 SettingsDrawer 组件

第 3 天（8h）
├── 上午：2.3.1 扩展 API 客户端 + 2.3.2 ChatPage 联动
└── 下午：2.3.3 本地存储 + 2.3.4 响应式 + 快捷键

第 4 天（8h）
├── 上午：2.3.5 SSE 连接管理 + 2.3.6 错误处理分级
└── 下午：测试 + 边界情况处理

第 5 天（6h）
└── 文档更新 + 代码审查
```

### 3.3 验收标准

**视觉层面**：
- [ ] 三栏布局稳定，侧边栏 280px，设置面板 260px
- [ ] 暗色主题下对比度符合 WCAG AA 标准
- [ ] 响应式：≥1400px 完整三栏，768-1399px 设置面板变抽屉，<768px 侧边栏浮动

**路由层面**：
- [ ] URL 支持 `/workspace/:workspaceId/session/:sessionId`
- [ ] 刷新页面后状态保持不变
- [ ] 浏览器前进/后退正常工作
- [ ] 可分享会话链接
- [ ] API 路径通过 `VITE_API_PREFIX` 环境变量配置，支持 `/api` 或 `/api/v1`

**功能层面**：
- [ ] 工作区列表从 `/api/workspaces` 加载
- [ ] 点击工作区展开/折叠会话列表
- [ ] 点击会话切换到 ChatPage 并加载对应会话
- [ ] 设置面板可打开/关闭，tab 切换正常
- [ ] 模型路由配置可读取/保存
- [ ] 用户展开/折叠工作区的状态持久化

**交互层面**：
- [ ] 快捷键 `Ctrl+B` 切换侧边栏
- [ ] 快捷键 `Ctrl+,` 打开设置
- [ ] 快捷键 `Esc` 关闭弹窗
- [ ] 骨架屏在数据加载时显示
- [ ] SSE 断线自动重连，重连后消息不丢失
- [ ] 网络错误显示 banner，超时显示 toast，401 自动跳转

**性能层面**：
- [ ] Sidebar 加载时间 < 200ms
- [ ] 设置面板打开动画 60fps
- [ ] 无布局抖动（CLS < 0.1）

---

## 4. 与路线图的对接

### 4.1 当前优化支持的路由图模块

| 路线图模块 | 前端支撑 |
|------------|----------|
| 3.1 数据飞轮 | Sidebar 集成反馈入口 |
| 3.2 模型路由 | SettingsDrawer 模型路由配置页 |
| 4.1 会话轨迹 | Sidebar 会话列表 + 时间线组件 |
| 4.2 技能封装 | Sidebar 技能入口 + 技能选择器 |
| 4.3 任务计划 | SettingsDrawer 任务计划 tab |
| 4.4 Agent 记忆 | SettingsDrawer 记忆管理 tab |
| 4.5 Feature Flags | SettingsDrawer 灰度发布 tab |

### 4.2 后续扩展点

| 扩展点 | 说明 | 触发条件 |
|--------|------|----------|
| 右侧面板固定化 | 当前是 drawer，可改为固定 260px 面板 | 用户频繁打开设置 |
| 多 workspace 并行 | 支持同时打开多个 workspace 标签 | 4.2 技能封装需要 |
| 拖拽排序 | 会话列表支持拖拽排序 | 用户反馈 |
| 全局搜索 | `Ctrl+K` 打开命令面板 | 高级用户需求 |
| 主题切换 | 暗色/浅色主题一键切换 | 用户偏好 |
| 国际化 | 支持多语言界面 | 出海需求 |
| 迁移到 Zustand | 替代 Context 管理全局状态 | Context 导致不必要的重渲染，或状态逻辑超过 5 个文件 |

---

## 5. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 三栏布局导致主区域过窄 | 小屏幕体验差 | 响应式断点，移动端折叠侧边栏 |
| SettingsDrawer 与现有 SettingsPage 重复 | 功能重叠 | Drawer 放高频配置，SettingsPage 放详细配置 |
| API 接口尚未实现 | 前端无法联调 | 先用 Mock 数据，接口就绪后切换 |
| React Router 迁移成本 | 历史链接失效 | 保留旧路由兼容，逐步迁移 |
| 状态管理复杂化 | 代码维护困难 | 保持简单，先用 Context；当状态频繁变化导致重渲染问题时，迁移到 Zustand（约 30 分钟） |
| 快捷键冲突 | 浏览器/系统快捷键冲突 | 使用 `e.preventDefault()`，提供自定义快捷键入口 |

### 5.1 状态管理升级路径（Context → Zustand）

**什么时候应该升级？**

Context 在状态频繁变化时会导致大量组件重渲染。如果后续 `workspaceId`、`sessionId`、`sidebarOpen`、`theme` 等状态组合变化频繁，建议迁移到 Zustand。

**升级触发条件**：
- Context 导致不必要的重渲染（可通过 React DevTools 确认）
- 状态逻辑分散超过 5 个文件
- 需要派生状态（selectors）或中间件（persist、devtools）

**Zustand 快速示例**：

```ts
// store/workspaceStore.ts
import { create } from 'zustand';

interface WorkspaceStore {
  workspaceId: string;
  sessionId: string | null;
  sidebarOpen: boolean;
  setWorkspaceId: (id: string) => void;
  setSessionId: (id: string | null) => void;
  toggleSidebar: () => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  workspaceId: localStorage.getItem('last-workspace') || 'default',
  sessionId: null,
  sidebarOpen: false,
  setWorkspaceId: (id) => {
    localStorage.setItem('last-workspace', id);
    set({ workspaceId: id });
  },
  setSessionId: (id) => set({ sessionId: id }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}));
```

**使用方式**：

```tsx
// 在任何组件中
const { workspaceId, setWorkspaceId } = useWorkspaceStore();
```

**迁移成本**：约 30 分钟（API 类似 useState，自动避免不必要的重渲染）

---

## 6. 附录

### 6.1 图标方案

当前使用 emoji，建议迁移到 `lucide-react`（已存在于 package.json）：

```tsx
import { 
  Folder, 
  ChevronRight, 
  Plus, 
  MessageSquare, 
  Settings, 
  X,
  Search,
  Bell,
  User
} from 'lucide-react';
```

### 6.2 文件修改清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `apps/web/src/index.css` | 修改 | 扩展 design tokens + 响应式 + 骨架屏 |
| `apps/web/src/App.tsx` | 修改 | React Router + WorkspaceProvider + 三栏布局 |
| `apps/web/src/components/Sidebar.tsx` | 修改 | 升级为 workspace/session 管理 |
| `apps/web/src/components/SettingsDrawer.tsx` | 新建 | 右侧设置面板 |
| `apps/web/src/contexts/WorkspaceContext.tsx` | 新建 | 全局状态管理 |
| `apps/web/src/hooks/useKeyboardShortcuts.ts` | 新建 | 快捷键管理 |
| `apps/web/src/lib/storage.ts` | 新建 | 本地存储封装 |
| `apps/web/src/lib/api.ts` | 修改 | 扩展 API 方法 |
| `apps/web/src/lib/types.ts` | 新建 | 类型定义 |
| `apps/web/src/pages/ChatPage.tsx` | 修改 | 监听 sessionId + SSE 订阅 |

### 6.3 新增依赖

```json
{
  "dependencies": {
    "react-router-dom": "^6.20.0"
  }
}
```

---

*文档生成时间：2026-08-24*
*版本：v2.2（Sidebar 改用 React Router 驱动、SettingsDrawer 增加完整设置入口、SSE 去重、API 前缀环境变量、URL-Context 同步）*
