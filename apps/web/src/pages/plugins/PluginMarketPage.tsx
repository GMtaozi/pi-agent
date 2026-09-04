import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Sparkles, Download, Star, Plus, X, Puzzle, CheckCircle } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { getFriendlyMessage } from '../../lib/errors';

export interface MarketPlugin {
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
  'uncategorized': '未分类',
};

const TYPE_LABELS: Record<string, string> = {
  'tool': '工具',
  'workflow': '工作流',
  'agent': '智能体',
};

function getCategoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] || cat;
}

export default function PluginMarketPage() {
  const navigate = useNavigate();
  const [plugins, setPlugins] = useState<MarketPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [categories, setCategories] = useState<string[]>([]);
  const [sort, setSort] = useState<'newest' | 'downloads' | 'installs' | 'rating'>('newest');
  const [installing, setInstalling] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      apiFetch<MarketPlugin[]>(`/v1/plugins?sort=${sort}`),
      apiFetch<{ categories: string[] }>('/v1/plugins/categories'),
    ])
      .then(([pluginList, catData]) => {
        if (cancelled) return;
        setPlugins(pluginList || []);
        setCategories(catData?.categories || []);
      })
      .catch(err => {
        if (!cancelled) setError(getFriendlyMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [sort]);

  const filtered = plugins.filter(p => {
    const matchesQuery = !query || p.title.toLowerCase().includes(query.toLowerCase()) || (p.summary || '').toLowerCase().includes(query.toLowerCase()) || (p.description || '').toLowerCase().includes(query.toLowerCase());
    const matchesCategory = category === 'all' || p.category === category;
    const matchesType = typeFilter === 'all' || p.type === typeFilter;
    return matchesQuery && matchesCategory && matchesType;
  });

  const handleInstall = async (plugin: MarketPlugin) => {
    setInstalling(plugin.id);
    setError(null);
    try {
      await apiFetch(`/v1/plugins/${encodeURIComponent(plugin.id)}/install`, { method: 'POST' });
      setPlugins(prev => prev.map(p => p.id === plugin.id ? { ...p, install_count: p.install_count + 1 } : p));
    } catch (e) {
      setError(getFriendlyMessage(e));
    } finally {
      setInstalling(null);
    }
  };

  return (
    <div className="skills-page">
      <div className="skills-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>插件市场</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 14 }}>浏览、搜索并安装可复用的 AI 插件</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/plugins/new')}>
          <Plus size={14} /> 发布插件
        </button>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}><span>{error}</span><button onClick={() => setError(null)}><X size={16} /></button></div>}

      {/* 排序 tabs */}
      <div className="memory-tabs" style={{ marginBottom: 16 }}>
        <button className={`memory-tab ${sort === 'newest' ? 'active' : ''}`} onClick={() => setSort('newest')}>
          <Sparkles size={16} /> 最新
        </button>
        <button className={`memory-tab ${sort === 'downloads' ? 'active' : ''}`} onClick={() => setSort('downloads')}>
          <Download size={16} /> 热门
        </button>
        <button className={`memory-tab ${sort === 'installs' ? 'active' : ''}`} onClick={() => setSort('installs')}>
          <CheckCircle size={16} /> 安装最多
        </button>
        <button className={`memory-tab ${sort === 'rating' ? 'active' : ''}`} onClick={() => setSort('rating')}>
          <Star size={16} /> 评分最高
        </button>
      </div>

      {/* 分类标签页 */}
      <div className="category-tabs" style={{ marginBottom: 16 }}>
        <button className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>全部</button>
        {categories.map(cat => (
          <button key={cat} className={category === cat ? 'active' : ''} onClick={() => setCategory(cat)}>
            {getCategoryLabel(cat)}
          </button>
        ))}
      </div>

      {/* 类型筛选 */}
      <div className="category-tabs" style={{ marginBottom: 16 }}>
        <button className={typeFilter === 'all' ? 'active' : ''} onClick={() => setTypeFilter('all')}>全部类型</button>
        <button className={typeFilter === 'tool' ? 'active' : ''} onClick={() => setTypeFilter('tool')}>工具</button>
        <button className={typeFilter === 'workflow' ? 'active' : ''} onClick={() => setTypeFilter('workflow')}>工作流</button>
        <button className={typeFilter === 'agent' ? 'active' : ''} onClick={() => setTypeFilter('agent')}>智能体</button>
      </div>

      {/* 搜索 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            className="input"
            placeholder="搜索插件名称、描述..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ paddingLeft: 36 }}
          />
        </div>
      </div>

      {loading ? (
        <div className="settings-loading">加载插件...</div>
      ) : filtered.length === 0 ? (
        <div className="settings-empty" style={{ padding: '60px 0' }}>
          <Puzzle size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
          <h3 style={{ margin: '0 0 8px' }}>{query ? '没有匹配的插件' : '插件市场为空'}</h3>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{query ? '换个关键词试试' : '点击右上角发布第一个插件'}</p>
        </div>
      ) : (
        <div className="skills-grid">
          {filtered.map(plugin => (
            <div key={plugin.id} className="skill-card" onClick={() => navigate(`/plugins/${encodeURIComponent(plugin.id)}`)}>
              <div className="skill-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-color)', flexShrink: 0 }}>
                    <Puzzle size={20} />
                  </div>
                  <div>
                    <div className="skill-card-title">
                      {plugin.title}
                      {plugin.verified && <span style={{ marginLeft: 6, color: 'var(--accent-color)' }}><CheckCircle size={14} /></span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      v{plugin.version} · {plugin.kind === 'official' ? '官方' : plugin.kind === 'builtin' ? '内置' : '社区'}
                    </div>
                  </div>
                </div>
                {plugin.kind === 'official' && <span className="tag success">官方</span>}
                {plugin.kind === 'builtin' && <span className="tag info">内置</span>}
              </div>
              <p className="skill-card-desc">{plugin.summary || plugin.description}</p>
              <div className="skill-card-meta" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span className="tag">{TYPE_LABELS[plugin.type] || plugin.type}</span>
                <span className="tag">{getCategoryLabel(plugin.category)}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <Download size={12} /> {plugin.install_count || 0}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <Star size={12} /> {plugin.avg_rating || 0}
                  {plugin.rating_count ? ` (${plugin.rating_count})` : ''}
                </span>
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1, fontSize: 13 }}
                  disabled={installing === plugin.id}
                  onClick={(e) => { e.stopPropagation(); handleInstall(plugin); }}
                >
                  <Download size={14} /> {installing === plugin.id ? '安装中...' : '安装'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
