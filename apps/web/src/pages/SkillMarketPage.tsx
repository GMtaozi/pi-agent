import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Sparkles, Download, Star, Plus, X, Flame } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { getFriendlyMessage } from '../lib/errors';

export interface MarketSkill {
  id: string;
  name: string;
  description: string;
  version: string;
  currentVersion?: string;
  author: string;
  enabled: boolean;
  capabilities: string[];
  tools: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  config?: any;
  prompt?: string;
  source: string;
  downloads: number;
  rating: number;
  ratingCount?: number;
  category: string;
  createdAt?: string;
  updatedAt?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  'general': '通用',
  'developer': '开发者',
  'product': '产品',
  'analyst': '分析师',
  'writing': '写作',
  'research': '研究',
  'uncategorized': '未分类',
};

function getCategoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] || cat;
}

export default function SkillMarketPage() {
  const navigate = useNavigate();
  const [skills, setSkills] = useState<MarketSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [categories, setCategories] = useState<string[]>([]);
  const [sort, setSort] = useState<'downloads' | 'rating' | 'newest'>('downloads');
  const [_togglingId, setTogglingId] = useState<string | null>(null);
  const [usageMap, setUsageMap] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      apiFetch<MarketSkill[]>(`/skills?sort=${sort}`),
      apiFetch<{ categories: string[] }>('/skills/categories'),
      apiFetch<Array<{ skillId: string; calls: number }>>('/skills/stats/top?limit=100').catch(() => []),
    ])
      .then(([skillList, catData, topStats]) => {
        if (cancelled) return;
        setSkills(skillList || []);
        setCategories(catData?.categories || []);
        const map: Record<string, number> = {};
        for (const row of topStats || []) map[row.skillId] = row.calls;
        setUsageMap(map);
      })
      .catch(err => {
        if (!cancelled) setError(getFriendlyMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [sort]);

  const filtered = skills.filter(s => {
    const matchesQuery = !query || s.name.toLowerCase().includes(query.toLowerCase()) || (s.description || '').toLowerCase().includes(query.toLowerCase());
    const matchesCategory = category === 'all' || s.category === category;
    return matchesQuery && matchesCategory;
  });

  const toggleSkill = async (skill: MarketSkill) => {
    setTogglingId(skill.id);
    setError(null);
    try {
      const updated = await apiFetch<MarketSkill>(`/skills/${encodeURIComponent(skill.id)}/toggle`, { method: 'PATCH' });
      setSkills(prev => prev.map(s => s.id === skill.id ? { ...s, enabled: updated.enabled } : s));
    } catch (e) {
      setError(getFriendlyMessage(e));
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="skills-page">
      <div className="skills-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>技能市场</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 14 }}>浏览、搜索并安装可复用的 Agent 技能</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/skills/new')}>
          <Plus size={14} /> 创建技能
        </button>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}><span>{error}</span><button onClick={() => setError(null)}><X size={16} /></button></div>}

      {/* 排行榜 tabs */}
      <div className="memory-tabs" style={{ marginBottom: 16 }}>
        <button className={`memory-tab ${sort === 'downloads' ? 'active' : ''}`} onClick={() => setSort('downloads')}>
          <Download size={16} /> 热门
        </button>
        <button className={`memory-tab ${sort === 'rating' ? 'active' : ''}`} onClick={() => setSort('rating')}>
          <Star size={16} /> 评分最高
        </button>
        <button className={`memory-tab ${sort === 'newest' ? 'active' : ''}`} onClick={() => setSort('newest')}>
          <Sparkles size={16} /> 最新
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

      {/* 搜索 + 排序 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            className="input"
            placeholder="搜索技能名称或描述..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ paddingLeft: 36 }}
          />
        </div>
      </div>

      {loading ? (
        <div className="settings-loading">加载技能...</div>
      ) : filtered.length === 0 ? (
        <div className="settings-empty" style={{ padding: '60px 0' }}>
          <Sparkles size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
          <h3 style={{ margin: '0 0 8px' }}>{query ? '没有匹配的技能' : '技能市场为空'}</h3>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{query ? '换个关键词试试' : '点击右上角创建第一个技能'}</p>
        </div>
      ) : (
        <div className="skills-grid">
          {filtered.map(skill => (
            <div key={skill.id} className="skill-card" onClick={() => navigate(`/skills/${encodeURIComponent(skill.id)}`)}>
              <div className="skill-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-color)', flexShrink: 0 }}>
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <div className="skill-card-title">{skill.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{skill.version} · {skill.author || 'unknown'}</div>
                  </div>
                </div>
                <div className={`toggle ${skill.enabled ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); toggleSkill(skill); }} title={skill.enabled ? '点击停用' : '点击启用'}>
                  <div className="knob" />
                </div>
              </div>
              <p className="skill-card-desc">{skill.description}</p>
              <div className="skill-card-meta" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {(skill.capabilities || []).slice(0, 3).map(cap => (
                  <span key={cap} className="tag info">{cap}</span>
                ))}
                <span className="tag">{getCategoryLabel(skill.category)}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <Download size={12} /> {skill.downloads || 0}
                </span>
                {(usageMap[skill.id] || 0) > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#e8590c' }}>
                    <Flame size={12} /> {usageMap[skill.id]} 次调用
                  </span>
                )}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <Star size={12} /> {skill.rating || 0}
                  {skill.ratingCount ? ` (${skill.ratingCount})` : ''}
                </span>
                {skill.source === 'market' && <span className="tag success">市场</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
