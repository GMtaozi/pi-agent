import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Star, Clock, Tag, X, Puzzle, CheckCircle, Play } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { getFriendlyMessage } from '../../lib/errors';

interface PluginVersion {
  id: string;
  version: string;
  changelog: string | null;
  yanked: boolean;
  created_by: string | null;
  created_at: string;
}

interface PluginDetail {
  id: string;
  tenant_id: string;
  publisher_id: string | null;
  type: 'tool' | 'workflow' | 'agent';
  kind: 'builtin' | 'community' | 'official';
  title: string;
  summary: string | null;
  description: string | null;
  category: string;
  subcategory: string | null;
  cover_image: string | null;
  version: string;
  current_version: string;
  manifest: Record<string, unknown>;
  visibility: 'public' | 'private' | 'unlisted';
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'suspended';
  verified: boolean;
  min_plan: string;
  download_count: number;
  install_count: number;
  avg_rating: number;
  rating_count: number;
  created_at: string;
  updated_at: string;
  versions: PluginVersion[];
}

const CATEGORY_LABELS: Record<string, string> = {
  'general': '通用',
  'developer': '开发者',
  'product': '产品',
  'analyst': '分析师',
  'writing': '写作',
  'research': '研究',
  'automation': '自动化',
  'integration': '集成',
  'data': '数据',
};

const TYPE_LABELS: Record<string, string> = {
  'tool': '工具',
  'workflow': '工作流',
  'agent': '智能体',
};

function getCategoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] || cat;
}

export default function PluginDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [plugin, setPlugin] = useState<PluginDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRating, setUserRating] = useState(0);
  const [comment, setComment] = useState('');
  const [installing, setInstalling] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState<{ ok: boolean; output?: unknown; error?: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch<PluginDetail>(`/v1/plugins/${encodeURIComponent(id)}`)
      .then(data => {
        if (cancelled) return;
        setPlugin(data);
      })
      .catch(err => {
        if (!cancelled) setError(getFriendlyMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  const handleInstall = async () => {
    if (!id) return;
    setInstalling(true);
    setError(null);
    try {
      await apiFetch(`/v1/plugins/${encodeURIComponent(id)}/install`, { method: 'POST' });
      if (plugin) {
        setPlugin({ ...plugin, install_count: plugin.install_count + 1 });
      }
    } catch (e) {
      setError(getFriendlyMessage(e));
    } finally {
      setInstalling(false);
    }
  };

  const handleRate = async () => {
    if (!id || userRating < 1) return;
    try {
      const result = await apiFetch<{ ok: boolean; rating: number; ratingCount: number }>(
        `/v1/plugins/${encodeURIComponent(id)}/reviews`,
        { method: 'POST', body: JSON.stringify({ rating: userRating, comment }) }
      );
      if (plugin) {
        setPlugin({ ...plugin, avg_rating: result.rating, rating_count: result.ratingCount });
      }
      setUserRating(0);
      setComment('');
    } catch (e) {
      setError(getFriendlyMessage(e));
    }
  };

  const handleExecute = async () => {
    if (!id) return;
    setExecuting(true);
    setExecResult(null);
    setError(null);
    try {
      const result = await apiFetch<{ ok: boolean; output?: unknown; error?: string }>(
        `/v1/plugins/${encodeURIComponent(id)}/execute`,
        { method: 'POST', body: JSON.stringify({ params: {} }) }
      );
      setExecResult(result);
    } catch (e) {
      setError(getFriendlyMessage(e));
    } finally {
      setExecuting(false);
    }
  };

  if (loading) return <div className="settings-loading">加载插件详情...</div>;
  if (error) return <div className="error-banner"><span>{error}</span><button onClick={() => setError(null)}><X size={16} /></button></div>;
  if (!plugin) return <div className="settings-empty">插件不存在</div>;

  return (
    <div className="skills-page">
      <div className="skills-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="settings-back-btn" onClick={() => navigate('/plugins')} title="返回市场">
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>
            {plugin.title}
            {plugin.verified && <span style={{ marginLeft: 8, color: 'var(--accent-color)' }}><CheckCircle size={18} /></span>}
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 14 }}>
            v{plugin.version} · {TYPE_LABELS[plugin.type] || plugin.type} · {getCategoryLabel(plugin.category)} · {plugin.kind === 'official' ? '官方' : plugin.kind === 'builtin' ? '内置' : '社区'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {plugin.type === 'tool' && (
            <button className="btn btn-secondary" onClick={handleExecute} disabled={executing}>
              <Play size={14} /> {executing ? '执行中...' : '执行'}
            </button>
          )}
          <button className="btn btn-primary" onClick={handleInstall} disabled={installing}>
            <Download size={14} /> {installing ? '安装中...' : '安装'}
          </button>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}><span>{error}</span><button onClick={() => setError(null)}><X size={16} /></button></div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>
        {/* 左侧：详情内容 */}
        <div>
          {/* 执行结果 */}
          {execResult && (
            <div className="config-card" style={{ padding: 16, marginBottom: 16, borderLeft: `3px solid ${execResult.ok ? 'var(--success-color, #22c55e)' : 'var(--error-color, #ef4444)'}` }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>执行结果</h4>
              <pre style={{ margin: 0, padding: 12, background: 'var(--bg-secondary)', borderRadius: 6, fontSize: 12, overflow: 'auto', maxHeight: 200 }}>
                {execResult.ok ? JSON.stringify(execResult.output, null, 2) : execResult.error}
              </pre>
            </div>
          )}

          <div className="config-card" style={{ padding: 20, marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>描述</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {plugin.description || plugin.summary || '暂无描述'}
            </p>
          </div>

          {/* Manifest 信息 */}
          <div className="config-card" style={{ padding: 20, marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Manifest</h3>
            <pre style={{ margin: 0, padding: 12, background: 'var(--bg-secondary)', borderRadius: 6, fontSize: 12, overflow: 'auto', maxHeight: 300 }}>
              {JSON.stringify(plugin.manifest, null, 2)}
            </pre>
          </div>

          {/* 版本历史 */}
          {plugin.versions && plugin.versions.length > 0 && (
            <div className="config-card" style={{ padding: 20 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>版本历史</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {plugin.versions.map(v => (
                  <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                    <div>
                      <span style={{ fontWeight: 500 }}>v{v.version}</span>
                      {v.changelog && <span style={{ marginLeft: 8, color: 'var(--text-secondary)', fontSize: 13 }}>{v.changelog}</span>}
                      {v.yanked && <span className="tag" style={{ marginLeft: 8 }}>已撤回</span>}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {new Date(v.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 右侧：元信息 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="config-card" style={{ padding: 16 }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>统计</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>安装量</span>
                <span style={{ fontWeight: 500 }}>{plugin.install_count}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>下载量</span>
                <span style={{ fontWeight: 500 }}>{plugin.download_count}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>评分</span>
                <span style={{ fontWeight: 500 }}>
                  <Star size={12} style={{ verticalAlign: 'middle' }} /> {plugin.avg_rating} ({plugin.rating_count})
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>最低套餐</span>
                <span style={{ fontWeight: 500 }}>{plugin.min_plan}</span>
              </div>
            </div>
          </div>

          <div className="config-card" style={{ padding: 16 }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>评分</h4>
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  onClick={() => setUserRating(n)}
                >
                  <Star size={20} fill={n <= userRating ? 'var(--accent-color)' : 'none'} color={n <= userRating ? 'var(--accent-color)' : 'var(--text-secondary)'} />
                </button>
              ))}
            </div>
            <textarea
              className="input"
              rows={2}
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="写下你的评价..."
              style={{ fontSize: 13, resize: 'vertical' }}
            />
            <button className="btn btn-primary" style={{ marginTop: 8, width: '100%' }} onClick={handleRate} disabled={userRating < 1}>
              提交评分
            </button>
          </div>

          <div className="config-card" style={{ padding: 16 }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>信息</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={14} color="var(--text-secondary)" />
                <span>创建于 {new Date(plugin.created_at).toLocaleDateString()}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Puzzle size={14} color="var(--text-secondary)" />
                <span>{TYPE_LABELS[plugin.type]}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Tag size={14} color="var(--text-secondary)" />
                <span>{getCategoryLabel(plugin.category)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
