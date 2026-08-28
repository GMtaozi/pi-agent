import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { getFriendlyMessage } from '../lib/errors';

interface _ManifestField {
  key: string;
  value: string;
}

export default function SkillNewPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [changelog, setChangelog] = useState('');
  const [author, setAuthor] = useState('');
  const [category, setCategory] = useState('general');
  const [prompt, setPrompt] = useState('');
  const [toolCode, setToolCode] = useState('');
  const [capabilities, setCapabilities] = useState<string[]>(['general']);
  const [tools, setTools] = useState<string[]>([]);
  const [configText, setConfigText] = useState('{\n  \n}');
  const [newCapability, setNewCapability] = useState('');
  const [newTool, setNewTool] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addCapability = () => {
    const value = newCapability.trim().toLowerCase();
    if (value && !capabilities.includes(value)) {
      setCapabilities([...capabilities, value]);
    }
    setNewCapability('');
  };

  const addTool = () => {
    const value = newTool.trim();
    if (value && !tools.includes(value)) {
      setTools([...tools, value]);
    }
    setNewTool('');
  };

  const handleCreate = async () => {
    if (!name.trim() || !prompt.trim()) {
      setError('技能名称和提示词是必填项');
      return;
    }

    let parsedConfig: Record<string, unknown>;
    try {
      parsedConfig = JSON.parse(configText || '{}') as Record<string, unknown>;
    } catch {
      setError('配置必须是合法的 JSON');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const created = await apiFetch<{ ok: boolean; id: string }>('/skills', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          version: version.trim() || '1.0.0',
          changelog: changelog.trim(),
          author: author.trim(),
          category,
          code: toolCode.trim() || undefined,
          manifest: {
            capabilities,
            tools,
            prompt,
            config: parsedConfig,
          },
        }),
      });
      navigate(`/skills/${encodeURIComponent(created.id)}`);
    } catch (e) {
      setError(getFriendlyMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="skills-page">
      <div className="skills-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="settings-back-btn" onClick={() => navigate('/skills')} title="返回市场">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>创建技能</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 14 }}>定义技能清单（manifest）、提示词与工具，发布到技能市场</p>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}><span>{error}</span><button onClick={() => setError(null)}><X size={16} /></button></div>}

      <div className="config-card" style={{ padding: 20, maxWidth: 720 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="form-item">
            <label className="form-label">技能名称 *</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="如：PR 审查助手" />
          </div>
          <div className="form-item">
            <label className="form-label">版本</label>
            <input className="input" value={version} onChange={e => setVersion(e.target.value)} placeholder="1.0.0" />
          </div>
          <div className="form-item">
            <label className="form-label">作者</label>
            <input className="input" value={author} onChange={e => setAuthor(e.target.value)} placeholder="你的名字" />
          </div>
          <div className="form-item">
            <label className="form-label">分类</label>
            <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
              <option value="general">通用</option>
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
          <input className="input" value={description} onChange={e => setDescription(e.target.value)} placeholder="这个技能做什么？" />
        </div>

        <div className="form-item" style={{ marginTop: 16 }}>
          <label className="form-label">变更日志（首版说明）</label>
          <textarea
            className="input"
            rows={2}
            value={changelog}
            onChange={e => setChangelog(e.target.value)}
            placeholder="这个版本实现了什么？"
            style={{ resize: 'vertical' }}
          />
        </div>

        <div className="form-item" style={{ marginTop: 16 }}>
          <label className="form-label">提示词（system prompt）*</label>
          <textarea
            className="input"
            rows={6}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="你是一个资深专家，当用户请求时你将..."
            style={{ resize: 'vertical' }}
          />
        </div>

        <div className="form-item" style={{ marginTop: 16 }}>
          <label className="form-label">能力标签</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {capabilities.map(c => (
              <span key={c} className="tag info" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {c}
                <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }} onClick={() => setCapabilities(capabilities.filter(x => x !== c))}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" value={newCapability} onChange={e => setNewCapability(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addCapability(); }} placeholder="输入能力并回车" />
            <button className="btn btn-secondary" onClick={addCapability}><Plus size={14} /> 添加</button>
          </div>
        </div>

        <div className="form-item" style={{ marginTop: 16 }}>
          <label className="form-label">可用工具</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {tools.map(t => (
              <span key={t} className="tag success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {t}
                <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }} onClick={() => setTools(tools.filter(x => x !== t))}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" value={newTool} onChange={e => setNewTool(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addTool(); }} placeholder="如：read_file, bash, web_search" />
            <button className="btn btn-secondary" onClick={addTool}><Plus size={14} /> 添加</button>
          </div>
        </div>

        <div className="form-item" style={{ marginTop: 16 }}>
          <label className="form-label">沙箱工具代码（可选）</label>
          <textarea
            className="input"
            rows={6}
            value={toolCode}
            onChange={e => setToolCode(e.target.value)}
            placeholder={'async (input) => {\n  const text = await sandboxFs.readFile("data.txt");\n  console.log("处理:", input);\n  return { length: text.length };\n}'}
            style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
          />
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
            在隔离沙箱中执行：无网络与系统访问；可用 console 与只读的 sandboxFs.readFile / listDir（限技能数据目录）。超时 30s、内存上限 64MB。
          </p>
        </div>

        <div className="form-item" style={{ marginTop: 16 }}>
          <label className="form-label">配置（JSON）</label>
          <textarea
            className="input"
            rows={4}
            value={configText}
            onChange={e => setConfigText(e.target.value)}
            style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
            {saving ? '创建中...' : '发布技能'}
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/skills')} disabled={saving}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
