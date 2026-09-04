import { useState } from 'react';
import { GitBranch, Search } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { getFriendlyMessage } from '../../lib/errors';

interface Span {
  id: string;
  session_id: string;
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  operation: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  input: string;
  output: string;
}

interface SpanNode extends Span {
  children: SpanNode[];
  depth: number;
}

export default function TraceViewer() {
  const [traceId, setTraceId] = useState('');
  const [_spans, setSpans] = useState<Span[]>([]);
  const [tree, setTree] = useState<SpanNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTrace = async (id: string) => {
    if (!id.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch<{ items: Span[] }>(`/api/v1/observability/traces/${id}/spans`);
      const items = res.items || [];
      setSpans(items);
      setTree(buildTree(items));
    } catch (err) {
      setError(getFriendlyMessage(err));
      setSpans([]);
      setTree([]);
    } finally {
      setLoading(false);
    }
  };

  const buildTree = (spans: Span[]): SpanNode[] => {
    const nodeMap = new Map<string, SpanNode>();
    for (const span of spans) {
      nodeMap.set(span.span_id, { ...span, children: [], depth: 0 });
    }

    const roots: SpanNode[] = [];
    for (const node of nodeMap.values()) {
      if (node.parent_span_id && nodeMap.has(node.parent_span_id)) {
        const parent = nodeMap.get(node.parent_span_id)!;
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }

    // 设置深度
    const setDepth = (nodes: SpanNode[], depth: number) => {
      for (const node of nodes) {
        node.depth = depth;
        setDepth(node.children, depth + 1);
      }
    };
    setDepth(roots, 0);

    return roots;
  };

  const flattenTree = (nodes: SpanNode[]): SpanNode[] => {
    const result: SpanNode[] = [];
    const traverse = (nodeList: SpanNode[]) => {
      for (const node of nodeList) {
        result.push(node);
        traverse(node.children);
      }
    };
    traverse(nodes);
    return result;
  };

  const formatDuration = (start: string, end: string | null) => {
    if (!end) return '-';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  };

  const flatNodes = flattenTree(tree);

  return (
    <div className="page">
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>调用链追踪</h1>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Search size={18} />
          <input
            type="text"
            placeholder="输入 Trace ID 查询调用链"
            value={traceId}
            onChange={e => setTraceId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchTrace(traceId)}
            style={{
              flex: 1, padding: '8px 12px', border: '1px solid var(--border-color)',
              borderRadius: 6, background: 'var(--bg-input)', color: 'var(--text-primary)'
            }}
          />
          <button className="btn btn-primary" onClick={() => fetchTrace(traceId)} disabled={loading}>
            {loading ? '查询中...' : '查询'}
          </button>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}><span>{error}</span></div>}

      {flatNodes.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <GitBranch size={18} />
            <h2 style={{ fontSize: 18, fontWeight: 600 }}>Span 拓扑</h2>
            <span className="badge badge-default">{flatNodes.length} spans</span>
          </div>

          <div className="trace-tree">
            {flatNodes.map(node => (
              <div
                key={node.id}
                className="trace-node"
                style={{
                  marginLeft: node.depth * 24,
                  padding: '8px 12px',
                  borderLeft: '2px solid var(--border-color)',
                  background: node.depth % 2 === 0 ? 'var(--bg-subtle)' : 'transparent',
                  borderRadius: 4,
                  marginBottom: 4,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className={`badge ${node.status === 'completed' ? 'badge-success' : 'badge-warning'}`}>
                    {node.status}
                  </span>
                  <span style={{ fontWeight: 500 }}>{node.operation}</span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {node.span_id.slice(0, 8)}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
                    {formatDuration(node.started_at, node.ended_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {traceId && !loading && flatNodes.length === 0 && !error && (
        <div className="card">
          <div className="settings-empty">未找到该 Trace ID 对应的调用链</div>
        </div>
      )}
    </div>
  );
}
