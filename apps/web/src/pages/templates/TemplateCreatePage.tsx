import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, X } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { getFriendlyMessage } from '../../lib/errors';

export default function TemplateCreatePage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [contentText, setContentText] = useState('{\n  \n}');
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addTag = () => {
    const value = newTag.trim();
    if (value && !tags.includes(value)) {
      setTags([...tags, value]);
    }
    setNewTag('');
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('模板名称是必填项');
      return;
    }

    let parsedContent: Record<string, unknown>;
    try {
      parsedContent = JSON.parse(contentText || '{}') as Record<string, unknown>;
    } catch {
      return setError('模板内容必须是合法的 JSON');
    }

    setSaving(true);
    setError(null);
    try {
      const created = await apiFetch<{ ok: boolean; template: { id: string } }>('/templates', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          category,
          tags,
          content: parsedContent,
          is_public: isPublic,
        }),
      });
      navigate(`/templates/${encodeURIComponent(created.template.id)}`);
    } catch (e) {
      setError(getFriendlyMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="skills-page">
      <div className="skills-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="settings-back-btn" onClick={() => navigate('/templates')} title="返回市场">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>创建模板</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 14 }}>定义模板内容，发布到模板市场供他人使用</p>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}><span>{error}</span><button onClick={() => setError(null)}><X size={16} /></button></div>}

      <div className="config-card" style={{ padding: 20, maxWidth: 720 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="form-item">
            <label className="form-label">模板名称 *</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="如：法律顾问助手" />
          </div>
          <div className="form-item">
            <label className="form-label">分类</label>
            <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
              <option value="general">通用</option>
              <option value="legal">法律</option>
              <option value="medical">医疗</option>
              <option value="finance">金融</option>
              <option value="customer_service">客服</option>
              <option value="education">教育</option>
              <option value="developer">开发者</option>
              <option value="product">产品</option>
              <option value="analyst">分析师</option>
              <option value="writing">写作</option>
              <option value="research">研究</option>
            </select>
          </div>
        </div>

        <div className="form-item" style={{ marginTop: 16 }}>
          <label className="form-label">描述</label>
          <textarea
            className="input"
            rows={3}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="这个模板做什么？适用于什么场景？"
            style={{ resize: 'vertical' }}
          />
        </div>

        <div className="form-item" style={{ marginTop: 16 }}>
          <label className="form-label">标签</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {tags.map(t => (
              <span key={t} className="tag info" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {t}
                <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }} onClick={() => setTags(tags.filter(x => x !== t))}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addTag(); }} placeholder="输入标签并回车" />
            <button className="btn btn-secondary" onClick={addTag}><Plus size={14} /> 添加</button>
          </div>
        </div>

        <div className="form-item" style={{ marginTop: 16 }}>
          <label className="form-label">模板内容（JSON）*</label>
          <textarea
            className="input"
            rows={12}
            value={contentText}
            onChange={e => setContentText(e.target.value)}
            placeholder={'{\n  "systemPrompt": "你是一个...",\n  "tools": [],\n  "config": {}\n}'}
            style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
          />
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
            模板内容包含 systemPrompt、tools、config 等字段，用于定义 Agent 的行为。
          </p>
        </div>

        <div className="form-item" style={{ marginTop: 16 }}>
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={isPublic}
              onChange={e => setIsPublic(e.target.checked)}
            />
            公开模板（所有人可见）
          </label>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
            {saving ? '创建中...' : '发布模板'}
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/templates')} disabled={saving}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
