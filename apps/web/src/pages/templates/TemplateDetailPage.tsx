import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Star, Share2, Clock, Tag, X } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { getFriendlyMessage } from '../../lib/errors';

interface TemplateVersion {
  id: string;
  version: string;
  changelog: string | null;
  created_by: string | null;
  created_at: string;
}

interface TemplateDetail {
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
  versions: TemplateVersion[];
}

const CATEGORY_LABELS: Record<string, string> = {
  'general': '通用',
  'legal': '法律',
  'medical': '医疗',
  'finance': '金融',
  'customer_service': '客服',
  'education': '教育',
};

function getCategoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] || cat;
}

export default function TemplateDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRating, setUserRating] = useState(0);
  const [comment, setComment] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch<TemplateDetail>(`/templates/${encodeURIComponent(id)}`)
      .then(data => {
        if (cancelled) return;
        setTemplate(data);
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
    try {
      await apiFetch(`/templates/${encodeURIComponent(id)}/install`, { method: 'POST' });
      if (template) {
        setTemplate({ ...template, installCount: template.installCount + 1 });
      }
    } catch (e) {
      setError(getFriendlyMessage(e));
    }
  };

  const handleRate = async () => {
    if (!id || userRating < 1) return;
    try {
      const result = await apiFetch<{ ok: boolean; rating: number; ratingCount: number }>(
        `/templates/${encodeURIComponent(id)}/rate`,
        { method: 'POST', body: JSON.stringify({ rating: userRating, comment }) }
      );
      if (template) {
        setTemplate({ ...template, rating: result.rating, ratingCount: result.ratingCount });
      }
      setUserRating(0);
      setComment('');
    } catch (e) {
      setError(getFriendlyMessage(e));
    }
  };

  const handleShare = async () => {
    if (!id) return;
    try {
      const result = await apiFetch<{ ok: boolean; shareLink: { token: string } }>(
        `/templates/${encodeURIComponent(id)}/share`,
        { method: 'POST', body: JSON.stringify({ permissions: ['read'] }) }
      );
      setShareLink(result.shareLink.token);
    } catch (e) {
      setError(getFriendlyMessage(e));
    }
  };

  if (loading) return <div className="settings-loading">加载模板详情...</div>;
  if (error) return <div className="error-banner"><span>{error}</span><button onClick={() => setError(null)}><X size={16} /></button></div>;
  if (!template) return <div className="settings-empty">模板不存在</div>;

  return (
    <div className="skills-page">
      <div className="skills-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="settings-back-btn" onClick={() => navigate('/templates')} title="返回市场">
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{template.name}</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 14 }}>
            v{template.version} · {getCategoryLabel(template.category)} · {template.tenant_id === 'system' ? '官方模板' : '自定义模板'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={handleShare}>
            <Share2 size={14} /> 分享
          </button>
          <button className="btn btn-primary" onClick={handleInstall}>
            <Download size={14} /> 安装
          </button>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}><span>{error}</span><button onClick={() => setError(null)}><X size={16} /></button></div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>
        {/* 左侧：详情内容 */}
        <div>
          <div className="config-card" style={{ padding: 20, marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>描述</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {template.description || '暂无描述'}
            </p>
          </div>

          <div className="config-card" style={{ padding: 20, marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>模板内容</h3>
            <pre style={{ margin: 0, padding: 12, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', fontSize: 13, overflow: 'auto', maxHeight: 400 }}>
              {JSON.stringify(template.content, null, 2)}
            </pre>
          </div>

          {/* 版本历史 */}
          {template.versions && template.versions.length > 0 && (
            <div className="config-card" style={{ padding: 20 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>版本历史</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {template.versions.map(v => (
                  <div key={v.id} style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600 }}>v{v.version}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        <Clock size={12} style={{ verticalAlign: 'middle' }} /> {new Date(v.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {v.changelog && <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>{v.changelog}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 右侧：元信息 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="config-card" style={{ padding: 20 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>统计信息</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>安装量</span>
                <span style={{ fontWeight: 600 }}>{template.installCount}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>平均评分</span>
                <span style={{ fontWeight: 600 }}>
                  <Star size={14} style={{ verticalAlign: 'middle', color: '#f59f00' }} /> {template.rating.toFixed(1)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>评分人数</span>
                <span style={{ fontWeight: 600 }}>{template.ratingCount}</span>
              </div>
            </div>
          </div>

          <div className="config-card" style={{ padding: 20 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>标签</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {template.tags.map(tag => (
                <span key={tag} className="tag info">
                  <Tag size={12} /> {tag}
                </span>
              ))}
            </div>
          </div>

          {/* 评分区域 */}
          <div className="config-card" style={{ padding: 20 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>我要评分</h3>
            <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => setUserRating(n)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  <Star size={24} fill={n <= userRating ? '#f59f00' : 'none'} color={n <= userRating ? '#f59f00' : 'var(--text-secondary)'} />
                </button>
              ))}
            </div>
            <textarea
              className="input"
              rows={3}
              placeholder="写下你的评价（可选）..."
              value={comment}
              onChange={e => setComment(e.target.value)}
              style={{ resize: 'vertical', marginBottom: 12 }}
            />
            <button className="btn btn-primary" onClick={handleRate} disabled={userRating < 1}>
              提交评分
            </button>
          </div>
        </div>
      </div>

      {/* 分享弹窗 */}
      {showShareModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="config-card" style={{ padding: 24, maxWidth: 480, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>分享链接</h3>
              <button onClick={() => setShowShareModal(false)}><X size={18} /></button>
            </div>
            {shareLink ? (
              <div>
                <p style={{ marginBottom: 8 }}>复制以下链接分享给他人：</p>
                <input className="input" value={`${window.location.origin}/share/${shareLink}`} readOnly />
              </div>
            ) : (
              <button className="btn btn-primary" onClick={handleShare}>生成分享链接</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
