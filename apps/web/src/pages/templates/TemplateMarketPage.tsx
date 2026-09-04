import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Sparkles, Download, Star, Plus, X, Package } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { getFriendlyMessage } from '../../lib/errors';

export interface MarketTemplate {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  category: string;
  tags: string[];
  content: Record<string, unknown>;
  version: string;
  is_public: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  rating: number;
  ratingCount: number;
  installCount: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  'general': '通用',
  'legal': '法律',
  'medical': '医疗',
  'finance': '金融',
  'customer_service': '客服',
  'education': '教育',
  'developer': '开发者',
  'product': '产品',
  'analyst': '分析师',
  'writing': '写作',
  'research': '研究',
};

function getCategoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] || cat;
}

export default function TemplateMarketPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<MarketTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [categories, setCategories] = useState<string[]>([]);
  const [sort, setSort] = useState<'newest' | 'rating' | 'installs'>('newest');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      apiFetch<MarketTemplate[]>(`/templates?sort=${sort}`),
      apiFetch<{ categories: string[] }>('/templates/categories'),
    ])
      .then(([templateList, catData]) => {
        if (cancelled) return;
        setTemplates(templateList || []);
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

  const filtered = templates.filter(s => {
    const matchesQuery = !query || s.name.toLowerCase().includes(query.toLowerCase()) || (s.description || '').toLowerCase().includes(query.toLowerCase());
    const matchesCategory = category === 'all' || s.category === category;
    return matchesQuery && matchesCategory;
  });

  const handleInstall = async (template: MarketTemplate) => {
    try {
      await apiFetch(`/templates/${encodeURIComponent(template.id)}/install`, { method: 'POST' });
      setTemplates(prev => prev.map(t => t.id === template.id ? { ...t, installCount: t.installCount + 1 } : t));
    } catch (e) {
      setError(getFriendlyMessage(e));
    }
  };

  return (
    <div className="skills-page">
      <div className="skills-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>模板市场</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 14 }}>浏览、搜索并安装预置行业方案模板</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/templates/new')}>
          <Plus size={14} /> 创建模板
        </button>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}><span>{error}</span><button onClick={() => setError(null)}><X size={16} /></button></div>}

      {/* 排序 tabs */}
      <div className="memory-tabs" style={{ marginBottom: 16 }}>
        <button className={`memory-tab ${sort === 'newest' ? 'active' : ''}`} onClick={() => setSort('newest')}>
          <Sparkles size={16} /> 最新
        </button>
        <button className={`memory-tab ${sort === 'rating' ? 'active' : ''}`} onClick={() => setSort('rating')}>
          <Star size={16} /> 评分最高
        </button>
        <button className={`memory-tab ${sort === 'installs' ? 'active' : ''}`} onClick={() => setSort('installs')}>
          <Download size={16} /> 安装最多
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

      {/* 搜索 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            className="input"
            placeholder="搜索模板名称或描述..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ paddingLeft: 36 }}
          />
        </div>
      </div>

      {loading ? (
        <div className="settings-loading">加载模板...</div>
      ) : filtered.length === 0 ? (
        <div className="settings-empty" style={{ padding: '60px 0' }}>
          <Package size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
          <h3 style={{ margin: '0 0 8px' }}>{query ? '没有匹配的模板' : '模板市场为空'}</h3>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{query ? '换个关键词试试' : '点击右上角创建第一个模板'}</p>
        </div>
      ) : (
        <div className="skills-grid">
          {filtered.map(template => (
            <div key={template.id} className="skill-card" onClick={() => navigate(`/templates/${encodeURIComponent(template.id)}`)}>
              <div className="skill-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-color)', flexShrink: 0 }}>
                    <Package size={20} />
                  </div>
                  <div>
                    <div className="skill-card-title">{template.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>v{template.version} · {template.tenant_id === 'system' ? '官方' : (template.created_by || 'unknown')}</div>
                  </div>
                </div>
                {template.is_public && template.tenant_id === 'system' && (
                  <span className="tag success">官方</span>
                )}
              </div>
              <p className="skill-card-desc">{template.description}</p>
              <div className="skill-card-meta" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {(template.tags || []).slice(0, 3).map(tag => (
                  <span key={tag} className="tag info">{tag}</span>
                ))}
                <span className="tag">{getCategoryLabel(template.category)}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <Download size={12} /> {template.installCount || 0}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <Star size={12} /> {template.rating || 0}
                  {template.ratingCount ? ` (${template.ratingCount})` : ''}
                </span>
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1, fontSize: 13 }}
                  onClick={(e) => { e.stopPropagation(); handleInstall(template); }}
                >
                  <Download size={14} /> 安装
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
