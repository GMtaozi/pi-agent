import { useState, useEffect } from 'react';
import { ArrowLeft, Pin, MessageSquare, Archive, Trash2, Plus, Search, X } from 'lucide-react';
import {
  getCoreMemory,
  putCoreMemory,
  getWorkingMemory,
  getArchivalMemory,
  createArchivalMemory,
  deleteArchivalMemory,
  type MemoryChunk,
} from '../lib/api';
import { getFriendlyMessage } from '../lib/errors';

type Tab = 'core' | 'working' | 'archival';

export default function MemoryPage({ onBack }: { onBack?: () => void } = {}) {
  const [tab, setTab] = useState<Tab>('core');
  const [_loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState('default');

  // core
  const [_core, setCore] = useState<Record<string, unknown> | null>(null);
  const [coreText, setCoreText] = useState('');
  const [coreSaving, setCoreSaving] = useState(false);

  // working
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  const [workingMessages, setWorkingMessages] = useState<Array<{ id: string; role: string; content: any; createdAt: string }>>([]);
  const [workingSessionId, setWorkingSessionId] = useState('');

  // archival
  const [chunks, setChunks] = useState<MemoryChunk[]>([]);
  const [archivalQuery, setArchivalQuery] = useState('');
  const [archivalContent, setArchivalContent] = useState('');
  const [archivalSummary, setArchivalSummary] = useState('');
  const [showArchivalForm, setShowArchivalForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadCore = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCoreMemory(userId);
      setCore(data.preferences || {});
      setCoreText(JSON.stringify(data.preferences || {}, null, 2));
    } catch (e) {
      setError(getFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const loadWorking = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!workingSessionId) {
        setWorkingMessages([]);
        setLoading(false);
        return;
      }
      const data = await getWorkingMemory(workingSessionId);
      setWorkingMessages(data.messages || []);
    } catch (e) {
      setError(getFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const loadArchival = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getArchivalMemory(userId, archivalQuery || undefined);
      setChunks(data.chunks || []);
    } catch (e) {
      setError(getFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'core') loadCore();
    else if (tab === 'working') loadWorking();
    else loadArchival();
  }, [tab, userId, workingSessionId, archivalQuery]);

  const saveCore = async () => {
    setCoreSaving(true);
    setError(null);
    try {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(coreText);
      } catch {
        throw new Error('JSON 格式错误');
      }
      await putCoreMemory(parsed, userId);
      setCore(parsed);
    } catch (e) {
      setError(getFriendlyMessage(e));
    } finally {
      setCoreSaving(false);
    }
  };

  const addArchival = async () => {
    if (!archivalContent.trim()) return;
    setError(null);
    try {
      const _res = await createArchivalMemory(
        { content: archivalContent, summary: archivalSummary || undefined, type: 'archival', createdAt: new Date().toISOString() },
        userId
      );
      setArchivalContent('');
      setArchivalSummary('');
      setShowArchivalForm(false);
      loadArchival();
    } catch (e) {
      setError(getFriendlyMessage(e));
    }
  };

  const deleteChunk = async (id: string) => {
    setDeletingId(id);
    setError(null);
    try {
      await deleteArchivalMemory(id);
      loadArchival();
    } catch (e) {
      setError(getFriendlyMessage(e));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="memory-page">
      <div className="settings-header">
        {onBack && (
          <button className="settings-back-btn" onClick={onBack} title="返回对话">
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="settings-header-content">
          <h1 className="settings-title">记忆管理</h1>
          <p className="settings-subtitle">管理 Agent 的跨会话记忆：核心、日级、长期</p>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}><span>{error}</span><button onClick={() => setError(null)}><X size={16} /></button></div>}

      <div className="memory-tabs">
        <button className={`memory-tab ${tab === 'core' ? 'active' : ''}`} onClick={() => setTab('core')}><Pin size={16} /> 核心记忆</button>
        <button className={`memory-tab ${tab === 'working' ? 'active' : ''}`} onClick={() => setTab('working')}><MessageSquare size={16} /> 日级记忆</button>
        <button className={`memory-tab ${tab === 'archival' ? 'active' : ''}`} onClick={() => setTab('archival')}><Archive size={16} /> 长期记忆</button>
      </div>

      <div className="memory-toolbar">
        <input
          className="input"
          value={userId}
          onChange={e => setUserId(e.target.value)}
          placeholder="userId"
          style={{ width: 180 }}
        />
        {tab === 'working' && (
          <input
            className="input"
            value={workingSessionId}
            onChange={e => setWorkingSessionId(e.target.value)}
            placeholder="sessionId"
            style={{ width: 260 }}
          />
        )}
        {tab === 'archival' && (
          <div style={{ display: 'flex', gap: 8, flex: 1 }}>
            <input
              className="input"
              value={archivalQuery}
              onChange={e => setArchivalQuery(e.target.value)}
              placeholder="检索长期记忆..."
              style={{ flex: 1 }}
            />
            <button className="btn btn-secondary" onClick={loadArchival}><Search size={14} /> 检索</button>
          </div>
        )}
      </div>

      {tab === 'core' && (
        <div className="config-card">
          <div className="card-header">
            <div>
              <div className="title">核心记忆</div>
              <div className="desc">跨会话持久化的用户偏好与关键上下文</div>
            </div>
            <div className="card-actions">
              <button className="btn btn-primary" onClick={saveCore} disabled={coreSaving}>
                {coreSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
          <textarea
            className="input"
            rows={12}
            value={coreText}
            onChange={e => setCoreText(e.target.value)}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 13, resize: 'vertical' }}
          />
        </div>
      )}

      {tab === 'working' && (
        <div className="config-card" style={{ padding: 0 }}>
          {workingMessages.length === 0 ? (
            <div className="settings-empty" style={{ padding: '40px 0' }}>暂无日级记忆</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {workingMessages.map((m, idx) => (
                <div key={m.id} style={{ padding: '12px 16px', borderBottom: idx < workingMessages.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{m.role}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'archival' && (
        <div>
          {showArchivalForm && (
            <div className="config-card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <div>
                  <div className="title">新增长期记忆</div>
                  <div className="desc">写入可检索的长期记忆片段</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-item">
                  <label className="form-label">内容</label>
                  <textarea
                    className="input"
                    rows={4}
                    value={archivalContent}
                    onChange={e => setArchivalContent(e.target.value)}
                    placeholder="输入长期记忆内容..."
                    style={{ resize: 'vertical' }}
                  />
                </div>
                <div className="form-item">
                  <label className="form-label">摘要</label>
                  <input
                    className="input"
                    value={archivalSummary}
                    onChange={e => setArchivalSummary(e.target.value)}
                    placeholder="可选摘要"
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn btn-secondary" onClick={() => setShowArchivalForm(false)}>取消</button>
                  <button className="btn btn-primary" onClick={addArchival} disabled={!archivalContent.trim()}>保存</button>
                </div>
              </div>
            </div>
          )}

          <div className="config-card" style={{ padding: 0 }}>
            {chunks.length === 0 ? (
              <div className="settings-empty" style={{ padding: '40px 0' }}>暂无长期记忆</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {chunks.map((chunk, idx) => (
                  <div key={chunk.id} style={{ padding: '12px 16px', borderBottom: idx < chunks.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{chunk.summary || chunk.type}</div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{chunk.content}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>{new Date(chunk.createdAt).toLocaleString('zh-CN')}</div>
                      </div>
                      <button className="row-icon-btn" title="遗忘" onClick={() => deleteChunk(chunk.id)} disabled={deletingId === chunk.id}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!showArchivalForm && (
            <button
              style={{
                marginTop: 12,
                background: 'transparent',
                border: '1px dashed var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: 10,
                width: '100%',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'var(--transition)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
              onClick={() => setShowArchivalForm(true)}
            >
              <Plus size={16} /> 新增长期记忆
            </button>
          )}
        </div>
      )}
    </div>
  );
}
