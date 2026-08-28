import { authedFetch, apiFetch } from '../lib/api';
import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { ArrowDown, X, ArrowUp, Monitor, FileText, Folder, ChevronRight, FileCode, Search, BookOpen, FlaskConical, Menu, ThumbsUp, ThumbsDown, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import ErrorBanner from '../components/ErrorBanner';
import MarkdownRenderer from '../components/MarkdownRenderer';
import { getFriendlyMessage, AppError } from '../lib/errors';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { API_PREFIX, submitFeedback, submitCodeFeedback } from '../lib/api';
import { useChatStream } from '../hooks/useChatStream';
import { useSSE } from '../hooks/useSSE';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  timestamp?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  contentBlocks?: Array<{ type: string; text?: string; thinking?: string; name?: string; arguments?: any }>;
  artifacts?: Array<{ path: string; type: string; size?: number }>;
}

interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  model?: string;
  workspaceId?: string;
}

interface Workspace {
  id: string;
  path: string;
  title: string;
  sessionIds: string[];
  createdAt: string;
  updatedAt: string;
}

type WorkMode = 'standard' | 'ptc';

interface MessageItemProps {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  timestamp?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  contentBlocks?: Array<{ type: string; text?: string; thinking?: string; name?: string; arguments?: any }>;
  messageId?: string;
  sessionId?: string;
  onQuickFeedback?: (messageId: string, rating: number) => void;
  onCodeFeedback?: (messageId: string, rating: string) => void;
}

const MessageItem = memo(function MessageItem({ role, content, streaming, timestamp, contentBlocks, messageId, onQuickFeedback, onCodeFeedback }: MessageItemProps) {
  const [rated, setRated] = useState<string | null>(null);
  const [codeRated, setCodeRated] = useState<string | null>(null);
  const hasCode = typeof content === 'string' && content.includes('```');

  const handleQuick = (rating: number) => {
    if (!messageId || rated) return;
    setRated(rating > 0 ? 'up' : 'down');
    onQuickFeedback?.(messageId, rating);
  };

  const handleCode = (rating: string) => {
    if (!messageId || codeRated) return;
    setCodeRated(rating);
    onCodeFeedback?.(messageId, rating);
  };

  return (
    <>
      <div className={`msg-row ${role}`}>
        <div className="msg-avatar">{role === 'user' ? 'U' : 'AI'}</div>
        <div className="msg-content">
          <div className={`msg-bubble ${role}`}>
            {role === 'assistant' && contentBlocks && contentBlocks.length > 0 ? (
              <div className="msg-blocks">
                {(() => {
                  const thinkingBlocks = contentBlocks.filter(b => b.type === 'thinking' && b.thinking);
                  const toolBlocks = contentBlocks.filter(b => b.type === 'toolCall');
                  const textBlocks = contentBlocks.filter(b => b.type === 'text' && b.text);
                  const hasWorking = thinkingBlocks.length > 0 || toolBlocks.length > 0;
                  return (
                    <>
                      {/* 最终文本答案 — 视觉主体 */}
                      {textBlocks.map((block, idx) => (
                        <div key={`txt-${idx}`} className="msg-block msg-block-text">
                          <MarkdownRenderer content={block.text!} />
                        </div>
                      ))}
                      {/* 思考 + 工具调用 — 紧凑折叠，不抢视觉 */}
                      {hasWorking && (
                        <details className="msg-block msg-block-working" open={streaming}>
                          <summary className="msg-block-working-summary">
                            <span className="msg-block-working-icon">⚙️</span>
                            <span className="msg-block-working-label">
                              {thinkingBlocks.length > 0 && `思考 ${thinkingBlocks.length}`}
                              {thinkingBlocks.length > 0 && toolBlocks.length > 0 && ' · '}
                              {toolBlocks.length > 0 && `工具 ${toolBlocks.length}`}
                            </span>
                          </summary>
                          <div className="msg-block-working-content">
                            {thinkingBlocks.map((block, idx) => (
                              <details key={`t-${idx}`} className="msg-block msg-block-thinking" open={streaming}>
                                <summary className="msg-block-thinking-summary">
                                  <span className="msg-block-thinking-icon">💭</span>
                                  <span>思考</span>
                                </summary>
                                <div className="msg-block-thinking-content">
                                  <MarkdownRenderer content={block.thinking!} />
                                </div>
                              </details>
                            ))}
                            {toolBlocks.map((block, idx) => (
                              <details key={`tc-${idx}`} className="msg-block msg-block-tool" open={false}>
                                <summary className="msg-block-tool-summary">
                                  <span className="msg-block-tool-icon">🔧</span>
                                  <code className="msg-block-tool-name">{block.name}</code>
                                </summary>
                                <div className="msg-block-tool-content">
                                  <pre>{JSON.stringify(block.arguments || {}, null, 2)}</pre>
                                </div>
                              </details>
                            ))}
                          </div>
                        </details>
                      )}
                    </>
                  );
                })()}
              </div>
            ) : role === 'assistant' ? (
              streaming ? (
                <span className="streaming-text">{content}</span>
              ) : (
                <MarkdownRenderer content={content} />
              )
            ) : (
              content
            )}
            {streaming && <span className="cursor" aria-hidden="true" />}
          </div>
          {role === 'assistant' && !streaming && messageId && (
            <div className="msg-feedback">
              <div className="quick-feedback">
                <button
                  className={`feedback-btn ${rated === 'up' ? 'active' : ''}`}
                  onClick={() => handleQuick(1)}
                  disabled={!!rated}
                  title="有帮助"
                >
                  <ThumbsUp size={14} />
                </button>
                <button
                  className={`feedback-btn ${rated === 'down' ? 'active' : ''}`}
                  onClick={() => handleQuick(-1)}
                  disabled={!!rated}
                  title="需要改进"
                >
                  <ThumbsDown size={14} />
                </button>
              </div>
              {hasCode && (
                <div className="code-feedback">
                  <span className="code-feedback-label">这段代码：</span>
                  <button
                    className={`feedback-chip ${codeRated === 'runnable' ? 'active' : ''}`}
                    onClick={() => handleCode('runnable')}
                    disabled={!!codeRated}
                  >
                    <CheckCircle size={12} /> 可运行
                  </button>
                  <button
                    className={`feedback-chip ${codeRated === 'needs_fix' ? 'active' : ''}`}
                    onClick={() => handleCode('needs_fix')}
                    disabled={!!codeRated}
                  >
                    <AlertCircle size={12} /> 需修改
                  </button>
                  <button
                    className={`feedback-chip ${codeRated === 'wrong' ? 'active' : ''}`}
                    onClick={() => handleCode('wrong')}
                    disabled={!!codeRated}
                  >
                    <XCircle size={12} /> 完全错误
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
});

export default function ChatPage({ onToggleSidebar }: { onToggleSidebar?: () => void } = {}) {
  const { workspaceId: contextWorkspaceId, setWorkspaceId, sessionId: contextSessionId, setSessionId, setIsConnected, setIsConnecting, setConnectionError } = useWorkspace();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const getInitialLastModel = (): string => {
    try {
      const stored = localStorage.getItem('lastModel');
      if (stored) return stored;
    } catch {
      // ignore
    }
    return '';
  };

  const [model, setModel] = useState<string>(getInitialLastModel);
  const [workspaceId, setWorkspaceIdLocal] = useState<string | null>(contextWorkspaceId || null);
  const [mode, setMode] = useState<WorkMode>('standard');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionIdLocal] = useState<string | null>(contextSessionId || null);
  const [_sessions, setSessions] = useState<Session[]>([]);
  const [_presets, setPresets] = useState<Array<{ id: string; name: string; mode: string; tools: string[] }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<Error | null>(null);
  const [_sidebarCollapsed, _setSidebarCollapsed] = useState(false);
  const [_workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [_archivedSessionIds, setArchivedSessionIds] = useState<string[]>([]);
  const [showNewWorkspaceModal, setShowNewWorkspaceModal] = useState(false);
  const [newWorkspacePath, setNewWorkspacePath] = useState('');
  const [newWorkspaceTitle, setNewWorkspaceTitle] = useState('');
  const [selectedDirHint, setSelectedDirHint] = useState<string>('');
  const [showDirPicker, setShowDirPicker] = useState(false);
  const [dirPickerPath, setDirPickerPath] = useState<string>('');
  const [dirPickerEntries, setDirPickerEntries] = useState<Array<{ name: string; path: string; isDirectory: boolean }>>([]);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [_models, setModels] = useState<Array<{ id: string; name: string; provider: string; providerName: string; contextLength?: number; supportsReasoning?: boolean; supportsVision?: boolean; input?: string[] }>>([]);
  const [sessionStats, setSessionStats] = useState({ turns: 0, steps: 0, llmMs: 0, toolMs: 0, ttftMs: 0, outputTokens: 0, inputTokens: 0, cacheHit: null as number | null, currentTokPerSec: 0 as number });
  const sessionStatsRef = useRef(sessionStats);
  useEffect(() => {
    sessionStatsRef.current = sessionStats;
  }, [sessionStats]);
  const [pendingApproval, setPendingApproval] = useState<{ id?: string; toolName?: string; action?: string; filePath?: string; toolCallId?: string } | null>(null);
  const turnStartTimeRef = useRef<number>(0);
  const firstTokenTimeRef = useRef<number | null>(null);
  const toolStartTimeRef = useRef<Record<string, number>>({});
  const currentOutputTokensRef = useRef<number>(0);
  const lastStatsUpdateRef = useRef<number>(0);
  const turnToolMsRef = useRef<number>(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  const handleAgentEvent = useCallback((event: any) => {
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      const agentEvent = data?.event;
      if (!agentEvent) return;

      const sessionId = currentSessionIdRef.current;
      if (!sessionId) return;

      // 心跳事件：仅用于保持 SSE 连接活跃，无需处理。
      if (agentEvent.type === 'heartbeat') return;

      // 超时部分结果：在流式输出中插入提示，告知用户响应较慢。
      if (agentEvent.type === 'partial_result') {
        const partialMsg = agentEvent.message;
        if (partialMsg?.content) {
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') {
              updated[updated.length - 1] = {
                ...last,
                contentBlocks: [
                  ...(last.contentBlocks || []),
                  ...partialMsg.content.map((block: any) => ({
                    type: block.type || 'text',
                    text: block.text,
                    thinking: block.thinking,
                    name: block.name,
                    arguments: block.arguments,
                  })),
                ],
                streaming: false,
              };
            }
            return updated;
          });
        }
        return;
      }

      if (agentEvent.type === 'message_start') {
        // Agent 每次内循环迭代都会产生独立的 assistant 消息（思考→工具→思考→…）。
        // 仅当最后一条 assistant 还是空占位（handleSend 创建的）时复用，否则新增一条，
        // 避免后一次迭代的思考/操作覆盖前一次，保证整个过程连续显示。
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          const isPlaceholder = last && last.role === 'assistant' && last.streaming
            && (!last.contentBlocks || last.contentBlocks.length === 0) && !last.content;
          if (!isPlaceholder) {
            // 前一次迭代结束，标记 streaming: false，避免光标继续闪烁
            if (last && last.role === 'assistant' && last.streaming) {
              updated[updated.length - 1] = { ...last, streaming: false };
            }
            updated.push({
              id: 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
              role: 'assistant',
              content: '',
              contentBlocks: [],
              streaming: true,
              timestamp: Date.now(),
            });
          }
          return updated;
        });
      } else if (agentEvent.type === 'message_update') {
        const msg = agentEvent.message;
        if (msg && msg.content && Array.isArray(msg.content)) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
          const textBlock = msg.content.find((block: any) => block.type === 'text');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
          const thinkingBlock = msg.content.find((block: any) => block.type === 'thinking');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
          const toolCallBlocks = msg.content.filter((block: any) => block.type === 'toolCall');
          
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
          const contentBlocks = msg.content.map((block: any) => ({
            type: block.type,
            text: block.text,
            thinking: block.thinking,
            name: block.name,
            arguments: block.arguments,
          }));
          
          let displayText = '';
          if (textBlock) {
            displayText += textBlock.text || '';
          }
          if (thinkingBlock) {
            displayText += '\n\n[思考中]\n' + (thinkingBlock.thinking || '');
          }
          if (toolCallBlocks.length > 0) {
            displayText += '\n\n[工具调用]\n';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
            toolCallBlocks.forEach((tc: any) => {
              displayText += `- ${tc.name}: ${JSON.stringify(tc.arguments || {})}\n`;
            });
          }
          
          if (displayText) {
            scheduleAssistantFlushRef.current?.(displayText);
          }
          
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') {
              updated[updated.length - 1] = {
                ...last,
                contentBlocks,
                content: displayText || last.content,
                timestamp: Date.now()
              };
            }
            return updated;
          });

          if (textBlock && textBlock.text) {
            if (firstTokenTimeRef.current === null) {
              firstTokenTimeRef.current = Date.now();
              const ttft = Math.max(0, firstTokenTimeRef.current - turnStartTimeRef.current);
              setSessionStats(prev => ({ ...prev, ttftMs: ttft }));
            }
            currentOutputTokensRef.current = Math.max(currentOutputTokensRef.current, Math.ceil(textBlock.text.length / 4));
            const now = Date.now();
            if (now - lastStatsUpdateRef.current >= 500) {
              lastStatsUpdateRef.current = now;
              const genSeconds = firstTokenTimeRef.current ? (now - firstTokenTimeRef.current) / 1000 : 0;
              const tps = genSeconds > 0 ? currentOutputTokensRef.current / genSeconds : 0;
              setSessionStats(prev => ({ ...prev, outputTokens: currentOutputTokensRef.current, currentTokPerSec: tps }));
            }
          }
        }
      } else if (agentEvent.type === 'message_end') {
        const msg = agentEvent.message;
        if (msg?.usage) {
          const outputTokens = typeof msg.usage.output === 'number' ? msg.usage.output : currentOutputTokensRef.current;
          const inputTokens = typeof msg.usage.input === 'number' ? msg.usage.input : 0;
          const cacheRead = typeof msg.usage.cacheRead === 'number' ? msg.usage.cacheRead : 0;
          const cacheHit = inputTokens > 0 ? Math.round((cacheRead / (inputTokens + cacheRead)) * 100) : null;
          setSessionStats(prev => ({
            ...prev,
            outputTokens,
            inputTokens,
            cacheHit: cacheHit !== null && Number.isFinite(cacheHit) ? cacheHit : prev.cacheHit,
          }));
          currentOutputTokensRef.current = outputTokens;
        }
      } else if (agentEvent.type === 'tool_execution_start') {
        toolStartTimeRef.current[agentEvent.toolCallId] = Date.now();
      } else if (agentEvent.type === 'tool_execution_end') {
        const start = toolStartTimeRef.current[agentEvent.toolCallId];
        if (start) {
          const duration = Math.max(0, Date.now() - start);
          turnToolMsRef.current += duration;
          setSessionStats(prev => ({ ...prev, toolMs: prev.toolMs + duration }));
          delete toolStartTimeRef.current[agentEvent.toolCallId];
        }

        if (agentEvent.result?.requiresApproval) {
          setPendingApproval({
            id: agentEvent.result.approvalId,
            toolName: agentEvent.result.approvalContext?.toolName,
            action: agentEvent.result.approvalContext?.action,
            filePath: agentEvent.result.approvalContext?.filePath,
            toolCallId: agentEvent.toolCallId,
          });
        }
      } else if (agentEvent.type === 'agent_end' || agentEvent.type === 'turn_end') {
        setPendingApproval(null);
        setLoading(false);
        const turnEndTime = Date.now();
        const turnDuration = Math.max(0, turnEndTime - turnStartTimeRef.current);
        const estimatedLlmMs = Math.max(0, turnDuration - turnToolMsRef.current);
        setSessionStats(prev => ({
          ...prev,
          turns: prev.turns + 1,
          llmMs: prev.llmMs + estimatedLlmMs,
          steps: prev.steps + 1,
        }));
        const current = sessionStatsRef.current;
        const statsPayload = {
          turns: current.turns + 1,
          steps: current.steps + 1,
          llmMs: current.llmMs + estimatedLlmMs,
          toolMs: current.toolMs,
          ttftMs: current.ttftMs,
          outputTokens: current.outputTokens,
          inputTokens: current.inputTokens,
          cacheHit: current.cacheHit,
        };
        authedFetch(`${API_PREFIX}/sessions/${sessionId}/stats`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(statsPayload),
        }).catch(() => {
          // ignore persistence failure
        });
      }
    } catch (e) {
      console.error('Failed to parse agent_event:', e);
    }
  }, []);

  const chatStream = useChatStream();
  const sse = useSSE(sessionId, { onAgentEvent: handleAgentEvent });
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const currentSessionIdRef = useRef<string | null>(null);
  const assistantContentRef = useRef('');
  const flushAssistantRef = useRef<(content: string, streaming: boolean) => void>(() => {});
  const scheduleAssistantFlushRef = useRef<(content: string) => void>(() => {});
  const _sendTextRef = useRef('');
  const _sendSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    setIsConnected(sse.isConnected);
    setIsConnecting(sse.isConnecting);
    setConnectionError(sse.error);
  }, [sse.isConnected, sse.isConnecting, sse.error, setIsConnected, setIsConnecting, setConnectionError]);

  useEffect(() => {
    if (showDirPicker) {
      loadDirEntries(dirPickerPath || 'C:\\');
    }
  }, [showDirPicker]);

  useEffect(() => {
    return () => {
      chatStream.close();
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = undefined;
      }
    };
  }, []);

  useEffect(() => {
    fetchSessions();
    fetchWorkspaces();
    fetchModels();
    fetchPresets();
  }, []);

  // 点击模型选择器外部时关闭下拉菜单
  useEffect(() => {
    if (!showModelDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.model-selector')) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showModelDropdown]);

  useEffect(() => {
    const controller = new AbortController();
    fetchSessions(controller.signal);
    return () => controller.abort(); // workspaceId 变化时取消旧请求
  }, [workspaceId]);

  const fetchPresets = async () => {
    try {
      const response = await authedFetch(`${API_PREFIX}/presets`);
      if (response.ok) {
        const data = await response.json();
        setPresets(data.presets || []);
      }
    } catch (error) {
      console.error('Failed to fetch presets:', error);
    }
  };

  const formatMs = (ms: number): string => {
    if (ms <= 0) return '0s';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) {
      return minutes + 'm' + (seconds > 0 ? seconds + 's' : '');
    }
    return seconds + 's';
  };

  const formatTokens = (tokens: number): string => {
    if (tokens >= 1000000) return (tokens / 1000000).toFixed(1) + 'M';
    if (tokens >= 1000) return (tokens / 1000).toFixed(1) + 'k';
    return String(tokens);
  };

  // 单向同步：Context 是唯一真实来源，变化时同步到本地 state。
  // ⚠️ 不要再加 local→Context 的反向同步：两个方向的效果会在同一提交周期
  // 用旧闭包值互相覆盖，导致 workspaceId/sessionId 无限来回交换（Maximum update
  // depth exceeded）。ChatPage 内需要修改工作区/会话时直接调用 Context 的 setter。
  useEffect(() => {
    setWorkspaceIdLocal(contextWorkspaceId);
  }, [contextWorkspaceId]);

  // 当 Context 中的 sessionId 变化时，自动加载会话（null 时清空本地会话）
  useEffect(() => {
    setSessionIdLocal(contextSessionId);
    if (contextSessionId) {
      loadSession(contextSessionId);
    }
  }, [contextSessionId]);

  // 工作区切换防御：workspaceId 变化时，如果 Context 中没有 sessionId，
  // 强制清除本地 sessionId，防止 send() 复用前一个工作区的失效 session
  const prevWorkspaceIdRef = useRef(contextWorkspaceId);
  useEffect(() => {
    if (prevWorkspaceIdRef.current !== contextWorkspaceId) {
      prevWorkspaceIdRef.current = contextWorkspaceId;
      if (!contextSessionId) {
        setSessionIdLocal(null);
        setMessages([]);
        chatStream.close();
        setLoading(false);

      }
    }
  }, [contextWorkspaceId, contextSessionId]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [input]);

  const fetchWorkspaces = async () => {
    try {
      const res = await authedFetch(`${API_PREFIX}/workspaces`);
      if (res.ok) {
        const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        const items = (data.items || []).map((ws: any) => ({
          id: ws.workspaceId,
          path: ws.path,
          title: ws.title,
          sessionIds: ws.sessionIds || [],
          createdAt: ws.createdAt,
          updatedAt: ws.updatedAt
        }));
        setWorkspaces(items);
        setArchivedSessionIds(data.archivedSessionIds || []);
      }
    } catch (e) {
      console.error('Failed to fetch workspaces:', e);
    }
  };

  const fetchModels = async () => {
    try {
      const res = await authedFetch(`${API_PREFIX}/models`);
      if (res.ok) {
        const data = await res.json();
        const allModels: Array<{ id: string; name: string; provider: string; providerName: string; contextLength?: number; supportsReasoning?: boolean; supportsVision?: boolean; input?: string[] }> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        data.providers?.forEach((provider: any) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
          provider.models?.forEach((m: any) => {
            allModels.push({
              id: m.id,
              name: m.name,
              provider: provider.id,
              providerName: provider.name,
              contextLength: m.contextLength,
              supportsReasoning: m.supportsReasoning,
              supportsVision: m.supportsVision,
              input: m.input
            });
          });
        });
        setModels(allModels);
        
        // Restore last used model if available
        setModel(prev => {
          if (prev) return prev;
          try {
            const lastModel = localStorage.getItem('lastModel');
            if (lastModel) {
              const exists = allModels.some(m => m.id === lastModel);
              if (exists) return lastModel;
            }
          } catch {
            // ignore
          }
          return '';
        });
      }
    } catch (e) {
      console.error('Failed to fetch models:', e);
    }
  };

  const lastUserMessageTextRef = useRef<string>('');
  const pendingRetryRef = useRef<boolean>(false);

  const handleApprovalDecision = async (approvalId: string | undefined, approved: boolean) => {
    if (!approvalId) return;
    const endpoint = approved ? `/api/approvals/${approvalId}/approve` : `/api/approvals/${approvalId}/reject`;
    try {
      const res = await authedFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(approved ? { decidedBy: 'user' } : { decidedBy: 'user', reason: 'Rejected by user' }),
      });
      if (!res.ok) {
        throw new Error('Failed to record approval decision');
      }

      // Reuse the existing SSE connection managed by useSSE: after approval,
      // simply POST the last user message again so the active stream resumes.
      if (approved && !pendingRetryRef.current && sessionId && lastUserMessageTextRef.current) {
        pendingRetryRef.current = true;
        setError(null);
        setLoading(true);

        try {
          await authedFetch(`${API_PREFIX}/sessions/${sessionId}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: lastUserMessageTextRef.current }),
          });
        } catch (retryErr) {
          console.error('Retry failed:', retryErr);
          setError('重试发送失败，请重试');
          setLoading(false);
  
        } finally {
          pendingRetryRef.current = false;
        }
      }
    } catch (e) {
      console.error('Approval decision failed:', e);
      setError('审批操作失败，请重试');
    } finally {
      setPendingApproval(null);
    }
  };

  // Auto-approve smoke test: when an approval appears, automatically record
  // the decision after a short delay so the end-to-end flow can be verified
  // without manual clicks. Remove this in production if manual approval is required.
  useEffect(() => {
    if (!pendingApproval?.id) return;
    if (import.meta.env.DEV !== true) return;
    const timer = setTimeout(() => {
      handleApprovalDecision(pendingApproval.id, true);
    }, 1000);
    return () => clearTimeout(timer);
  }, [pendingApproval?.id]);

  const fetchSessions = async (signal?: AbortSignal) => {
    try {
      const url = workspaceId
        ? '/api/sessions?workspaceId=' + encodeURIComponent(workspaceId)
        : '/api/sessions';
      const res = await authedFetch(url, { signal });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch (e) {
      // AbortController cleanup 产生的 AbortError 是无害的，不需要输出到控制台
      if (e instanceof Error && e.name === 'AbortError') return;
      console.error('Failed to fetch sessions:', e);
    }
  };

  const createSession = async (): Promise<string> => {
    const resolvedModel = model || (() => {
      try {
        const last = localStorage.getItem('lastModel');
        if (last) return last;
      } catch {
        // ignore
      }
      return '';
    })();
    
    const res = await authedFetch(`${API_PREFIX}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: resolvedModel, workspaceId: workspaceId || undefined, mode })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new AppError(data.error || '创建会话失败', res.status, 'HTTP_ERROR');
    }
    const data = await res.json();
    // 用本地 sessionId（而非 context）更新：避免 contextSessionId 变化触发 useEffect
    // 里的 loadSession，后者会 chatStream.close() + setMessages([])，破坏首次发送流程。
    setSessionIdLocal(data.session.id);
    if (resolvedModel) {
      try {
        localStorage.setItem('lastModel', resolvedModel);
      } catch {
        // ignore
      }
    }
    fetchSessions();
    return data.session.id;
  };

  // 历史消息的 content 可能是数组（[{type:'text',text},...]），也可能是字符串。
  // 归一化为前端可渲染的 contentBlocks + 字符串，避免数组直接渲染导致崩溃/空白。
  const normalizeHistoryMessage = (m: any): any => {
    if (!Array.isArray(m.content)) {
      return { ...m, streaming: false };
    }
    const contentBlocks = m.content.map((block: any) => ({
      type: block.type || 'text',
      text: block.text,
      thinking: block.thinking,
      name: block.name,
      arguments: block.arguments,
    }));
    const content = contentBlocks
      .map((b: any) => {
        if (b.type === 'text') return b.text || '';
        if (b.type === 'thinking') return '[思考中]\n' + (b.thinking || '');
        if (b.type === 'toolCall') return '[工具调用] ' + (b.name || '') + ': ' + JSON.stringify(b.arguments || {});
        return '';
      })
      .filter(Boolean)
      .join('\n\n');
    return { ...m, content, contentBlocks, streaming: false };
  };

  const loadSession = async (id: string) => {
    setError(null);
    chatStream.close();
    setLoading(false);
    setSessionId(id);
    setMessages([]);
    try {
      const res = await authedFetch(`${API_PREFIX}/sessions/${id}`);
      if (res.ok) {
        const data = await res.json();
        const history = (data.messages || []).map(normalizeHistoryMessage);
        setMessages(history);
        if (data.session) {
          if (data.session.model) {
            setModel(data.session.model);
            try {
              localStorage.setItem('lastModel', data.session.model);
            } catch {
              // ignore
            }
          }
          if (data.session.workspaceId) {
            setWorkspaceId(data.session.workspaceId);
          }
          setMode(data.session.mode || 'standard');
          const storedStats = data.session.metadata?.stats;
          if (storedStats) {
            setSessionStats({
              turns: typeof storedStats.turns === 'number' ? storedStats.turns : 0,
              steps: typeof storedStats.steps === 'number' ? storedStats.steps : 0,
              llmMs: typeof storedStats.llmMs === 'number' ? storedStats.llmMs : 0,
              toolMs: typeof storedStats.toolMs === 'number' ? storedStats.toolMs : 0,
              ttftMs: typeof storedStats.ttftMs === 'number' ? storedStats.ttftMs : 0,
              outputTokens: typeof storedStats.outputTokens === 'number' ? storedStats.outputTokens : 0,
              inputTokens: typeof storedStats.inputTokens === 'number' ? storedStats.inputTokens : 0,
              cacheHit: typeof storedStats.cacheHit === 'number' ? storedStats.cacheHit : null,
              currentTokPerSec: 0,
            });
          }
        }

        currentSessionIdRef.current = id;
      }
    } catch (e) {
      console.error('Failed to load session:', e);
    }
  };

  const _deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await authedFetch(`${API_PREFIX}/sessions/${id}`, { method: 'DELETE' });
    if (sessionId === id) {
      setSessionId(null);
      setMessages([]);
    }
    fetchSessions();
  };

  const handleCreateWorkspace = async () => {
    if (!newWorkspacePath.trim()) return;
    try {
      const res = await authedFetch(`${API_PREFIX}/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: newWorkspacePath.trim(), title: newWorkspaceTitle.trim() || undefined })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new AppError(data.error || '创建工作区失败', res.status, 'HTTP_ERROR');
      }
      const data = await res.json();
      if (data.workspace) {
        setWorkspaceId(data.workspace.workspaceId);
      }
      setShowNewWorkspaceModal(false);
      setNewWorkspacePath('');
      setNewWorkspaceTitle('');
      fetchWorkspaces();
    } catch (e) {
      const message = getFriendlyMessage(e);
      setError(message);
    }
  };

  const _handleRenameWorkspace = async (workspaceId: string, currentTitle: string) => {
    const newTitle = prompt('工作区名称', currentTitle);
    if (newTitle === null) return;
    if (!newTitle.trim()) {
      alert('工作区名称不能为空');
      return;
    }
    try {
      const res = await authedFetch(`${API_PREFIX}/workspaces/${workspaceId}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new AppError(data.error || '重命名工作区失败', res.status, 'HTTP_ERROR');
      }
      fetchWorkspaces();
    } catch (e) {
      const message = getFriendlyMessage(e);
      setError(message);
    }
  };

  const _handleDeleteWorkspace = async (targetWorkspaceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定要删除此工作区吗？工作区内的会话不会被删除，但工作区本身将被移除。')) {
      return;
    }
    try {
      const res = await authedFetch(`${API_PREFIX}/workspaces/${targetWorkspaceId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new AppError(data.error || '删除工作区失败', res.status, 'HTTP_ERROR');
      }
      if (targetWorkspaceId === workspaceId) {
        setWorkspaceId('default');
        setSessions([]);
      }
      fetchWorkspaces();
      fetchSessions();
    } catch (e) {
      const message = getFriendlyMessage(e);
      setError(message);
    }
  };

  const handleBrowseDirectory = async () => {
    setShowDirPicker(true);
    if (newWorkspacePath) {
      setDirPickerPath(newWorkspacePath);
    } else {
      setDirPickerPath('/');
    }
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
    // If at drive root like C:\, go to computer view
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
    setSelectedDirHint(name);
    if (!newWorkspaceTitle) {
      setNewWorkspaceTitle(name);
    }
    setShowDirPicker(false);
  };

  const _newChat = () => {
    setSessionId(null);
    setMessages([]);
    setError(null);
    setSessionStats({ turns: 0, steps: 0, llmMs: 0, toolMs: 0, ttftMs: 0, outputTokens: 0, inputTokens: 0, cacheHit: null, currentTokPerSec: 0 });
    chatStream.close();
    setLoading(false);
  };

  const send = useCallback(async (overrideText?: string) => {
    const text = (overrideText || input).trim();
    if (!text || loading) return;
    setError(null);
    let currentSessionId = sessionId;
    chatStream.close();
    setLoading(true);
    try {
      if (!currentSessionId) {
        currentSessionId = await createSession();
      }
      setMessages(prev => [...prev, { id: 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2), role: 'user', content: text, timestamp: Date.now() }]);
      lastUserMessageTextRef.current = text;
      setInput('');
      setMessages(prev => [...prev, { id: 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2), role: 'assistant', content: '', streaming: true, timestamp: Date.now() }]);

      // Initialize timing refs for this turn; keep cumulative counts intact.
      const now = Date.now();
      turnStartTimeRef.current = now;
      firstTokenTimeRef.current = null;
      toolStartTimeRef.current = {};
      currentOutputTokensRef.current = 0;
      lastStatsUpdateRef.current = 0;
      turnToolMsRef.current = 0;
      const estimatedInputTokens = Math.max(1, Math.ceil(text.length / 4));
      setSessionStats(prev => ({
        ...prev,
        inputTokens: (prev.inputTokens || 0) + estimatedInputTokens,
        cacheHit: prev.cacheHit,
        currentTokPerSec: 0,
      }));

      // Open stream first, then send message
      currentSessionIdRef.current = currentSessionId;
      chatStream.connect(currentSessionId, {
        onConnected: (_event, eventSource) => {
          eventSource.onerror = () => {
            cleanup();
          };
          authedFetch(`${API_PREFIX}/sessions/${currentSessionId}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
          }).then(sendRes => {
            if (!sendRes.ok) {
              return sendRes.json().catch(() => ({ error: '发送消息失败' })).then(data => {
                throw new AppError(data.error || '发送消息失败', sendRes.status, 'HTTP_ERROR');
              });
            }
          }).catch(err => {
            if (err instanceof AppError) {
              setError(err.message);
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { id: 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2), role: 'assistant', content: '错误: ' + err.message, streaming: false, timestamp: Date.now() };
                return updated;
              });
            } else if (err instanceof Error && err.name !== 'AbortError') {
              // 非 AppError 的网络/运行时错误也要提示用户，不能静默失败
              const message = getFriendlyMessage(err);
              setError(message);
            }
            cleanup();
          });
        },
        onAgentEvent: handleAgentEvent,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        onDone: (event: any) => {
          try {
            const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            if (data?.response) {
              assistantContentRef.current = data.response;
              flushAssistantRef.current(assistantContentRef.current, false);
            }
            const llmDuration = Math.max(0, Date.now() - turnStartTimeRef.current);
            setSessionStats(prev => ({
              ...prev,
              currentTokPerSec: prev.outputTokens > 0 && llmDuration > 0 ? prev.outputTokens / (llmDuration / 1000) : prev.currentTokPerSec,
            }));
          } catch (e) {
            console.error('Failed to parse done event:', e);
          }
          cleanup();
        },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        onError: (event: any) => {
          try {
            const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            const message = getFriendlyMessage(data?.message || 'Stream error');
            setError(message);
            flushAssistantRef.current('错误: ' + message, false);
          } catch (e) {
            console.error('Failed to parse error event:', e);
          }
          cleanup();
        },
      });

      const flushAssistant = (content: string, streaming: boolean) => {
        if (flushTimerRef.current) {
          clearTimeout(flushTimerRef.current);
          flushTimerRef.current = undefined;
        }
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant') {
            updated[updated.length - 1] = {
              ...last,
              content,
              streaming,
              timestamp: Date.now()
            };
          }
          return updated;
        });
        if (streaming && isNearBottomRef.current && messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
      };
      flushAssistantRef.current = flushAssistant;

      const scheduleAssistantFlush = (content: string) => {
        assistantContentRef.current = content;
        if (flushTimerRef.current) {
          clearTimeout(flushTimerRef.current);
          flushTimerRef.current = undefined;
        }
        flushTimerRef.current = setTimeout(() => {
          flushTimerRef.current = undefined;
          flushAssistantRef.current(assistantContentRef.current, true);
        }, 16);
      };
      scheduleAssistantFlushRef.current = scheduleAssistantFlush;

      const cleanup = () => {
        chatStream.close();
        if (flushTimerRef.current) {
          clearTimeout(flushTimerRef.current);
          flushTimerRef.current = undefined;
        }
        setLoading(false);
        // 确保最后一条 assistant 消息的 streaming 关闭，避免光标持续闪烁
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant' && last.streaming) {
            updated[updated.length - 1] = { ...last, streaming: false };
          }
          return updated;
        });

        if (isNearBottomRef.current) {
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
        }
      };

    } catch (e) {
      const message = getFriendlyMessage(e);
      setError(message);
      setMessages(prev => [...prev, { id: 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2), role: 'assistant', content: '错误: ' + message, streaming: false, timestamp: Date.now() }]);
      setLoading(false);
    }
  }, [input, loading, sessionId, model, workspaceId, mode]);

  const stopGeneration = () => {
    chatStream.close();
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = undefined;
    }
    setLoading(false);
    setMessages(prev => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.streaming) last.streaming = false;
      return updated;
    });
  };

  return (
    <main className="main-chat">
      {serverError && (
        <ErrorBanner
          error={serverError}
          onClose={() => setServerError(null)}
        />
      )}
      {/* === Chat Header === */}
      <div className="chat-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {onToggleSidebar && (
            <button className="hamburger" onClick={onToggleSidebar} title="菜单">
              <Menu size={20} />
            </button>
          )}
          <div className="workspace-indicator">
            <Folder size={14} />
            当前工作区: <strong>{workspaceId || 'default'}</strong>
          </div>
          <div className="model-selector" onClick={() => setShowModelDropdown(prev => !prev)} style={{ cursor: 'pointer', position: 'relative' }}>
            <span className="dot" />
            {model || '未选择模型'}
            <ChevronRight size={16} style={{ transform: 'rotate(-90deg)' }} />
            {showModelDropdown && (
              <div className="model-dropdown" style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 1000, maxHeight: 300, overflowY: 'auto', marginTop: 4 }}>
                {_models.length === 0 ? (
                  <div style={{ padding: '12px 16px', color: '#9ca3af', fontSize: 13 }}>暂无可用模型，请先在设置中添加供应商</div>
                ) : (
                  _models.map(m => (
                    <div key={m.id} onClick={(e) => { e.stopPropagation(); setModel(m.id); localStorage.setItem('lastModel', m.id); setShowModelDropdown(false); }} style={{ padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, background: model === m.id ? '#f3f4f6' : 'transparent', fontSize: 13 }}>
                      <span style={{ flex: 1 }}>
                        <span style={{ fontWeight: 500 }}>{m.name}</span>
                        {m.providerName && <span style={{ color: '#9ca3af', marginLeft: 6, fontSize: 11 }}>{m.providerName}</span>}
                      </span>
                      {model === m.id && <span style={{ color: '#3b82f6', fontSize: 12 }}>✓</span>}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
        <div className="actions">
          <Monitor size={18} />
          <FileText size={18} />
        </div>
      </div>

      {sessionId ? (
        /* Active Chat */
        <>
          <div className="chat-messages" ref={messagesContainerRef} onScroll={() => {
            if (messagesContainerRef.current) {
              const container = messagesContainerRef.current;
              const threshold = 120;
              isNearBottomRef.current = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
            }
          }}>
            <div className="messages-list">
              {messages.map((m, _i) => (
                <MessageItem
                  key={m.id}
                  role={m.role}
                  content={m.content}
                  streaming={m.streaming}
                  timestamp={m.timestamp}
                  contentBlocks={m.contentBlocks}
                  messageId={m.id}
                  sessionId={sessionId || undefined}
                  onQuickFeedback={async (msgId, rating) => {
                    if (!sessionId) return;
                    try {
                      await submitFeedback(sessionId, msgId, rating);
                    } catch (e) {
                      console.error('Failed to submit feedback', e);
                    }
                  }}
                  onCodeFeedback={async (msgId, rating) => {
                    if (!sessionId) return;
                    try {
                      await submitCodeFeedback(sessionId, msgId, rating);
                    } catch (e) {
                      console.error('Failed to submit code feedback', e);
                    }
                  }}
                />
              ))}
              <div ref={bottomRef} />
            </div>
            {!isNearBottomRef.current && messages.length > 0 && (
              <button className="scroll-to-bottom" onClick={() => {
                bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
                isNearBottomRef.current = true;
              }}>
                <ArrowDown size={16} style={{ marginRight: 6 }} /> 新消息
              </button>
            )}
          </div>

          {(loading || sessionStats.turns > 0 || sessionStats.outputTokens > 0 || sse.isConnected) && (
            <div className="session-stats-bar">
              <span className="connection-status" title={sse.error || (sse.isConnected ? '已连接' : '连接中...')}>
                <span className={`status-dot ${sse.isConnected ? 'connected' : sse.isConnecting ? 'connecting' : 'disconnected'}`} />
                {sse.isConnected ? '已连接' : sse.isConnecting ? '连接中...' : '未连接'}
              </span>
              <span>{sessionStats.turns} 轮 · {sessionStats.steps} 步</span>
              <span>首 token {formatMs(sessionStats.ttftMs)}</span>
              <span>{sessionStats.currentTokPerSec > 0 ? sessionStats.currentTokPerSec.toFixed(1) : '--'} tok/s</span>
              <span>LLM {formatMs(sessionStats.llmMs)} · 工具 {formatMs(sessionStats.toolMs)}</span>
              <span>输入 {formatTokens(sessionStats.inputTokens)} tok · 输出 {formatTokens(sessionStats.outputTokens)} tok</span>
            </div>
          )}

        </>
      ) : (
        /* Welcome / New Session Screen - Mockup Style */
        <div className="welcome-screen">
          <div className="greeting">{workspaceId || 'test-workspace'}</div>
          <div className="sub">准备开始构建？</div>
          <div className="shortcuts">
            <div className="chip" onClick={(e) => { e.preventDefault(); send('解释 PTC 模式原理'); }}><FileCode size={14} /> 解释代码</div>
            <div className="chip" onClick={(e) => { e.preventDefault(); send('审查最近的代码变更'); }}><Search size={14} /> 审查 PR</div>
            <div className="chip" onClick={(e) => { e.preventDefault(); send('生成项目文档'); }}><BookOpen size={14} /> 生成文档</div>
            <div className="chip" onClick={(e) => { e.preventDefault(); send('为当前模块写单元测试'); }}><FlaskConical size={14} /> 写测试</div>
          </div>
        </div>
      )}

      {/* Composer：无论是否有会话都显示，欢迎页输入后自动创建会话 */}
      <div className="chat-input-area">
        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button onClick={() => setError(null)}><X size={16} /></button>
          </div>
        )}
        <div className="input-wrapper">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="输入消息... (Enter 发送)"
            disabled={loading}
            rows={1}
          />
          <div className="input-actions">
            <Monitor size={16} />
          </div>
          {loading ? (
            <button className="send-btn stop" onClick={stopGeneration} aria-label="停止生成"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg></button>
          ) : (
            <button className="send-btn" onClick={(e) => { e.preventDefault(); send(); }} disabled={!input.trim()} aria-label="发送"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg></button>
          )}
        </div>
      </div>

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
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="input"
                      value={newWorkspacePath}
                      onChange={e => setNewWorkspacePath(e.target.value)}
                      placeholder="C:\\Users\\...\\my-project"
                      style={{ flex: 1 }}
                      readOnly
                    />
                    <button className="btn btn-secondary" onClick={handleBrowseDirectory} type="button">
                      浏览...
                    </button>
                  </div>
                  {selectedDirHint && (
                    <div className="form-hint">已选择: {selectedDirHint}</div>
                  )}
                  <div className="form-hint">点击“浏览”选择本地目录，工作区将直接读取该目录，不会上传文件。</div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowNewWorkspaceModal(false)}>取消</button>
                <button className="btn btn-primary" onClick={handleCreateWorkspace} disabled={!newWorkspacePath.trim()}>创建</button>
              </div>
            </div>
          </div>
        )}

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
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        loadDirEntries(dirPickerPath);
                      }
                    }}
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
      </main>
  );
}



