import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Folder, Settings, ChevronRight, MessageSquare, Activity, ArrowUp, Monitor, FileText } from 'lucide-react';
import { apiFetch, createSession } from '../lib/api';
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

interface ApiWorkspace {
  workspaceId: string;
  path: string;
  title: string;
  sessionIds: string[];
  createdAt: string;
  updatedAt: string;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return date.toLocaleDateString('zh-CN');
}

export default function Sidebar({ collapsed, isOpen, onClose }: { collapsed?: boolean; isOpen?: boolean; onClose?: () => void } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { workspaceId, setWorkspaceId, sessionId, setSessionId, isConnected, isConnecting, connectionError, setIsConnected, setIsConnecting, setConnectionError } = useWorkspace();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [expandedWs, setExpandedWs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewWorkspaceModal, setShowNewWorkspaceModal] = useState(false);
  const [newWorkspacePath, setNewWorkspacePath] = useState('');
  const [newWorkspaceTitle, setNewWorkspaceTitle] = useState('');
  const [renamingWorkspaceId, setRenamingWorkspaceId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showDirPicker, setShowDirPicker] = useState(false);
  const [dirPickerPath, setDirPickerPath] = useState<string>('');
  const [dirPickerEntries, setDirPickerEntries] = useState<Array<{ name: string; path: string; isDirectory: boolean }>>([]);

  // ...
  const [sessionsMap, setSessionsMap] = useState<Record<string, Session[]>>({});

  // 判断当前页面
  const currentPath = location.pathname;
  const _isChatPage = currentPath === '/' || currentPath.startsWith('/workspace');

  // 加载 workspace 列表——仅在挂载时请求一次，切换工作区不应重复请求
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // /api/workspaces 返回 { items: [...], archivedSessionIds: [...] }
    apiFetch<{ items?: ApiWorkspace[] }>('/workspaces')
      .then(data => {
        if (!cancelled) {
          const mapped = (data.items || []).map(ws => ({
            id: ws.workspaceId,
            name: ws.title || ws.workspaceId,
            sessions: [],
          }));
          setWorkspaces(mapped);
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  // 默认展开当前 workspace（workspaces 加载完成后或 workspaceId 变化时）
  useEffect(() => {
    if (workspaceId && !expandedWs.includes(workspaceId)) {
      setExpandedWs(prev => [...prev, workspaceId]);
    }
  }, [workspaceId]);

  // 加载工作区的会话列表
  useEffect(() => {
    let cancelled = false;
    const loadSessions = async (wsId: string) => {
      try {
        const data = await apiFetch<{ sessions: Array<{ id: string; title: string; updatedAt: string }> }>(`/sessions?workspaceId=${encodeURIComponent(wsId)}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        const sessions: Session[] = (data.sessions || []).map((s: any) => ({
          id: s.id,
          title: s.title || '新对话',
          updatedAt: new Date(s.updatedAt || Date.now()).toISOString(),
        }));
        if (!cancelled) {
          setSessionsMap(prev => ({ ...prev, [wsId]: sessions }));
        }
      } catch (e) {
        console.error('Failed to fetch sessions for workspace:', wsId, e);
      }
    };

    expandedWs.forEach(wsId => {
      if (!sessionsMap[wsId]) {
        loadSessions(wsId);
      }
    });

    return () => { cancelled = true; };
  }, [expandedWs]);

  // 健康检查：独立于 SSE 会话连接，定期检测服务器是否可达
  useEffect(() => {
    let cancelled = false;
    const checkHealth = async () => {
      try {
        const res = await fetch('/health');
        if (cancelled) return;
        if (res.ok) {
          setIsConnected(true);
          setConnectionError(null);
        } else {
          setIsConnected(false);
        }
      } catch {
        if (!cancelled) setIsConnected(false);
      }
    };
    checkHealth();
    const timer = setInterval(checkHealth, 10000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [setIsConnected, setConnectionError]);

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

  const handleNewSession = async (id: string) => {
    try {
      const session = await createSession(id, 'default');
      setSessionId(session.id);
      navigate(`/workspace/${id}/session/${session.id}`);
    } catch (e) {
      console.error('Failed to create session:', e);
    }
  };

  const handleSelectSession = (id: string) => {
    setSessionId(id);
    // 路由会自动更新，ChatPage 通过监听 sessionId 变化响应
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定要删除此会话吗？')) return;
    try {
      await apiFetch<void>(`/sessions/${sessionId}`, { method: 'DELETE' });
      setSessionsMap(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(wsId => {
          next[wsId] = next[wsId].filter(s => s.id !== sessionId);
        });
        return next;
      });
    } catch (e) {
      console.error('Failed to delete session:', e);
    }
  };

  const handleCreateWorkspace = async () => {
    if (!newWorkspacePath.trim()) return;
    try {
      const data = await apiFetch<{ workspace: ApiWorkspace }>('/workspaces', {
        method: 'POST',
        body: JSON.stringify({ path: newWorkspacePath.trim(), title: newWorkspaceTitle.trim() || undefined })
      });
      if (data.workspace) {
        setWorkspaceId(data.workspace.workspaceId);
        navigate(`/workspace/${data.workspace.workspaceId}`);
      }
      setShowNewWorkspaceModal(false);
      setNewWorkspacePath('');
      setNewWorkspaceTitle('');
    } catch (e) {
      console.error('Failed to create workspace:', e);
    }
  };

  const handleDeleteWorkspace = async (targetId: string) => {
    if (!confirm('确定要删除此工作区吗？')) return;
    try {
      await apiFetch<void>(`/workspaces/${targetId}`, { method: 'DELETE' });
      if (targetId === workspaceId) {
        setWorkspaceId('default');
        navigate('/');
      }
      setWorkspaces(prev => prev.filter(ws => ws.id !== targetId));
    } catch (e) {
      console.error('Failed to delete workspace:', e);
    }
  };

  const handleStartRename = (ws: Workspace, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingWorkspaceId(ws.id);
    setRenameValue(ws.name);
  };

  const handleCommitRename = async () => {
    if (!renamingWorkspaceId || !renameValue.trim()) return;
    try {
      await apiFetch<void>(`/workspaces/${renamingWorkspaceId}/rename`, {
        method: 'POST',
        body: JSON.stringify({ title: renameValue.trim() }),
      });
      setWorkspaces(prev => prev.map(ws => ws.id === renamingWorkspaceId ? { ...ws, name: renameValue.trim() } : ws));
    } catch (e) {
      console.error('Failed to rename workspace:', e);
    } finally {
      setRenamingWorkspaceId(null);
      setRenameValue('');
    }
  };

  // 目录选择器
  const handleBrowseDirectory = () => {
    setShowDirPicker(true);
    setDirPickerPath(newWorkspacePath || '/');
  };

  const loadDirEntries = async (path: string) => {
    try {
      const data = await apiFetch<{ path: string; files: Array<{ name: string; path: string; isDirectory: boolean }> }>(`/directory-picker/list?path=${encodeURIComponent(path)}`);
      setDirPickerEntries(data.files || []);
      setDirPickerPath(data.path || path);
    } catch (e) {
      console.error('Failed to load directory:', e);
    }
  };

  useEffect(() => {
    if (showDirPicker) {
      loadDirEntries(dirPickerPath || '/');
    }
  }, [showDirPicker]);

  const enterDir = (entry: { name: string; path: string }) => {
    // 在"我的电脑"视图（根目录）下，直接使用完整路径（如 C:\）
    if (dirPickerPath === '/') {
      loadDirEntries(entry.path);
      return;
    }
    const newPath = dirPickerPath ? dirPickerPath.replace(/[\\/]$/, '') + '\\' + entry.name : entry.name;
    loadDirEntries(newPath);
  };

  const goUpDir = () => {
    if (!dirPickerPath || dirPickerPath === '/') return;
    if (/^[A-Za-z]:\\$/.test(dirPickerPath)) {
      loadDirEntries('/');
      return;
    }
    const normalized = dirPickerPath.replace(/[\\/]$/, '');
    const lastSep = Math.max(normalized.lastIndexOf('\\'), normalized.lastIndexOf('/'));
    const parentPath = lastSep <= 0 ? '/' : normalized.slice(0, lastSep + 1);
    loadDirEntries(parentPath);
  };

  const goToComputer = () => {
    loadDirEntries('/');
  };

  const selectCurrentDir = () => {
    const finalPath = dirPickerPath.replace(/[\\/]$/, '');
    setNewWorkspacePath(finalPath);
    const name = finalPath.split(/[\\/]/).filter(Boolean).pop() || 'project';
    if (!newWorkspaceTitle) {
      setNewWorkspaceTitle(name);
    }
    setShowDirPicker(false);
  };

  return (
    <>
      {isOpen && (
        <div
          className="sidebar-overlay"
          onClick={onClose}
        />
      )}
      <aside className={`dsh-sidebar ${collapsed ? 'collapsed' : ''} ${isOpen ? 'open' : ''}`}>
      {/* 品牌 */}
      <div className="sidebar-brand-row">
        <button className="brand-logo" onClick={() => navigate('/')} title="Pi Agent">
          π
        </button>
        {!collapsed && (
          <>
            <span className="brand-name">Pi-mato</span>
            <span className="brand-badge">v2</span>
          </>
        )}
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
                    <Folder size={16} />
                    {renamingWorkspaceId === ws.id ? (
                      <input
                        className="input"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={handleCommitRename}
                        onKeyDown={e => { if (e.key === 'Enter') handleCommitRename(); if (e.key === 'Escape') { setRenamingWorkspaceId(null); setRenameValue(''); } }}
                        onClick={e => e.stopPropagation()}
                        autoFocus
                        style={{ padding: '4px 8px', fontSize: 13, flex: 1 }}
                      />
                    ) : (
                      <span className="workspace-name">{ws.name}</span>
                    )}
                    <span className="workspace-chevron">
                      <ChevronRight size={14} />
                    </span>
                    <button
                      className="new-session-btn"
                      onClick={(e) => { e.stopPropagation(); handleNewSession(ws.id); }}
                      title="新会话"
                    >
                      +
                    </button>
                    {renamingWorkspaceId !== ws.id && (
                      <button
                        className="row-icon-btn"
                        onClick={(e) => { e.stopPropagation(); handleStartRename(ws, e); }}
                        title="重命名"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 4 21l.5-3.5L17 3z" />
                        </svg>
                      </button>
                    )}
                    <button
                      className="row-icon-btn"
                      onClick={(e) => { e.stopPropagation(); handleDeleteWorkspace(ws.id); }}
                      title="删除工作区"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>

                  {expandedWs.includes(ws.id) && (
                    <div className="session-list">
                      {(sessionsMap[ws.id] || []).map(session => (
                        <div
                          key={session.id}
                          className={`session-row ${sessionId === session.id ? 'active' : ''}`}
                          onClick={() => handleSelectSession(session.id)}
                        >
                          <MessageSquare size={14} />
                          <span className="session-row-title">{session.title}</span>
                          <button
                            className="row-icon-btn"
                            onClick={(e) => handleDeleteSession(session.id, e)}
                            title="删除会话"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                          <span className="session-row-time">
                            {formatRelativeTime(session.updatedAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div className="workspace-row" onClick={() => setShowNewWorkspaceModal(true)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <span>新建工作区</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 底部：连接状态 + 设置入口 */}
      <div className="sidebar-footer">
        <div className="connection-status" title={connectionError || (isConnected ? '已连接' : '连接中...')}>
          <span className={`status-dot ${isConnected ? 'connected' : isConnecting ? 'connecting' : 'disconnected'}`} />
          {!collapsed && (
            <span className="status-text">
              {isConnecting ? '连接中...' : isConnected ? '已连接' : '未连接'}
            </span>
          )}
        </div>
        <button className="settings-trigger" onClick={() => navigate('/settings')}>
          <Settings size={18} />
          {!collapsed && <span>设置</span>}
        </button>
        <button className="settings-trigger" onClick={() => navigate('/monitoring')}>
          <Activity size={18} />
          {!collapsed && <span>监控</span>}
        </button>
      </div>

      {/* 新建工作区 Modal */}
      {showNewWorkspaceModal && (
        <div className="modal-overlay" onClick={() => setShowNewWorkspaceModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">新建工作区</h3>
            <div className="modal-body">
              <div className="form-item">
                <label className="form-label">工作区名称</label>
                <input
                  className="input"
                  value={newWorkspaceTitle}
                  onChange={e => setNewWorkspaceTitle(e.target.value)}
                  placeholder="my-project"
                />
              </div>
              <div className="form-item">
                <label className="form-label">本地目录路径</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    className="input"
                    style={{ flex: 1 }}
                    value={newWorkspacePath}
                    onChange={e => setNewWorkspacePath(e.target.value)}
                    placeholder="C:\\Users\\...\\my-project"
                  />
                  <button className="btn btn-secondary" onClick={handleBrowseDirectory} type="button">
                    浏览…
                  </button>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowNewWorkspaceModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleCreateWorkspace} disabled={!newWorkspacePath.trim()}>创建</button>
            </div>
          </div>
        </div>
      )}

      {/* 目录选择器 Modal */}
      {showDirPicker && (
        <div className="modal-overlay" onClick={() => setShowDirPicker(false)}>
          <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">{dirPickerPath === '/' ? '此电脑' : '选择目录'}</h3>
            <div className="modal-body" style={{ padding: 0 }}>
              <div style={{ padding: 12, borderBottom: '1px solid #e5e7eb', display: 'flex', gap: 8, alignItems: 'center' }}>
                {dirPickerPath === '/' ? (
                  <span style={{ fontSize: 12, color: '#6b7280' }}>选择磁盘驱动器</span>
                ) : (
                  <>
                    <button className="btn btn-secondary" onClick={goUpDir} type="button">
                      <ArrowUp size={16} style={{ marginRight: 6 }} />上级
                    </button>
                    <button className="btn btn-secondary" onClick={goToComputer} type="button">
                      此电脑
                    </button>
                  </>
                )}
                <input
                  className="input"
                  value={dirPickerPath}
                  onChange={e => setDirPickerPath(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') loadDirEntries(dirPickerPath); }}
                  placeholder="输入路径或浏览选择..."
                  style={{ flex: 1, fontFamily: 'monospace' }}
                />
              </div>
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {dirPickerEntries.length === 0 && (
                  <div style={{ padding: 20, textAlign: 'center', color: '#6b7280' }}>此目录为空</div>
                )}
                {dirPickerEntries.map(entry => (
                  <div
                    key={entry.path}
                    style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                    onClick={() => entry.isDirectory ? enterDir(entry) : undefined}
                  >
                    <span style={{ fontSize: 16 }}>{entry.isDirectory ? <Monitor size={16} /> : <FileText size={16} />}</span>
                    <span style={{ flex: 1 }}>{entry.name}</span>
                    {entry.isDirectory && <span style={{ fontSize: 12, color: '#9ca3af' }}>打开</span>}
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowDirPicker(false)}>取消</button>
              <button className="btn btn-primary" onClick={selectCurrentDir} disabled={!dirPickerPath}>选择此目录</button>
            </div>
          </div>
        </div>
      )}
    </aside>
    </>
  );
}

