import { useState, useEffect } from 'react';
import { ArrowLeft, User, Bot, Wrench, MessageSquare, Clock, FileText, ChevronRight, type LucideIcon } from 'lucide-react';
import { getSessionTrajectory, type TrajectoryNode } from '../lib/api';
import { getFriendlyMessage } from '../lib/errors';

interface TrajectoryPageProps {
  sessionId?: string;
  onBack?: () => void;
}

const ROLE_ICON: Record<string, LucideIcon> = {
  user: User,
  assistant: Bot,
  toolResult: Wrench,
  system: MessageSquare,
};

const ROLE_COLOR: Record<string, string> = {
  user: 'var(--accent-color)',
  assistant: '#22c55e',
  toolResult: '#f59e0b',
  system: '#94a3b8',
};

function TrajectoryPage({ sessionId, onBack }: TrajectoryPageProps) {
  const [nodes, setNodes] = useState<TrajectoryNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSessionTrajectory(sessionId)
      .then(data => {
        if (!cancelled) setNodes(data.nodes || []);
      })
      .catch(err => {
        if (!cancelled) setError(getFriendlyMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [sessionId]);

  if (!sessionId) {
    return <div className="settings-empty">请先选择一个会话</div>;
  }

  if (loading) {
    return <div className="settings-loading">加载轨迹...</div>;
  }

  if (error) {
    return <div className="error-banner"><span>{error}</span></div>;
  }

  if (nodes.length === 0) {
    return <div className="settings-empty">暂无轨迹数据</div>;
  }

  return (
    <div className="trajectory-page">
      <div className="settings-header">
        {onBack && (
          <button className="settings-back-btn" onClick={onBack} title="返回对话">
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="settings-header-content">
          <h1 className="settings-title">会话轨迹</h1>
          <p className="settings-subtitle">查看会话的完整执行轨迹：用户消息、AI 回复、工具调用与结果</p>
        </div>
      </div>

      <div className="trajectory-timeline">
        {nodes.map((node, _idx) => {
          const Icon = ROLE_ICON[node.type] || MessageSquare;
          const color = ROLE_COLOR[node.type] || 'var(--text-secondary)';
          const isExpanded = expandedId === node.id;
          const time = node.timestamp ? new Date(node.timestamp).toLocaleString('zh-CN') : '-';
          return (
            <div key={node.id} className="trajectory-node">
              <div className="trajectory-line" />
              <div className="trajectory-icon" style={{ background: `${color}20`, color }}>
                <Icon size={16} />
              </div>
              <div className="trajectory-card" style={{ borderColor: isExpanded ? color : undefined }}>
                <div className="trajectory-card-header" onClick={() => setExpandedId(isExpanded ? null : node.id)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="trajectory-title">{node.title}</span>
                    <span className={`tag ${node.type === 'user' ? 'info' : node.type === 'assistant' ? 'success' : node.type === 'toolResult' ? 'warning' : ''}`}>{node.type}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 12 }}>
                    <Clock size={12} />
                    {time}
                    <ChevronRight size={14} style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
                  </div>
                </div>
                {isExpanded && (
                  <div className="trajectory-card-body">
                    <div className="trajectory-summary">{node.summary}</div>
                    {node.artifacts?.length > 0 && (
                      <div className="trajectory-artifacts">
                        <div className="skill-detail-label">产物</div>
                        {node.artifacts.map((art, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                            <FileText size={14} />
                            {art.path || `artifact-${i}`}
                            {art.size ? ` (${(art.size / 1024).toFixed(1)} KB)` : ''}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default TrajectoryPage;
