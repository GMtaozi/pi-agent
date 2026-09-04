import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, X } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { getFriendlyMessage } from '../../lib/errors';

export default function PluginCreatePage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'tool' | 'workflow' | 'agent'>('tool');
  const [kind, setKind] = useState<'community' | 'official'>('community');
  const [category, setCategory] = useState('general');
  const [subcategory, setSubcategory] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private' | 'unlisted'>('private');
  const [minPlan, setMinPlan] = useState('free');
  const [manifestText, setManifestText] = useState('{\n  "name": "",\n  "description": "",\n  "code": "function(input) { return input; }",\n  "parameters": {}\n}');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!title.trim()) {
      setError('插件标题是必填项');
      return;
    }

    let parsedManifest: Record<string, unknown>;
    try {
      parsedManifest = JSON.parse(manifestText || '{}') as Record<string, unknown>;
    } catch {
      return setError('Manifest 必须是合法的 JSON');
    }

    setSaving(true);
    setError(null);
    try {
      const created = await apiFetch<{ ok: boolean; plugin: { id: string } }>('/v1/plugins', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          summary: summary.trim(),
          description: description.trim(),
          type,
          kind,
          category,
          subcategory: subcategory || undefined,
          visibility,
          manifest: parsedManifest,
          min_plan: minPlan,
        }),
      });
      navigate(`/plugins/${encodeURIComponent(created.plugin.id)}`);
    } catch (e) {
      setError(getFriendlyMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="skills-page">
      <div className="skills-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="settings-back-btn" onClick={() => navigate('/plugins')} title="返回市场">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>发布插件</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 14 }}>创建并发布你的插件到插件市场</p>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}><span>{error}</span><button onClick={() => setError(null)}><X size={16} /></button></div>}

      <div className="config-card" style={{ padding: 20, maxWidth: 720 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="form-item">
            <label className="form-label">插件标题 *</label>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="如：天气查询工具" />
          </div>
          <div className="form-item">
            <label className="form-label">分类</label>
            <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
              <option value="general">通用</option>
              <option value="developer">开发者</option>
              <option value="product">产品</option>
              <option value="analyst">分析师</option>
              <option value="automation">自动化</option>
              <option value="integration">集成</option>
              <option value="data">数据</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
          <div className="form-item">
            <label className="form-label">类型</label>
            <select className="input" value={type} onChange={e => setType(e.target.value as 'tool' | 'workflow' | 'agent')}>
              <option value="tool">工具</option>
              <option value="workflow">工作流</option>
              <option value="agent">智能体</option>
            </select>
          </div>
          <div className="form-item">
            <label className="form-label">来源</label>
            <select className="input" value={kind} onChange={e => setKind(e.target.value as 'community' | 'official')}>
              <option value="community">社区</option>
              <option value="official">官方</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
          <div className="form-item">
            <label className="form-label">可见性</label>
            <select className="input" value={visibility} onChange={e => setVisibility(e.target.value as 'public' | 'private' | 'unlisted')}>
              <option value="private">私有</option>
              <option value="unlisted">不公开列出</option>
              <option value="public">公开</option>
            </select>
          </div>
          <div className="form-item">
            <label className="form-label">最低套餐</label>
            <select className="input" value={minPlan} onChange={e => setMinPlan(e.target.value)}>
              <option value="free">免费版</option>
              <option value="pro">专业版</option>
              <option value="enterprise">企业版</option>
            </select>
          </div>
        </div>

        <div className="form-item" style={{ marginTop: 16 }}>
          <label className="form-label">子分类</label>
          <input className="input" value={subcategory} onChange={e => setSubcategory(e.target.value)} placeholder="可选" />
        </div>

        <div className="form-item" style={{ marginTop: 16 }}>
          <label className="form-label">简介</label>
          <input
            className="input"
            value={summary}
            onChange={e => setSummary(e.target.value)}
            placeholder="一句话描述插件功能"
          />
        </div>

        <div className="form-item" style={{ marginTop: 16 }}>
          <label className="form-label">详细描述</label>
          <textarea
            className="input"
            rows={3}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="这个插件做什么？适用于什么场景？"
            style={{ resize: 'vertical' }}
          />
        </div>

        <div className="form-item" style={{ marginTop: 16 }}>
          <label className="form-label">Manifest（JSON）*</label>
          <textarea
            className="input"
            rows={12}
            value={manifestText}
            onChange={e => setManifestText(e.target.value)}
            placeholder={'{\n  "name": "",\n  "description": "",\n  "code": "function(input) { return input; }",\n  "parameters": {}\n}'}
            style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
          />
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
            Manifest 包含 name、description、code（工具实现函数）、parameters（参数定义）等字段。
          </p>
        </div>

        <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
          <button className="btn btn-secondary" onClick={() => navigate('/plugins')}>
            取消
          </button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
            <Plus size={14} /> {saving ? '发布中...' : '发布插件'}
          </button>
        </div>
      </div>
    </div>
  );
}
