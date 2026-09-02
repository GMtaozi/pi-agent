import { useState, useEffect, useCallback } from 'react';
import {
  Play, Pause, SkipForward, Square, Bug, Eye, ChevronRight, ChevronDown,
  Plus, Trash2, AlertCircle, CheckCircle, XCircle, Clock
} from 'lucide-react';
import {
  createDebugSession, getDebugSession, addBreakpoint, removeBreakpoint,
  debugAction, getDebugSteps, getDebugVariables
} from '../lib/debug-api';

const STEP_TYPE_ICONS: Record<string, any> = {
  user_message: { icon: '👤', color: '#3b82f6' },
  assistant_message: { icon: '🤖', color: '#8b5cf6' },
  tool_call: { icon: '🔧', color: '#f59e0b' },
  tool_result: { icon: '✅', color: '#22c55e' },
  error: { icon: '❌', color: '#ef4444' },
};

export default function DebugPanel({ sessionId }: { sessionId: string }) {
  const [debugSession, setDebugSession] = useState<any>(null);
  const [steps, setSteps] = useState<any[]>([]);
  const [variables, setVariables] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bpToolName, setBpToolName] = useState('');
  const [bpStepIndex, setBpStepIndex] = useState('');
  const [selectedStep, setSelectedStep] = useState<any>(null);

  const loadDebugSession = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      let dbg = await createDebugSession(sessionId).catch(() => null);
      if (!dbg) {
        // Try to find existing session
        dbg = await getDebugSession(sessionId).catch(() => null);
      }
      if (dbg) {
        setDebugSession(dbg);
        const [s, v] = await Promise.all([
          getDebugSteps(dbg.id),
          getDebugVariables(dbg.id),
        ]);
        setSteps(s);
        setVariables(v);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load debug session');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadDebugSession();
    // Poll for updates when running
    const interval = setInterval(async () => {
      if (debugSession?.status === 'running' || debugSession?.status === 'stepping') {
        const s = await getDebugSteps(debugSession.id).catch(() => []);
        setSteps(s);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [loadDebugSession, debugSession?.status]);

  const handleAddBreakpoint = async () => {
    if (!debugSession) return;
    try {
      await addBreakpoint(debugSession.id, {
        toolName: bpToolName || undefined,
        stepIndex: bpStepIndex ? parseInt(bpStepIndex) : undefined,
        enabled: true,
      });
      setBpToolName('');
      setBpStepIndex('');
      loadDebugSession();
    } catch {
      setError('Failed to add breakpoint');
    }
  };

  const handleRemoveBp = async (bpId: string) => {
    if (!debugSession) return;
    await removeBreakpoint(debugSession.id, bpId);
    loadDebugSession();
  };

  const handleAction = async (action: 'pause' | 'resume' | 'step' | 'abort') => {
    if (!debugSession) return;
    try {
      await debugAction(debugSession.id, action);
      loadDebugSession();
    } catch {
      setError(`Failed to ${action}`);
    }
  };

  const statusColors: Record<string, string> = {
    running: '#22c55e',
    paused: '#f59e0b',
    stepping: '#3b82f6',
    completed: '#6b7280',
    aborted: '#ef4444',
  };

  return (
    <div className="debug-panel">
      <div className="debug-header">
        <div className="debug-title">
          <Bug size={18} />
          <span>调试器</span>
          {debugSession && (
            <span className="debug-status" style={{ color: statusColors[debugSession.status] }}>
              ● {debugSession.status}
            </span>
          )}
        </div>
        <div className="debug-controls">
          <button onClick={() => handleAction('resume')} title="继续">
            <Play size={16} />
          </button>
          <button onClick={() => handleAction('pause')} title="暂停">
            <Pause size={16} />
          </button>
          <button onClick={() => handleAction('step')} title="单步">
            <SkipForward size={16} />
          </button>
          <button onClick={() => handleAction('abort')} title="终止">
            <Square size={16} />
          </button>
        </div>
      </div>

      {error && <div className="debug-error">{error}</div>}

      {loading ? (
        <div className="debug-loading">加载调试会话...</div>
      ) : (
        <>
          {/* Breakpoints */}
          <div className="debug-section">
            <div className="section-header">
              <h4><Bug size={14} /> 断点</h4>
            </div>
            <div className="breakpoint-form">
              <input
                className="bp-input"
                placeholder="工具名"
                value={bpToolName}
                onChange={(e) => setBpToolName(e.target.value)}
              />
              <input
                className="bp-input"
                placeholder="步骤 #"
                value={bpStepIndex}
                onChange={(e) => setBpStepIndex(e.target.value)}
              />
              <button className="bp-add" onClick={handleAddBreakpoint}>
                <Plus size={14} />
              </button>
            </div>
            <div className="breakpoint-list">
              {debugSession?.breakpoints?.map((bp: any) => (
                <div key={bp.id} className="bp-item">
                  <span>{bp.toolName || `Step ${bp.stepIndex}`}</span>
                  <button onClick={() => handleRemoveBp(bp.id)}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Steps */}
          <div className="debug-section">
            <div className="section-header">
              <h4><Eye size={14} /> 执行步骤 ({steps.length})</h4>
            </div>
            <div className="step-list">
              {steps.map((step: any) => {
                const meta = STEP_TYPE_ICONS[step.type] || { icon: '❓', color: '#999' };
                return (
                  <div
                    key={step.index}
                    className={`step-item ${selectedStep?.index === step.index ? 'selected' : ''}`}
                    onClick={() => setSelectedStep(step)}
                  >
                    <span className="step-icon" style={{ color: meta.color }}>
                      {meta.icon}
                    </span>
                    <div className="step-info">
                      <span className="step-type">{step.type}</span>
                      {step.toolName && <span className="step-tool">{step.toolName}</span>}
                    </div>
                    <span className="step-time">
                      {new Date(step.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step Detail */}
          {selectedStep && (
            <div className="debug-section">
              <div className="section-header">
                <h4>步骤详情</h4>
              </div>
              <div className="step-detail">
                {selectedStep.content && (
                  <div className="detail-block">
                    <label>内容</label>
                    <pre>{selectedStep.content}</pre>
                  </div>
                )}
                {selectedStep.toolInput && (
                  <div className="detail-block">
                    <label>输入</label>
                    <pre>{JSON.stringify(selectedStep.toolInput, null, 2)}</pre>
                  </div>
                )}
                {selectedStep.toolOutput && (
                  <div className="detail-block">
                    <label>输出</label>
                    <pre>{JSON.stringify(selectedStep.toolOutput, null, 2)}</pre>
                  </div>
                )}
                {selectedStep.error && (
                  <div className="detail-block error">
                    <label>错误</label>
                    <pre>{selectedStep.error}</pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Variables */}
          <div className="debug-section">
            <div className="section-header">
              <h4>变量 ({variables.length})</h4>
            </div>
            <div className="variable-list">
              {variables.slice(-20).map((v: any, i: number) => (
                <div key={i} className="var-item">
                  <span className="var-name">{v.name}</span>
                  <span className="var-type">{v.type}</span>
                  <span className="var-value">{String(v.value).slice(0, 100)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
