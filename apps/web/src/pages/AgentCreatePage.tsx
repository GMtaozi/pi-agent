import { useState, useRef, useEffect } from 'react';
import { Sparkles, Save, Play, Edit3, ChevronRight, Bot, Wand2, Loader2 } from 'lucide-react';
import { generateAgent, updateAgent, type AgentConfig } from '../lib/api';

const TEMPLATES = [
  { icon: '🎧', label: '客服助手', desc: '自动回复客户咨询' },
  { icon: '✍️', label: '内容创作', desc: '生成高质量文案' },
  { icon: '💻', label: '代码助手', desc: '编写和调试代码' },
  { icon: '📊', label: '数据分析', desc: '分析数据生成报告' },
  { icon: '🎓', label: '教学助手', desc: '个性化学习辅导' },
  { icon: '🤖', label: '通用助手', desc: '多功能AI助手' },
];

export default function AgentCreatePage() {
  const [description, setDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [generated, setGenerated] = useState<AgentConfig | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // SSE streaming generation
  const handleGenerate = async () => {
    if (!description.trim()) return;
    setGenerating(true);
    setError(null);
    setGenerated(null);
    setStreamText('');

    try {
      const url = `/api/agents/stream?description=${encodeURIComponent(description.trim())}`;
      const response = await fetch(url, {
        headers: { Accept: 'text/event-stream' },
      });

      if (!response.ok) throw new Error('生成失败');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'token') {
                setStreamText(prev => prev + event.data.text);
              } else if (event.type === 'config') {
                const config = event.data;
                setGenerated({
                  id: '',
                  name: config.name,
                  description: config.description,
                  systemPrompt: config.systemPrompt,
                  model: config.model,
                  provider: config.provider,
                  temperature: config.temperature,
                  maxTokens: config.maxTokens,
                  tools: JSON.stringify(config.tools),
                  icon: config.icon,
                  status: 'draft',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                });
                setEditing(true);
              } else if (event.type === 'status') {
                setStreamText(prev => prev + `\n[${event.data.message}]\n`);
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      // Fallback to non-streaming
      try {
        const agent = await generateAgent(description.trim());
        setGenerated(agent);
        setEditing(true);
      } catch (fallbackErr) {
        setError(fallbackErr instanceof Error ? fallbackErr.message : '生成失败，请重试');
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async (status: 'draft' | 'active' = 'draft') => {
    if (!generated) return;
    setSaving(true);
    try {
      const updated = await updateAgent(generated.id, { ...generated, status });
      setGenerated(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleTemplateClick = (label: string) => {
    const prompts: Record<string, string> = {
      '客服助手': '我需要一个能自动回复客户咨询的客服助手，语气要亲切专业，能够处理常见问题',
      '内容创作': '我需要一个能帮我创作高质量文案的助手，包括小红书、公众号等平台的内容',
      '代码助手': '我需要一个能帮我编写和调试代码的助手，支持多种编程语言',
      '数据分析': '我需要一个能分析数据并生成可视化报告的助手',
      '教学助手': '我需要一个能提供个性化教学辅导的助手，能根据学生水平调整内容',
      '通用助手': '我需要一个多功能的AI助手，能帮我处理各种日常任务',
    };
    setDescription(prompts[label] || '');
  };

  return (
    <div className="agent-create-page">
      <div className="page-header">
        <h1><Sparkles size={24} /> 创建 AI 智能体</h1>
        <p>用自然语言描述你的需求，AI 将为你生成专属智能体</p>
      </div>

      {/* Step 1: Description Input */}
      <div className="create-step">
        <div className="step-header">
          <span className="step-num">1</span>
          <h3>描述你的需求</h3>
        </div>
        <textarea
          ref={textareaRef}
          className="desc-input"
          placeholder="例如：我需要一个能帮我回复小红书评论的助手，语气要亲切，经常用emoji..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          disabled={generating}
        />
        <div className="template-chips">
          {TEMPLATES.map((t) => (
            <button
              key={t.label}
              className="template-chip"
              onClick={() => handleTemplateClick(t.label)}
              disabled={generating}
            >
              <span className="chip-icon">{t.icon}</span>
              <span className="chip-label">{t.label}</span>
              <span className="chip-desc">{t.desc}</span>
            </button>
          ))}
        </div>
        <button
          className="btn-primary generate-btn"
          onClick={handleGenerate}
          disabled={!description.trim() || generating}
        >
          {generating ? (
            <>
              <Loader2 size={18} className="spin" /> {streamText ? '正在生成...' : '连接中...'}
            </>
          ) : (
            <>
              <Wand2 size={18} /> 生成智能体
            </>
          )}
        </button>

        {generating && streamText && (
          <div className="stream-output">
            <pre>{streamText}</pre>
          </div>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Step 2: Generated Config Preview */}
      {generated && (
        <div className="create-step">
          <div className="step-header">
            <span className="step-num">2</span>
            <h3>配置预览</h3>
            <button className="btn-text" onClick={() => setEditing(!editing)}>
              <Edit3 size={14} /> {editing ? '完成编辑' : '编辑'}
            </button>
          </div>

          <div className="config-preview">
            <div className="config-row">
              <label>名称</label>
              {editing ? (
                <input
                  className="config-input"
                  value={generated.name}
                  onChange={(e) => setGenerated({ ...generated, name: e.target.value })}
                />
              ) : (
                <span className="config-value">{generated.name}</span>
              )}
            </div>

            <div className="config-row">
              <label>描述</label>
              {editing ? (
                <input
                  className="config-input"
                  value={generated.description || ''}
                  onChange={(e) => setGenerated({ ...generated, description: e.target.value })}
                />
              ) : (
                <span className="config-value">{generated.description}</span>
              )}
            </div>

            <div className="config-row">
              <label>模型</label>
              {editing ? (
                <select
                  className="config-input"
                  value={generated.model}
                  onChange={(e) => setGenerated({ ...generated, model: e.target.value })}
                >
                  <option value="gpt-4o">GPT-4o</option>
                  <option value="gpt-4o-mini">GPT-4o Mini</option>
                  <option value="claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                  <option value="deepseek-chat">DeepSeek Chat</option>
                </select>
              ) : (
                <span className="config-value">{generated.model}</span>
              )}
            </div>

            <div className="config-row">
              <label>温度</label>
              {editing ? (
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={generated.temperature}
                  onChange={(e) => setGenerated({ ...generated, temperature: parseFloat(e.target.value) })}
                  className="config-range"
                />
              ) : (
                <span className="config-value">{generated.temperature}</span>
              )}
              {editing && <span className="range-value">{generated.temperature}</span>}
            </div>

            <div className="config-row">
              <label>系统提示词</label>
              {editing ? (
                <textarea
                  className="config-textarea"
                  value={generated.systemPrompt}
                  onChange={(e) => setGenerated({ ...generated, systemPrompt: e.target.value })}
                  rows={6}
                />
              ) : (
                <pre className="config-value prompt-preview">{generated.systemPrompt}</pre>
              )}
            </div>

            <div className="config-row">
              <label>工具</label>
              <div className="tool-chips">
                {(generated.tools ? JSON.parse(generated.tools) : []).map((t: string) => (
                  <span key={t} className="tool-chip">{t}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="action-row">
            <button
              className="btn-primary"
              onClick={() => handleSave('active')}
              disabled={saving}
            >
              <Play size={16} /> 保存并激活
            </button>
            <button
              className="btn-secondary"
              onClick={() => handleSave('draft')}
              disabled={saving}
            >
              <Save size={16} /> 保存草稿
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Next Steps */}
      {generated && !editing && (
        <div className="create-step">
          <div className="step-header">
            <span className="step-num">3</span>
            <h3>下一步</h3>
          </div>
          <div className="next-steps">
            <button className="next-step-card" onClick={() => handleSave('active')}>
              <Bot size={24} />
              <h4>关联知识库</h4>
              <p>上传文档让智能体学习你的业务知识</p>
              <ChevronRight size={16} />
            </button>
            <button className="next-step-card" onClick={() => handleSave('active')}>
              <Play size={24} />
              <h4>测试对话</h4>
              <p>立即开始与智能体对话测试效果</p>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
