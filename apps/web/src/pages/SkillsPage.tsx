import { useState, useEffect } from 'react';
import { X, Brain, Bot, Presentation, Sparkles, Code, FileText, Image, MessageSquare, Globe, Shield, type LucideIcon } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { getFriendlyMessage } from '../lib/errors';

interface Skill {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  capabilities?: string[];
  tools?: string[];
  version?: string;
  author?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  config?: any;
  prompt?: string;
  loadedAt?: string;
}

const ICON_MAP: Record<string, LucideIcon> = {
  'html': Presentation,
  'ppt': Presentation,
  'presentation': Presentation,
  'character': Bot,
  'tts': MessageSquare,
  'voice': MessageSquare,
  'code': Code,
  'write': FileText,
  'read': FileText,
  'search': Globe,
  'web': Globe,
  'image': Image,
  'vision': Image,
  'reasoning': Brain,
  'security': Shield,
  'default': Sparkles,
};

function getSkillIcon(skill: Skill) {
  const key = skill.id.toLowerCase();
  for (const [k, Icon] of Object.entries(ICON_MAP)) {
    if (key.includes(k)) return Icon;
  }
  if (skill.capabilities?.some(c => ICON_MAP[c.toLowerCase()])) {
    const cap = skill.capabilities.find(c => ICON_MAP[c.toLowerCase()]);
    if (cap) return ICON_MAP[cap.toLowerCase()];
  }
  return Sparkles;
}

function SkillDetailPanel({ skill, onClose, onUpdate }: { skill: Skill; onClose: () => void; onUpdate: (s: Skill) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [local, setLocal] = useState<Skill>(skill);

  useEffect(() => {
    setLocal(skill);
  }, [skill.id]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await apiFetch<Skill>(`/skills/${encodeURIComponent(local.id)}`, {
        method: 'PUT',
        body: JSON.stringify(local),
      });
      onUpdate(updated);
      setSuccess('技能配置已保存');
    } catch (e) {
      setError(getFriendlyMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const Icon = getSkillIcon(local);

  return (
    <div className="skill-detail-panel">
      <div className="skill-detail-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-color)' }}>
            <Icon size={20} />
          </div>
          <div>
            <div className="skill-detail-title">{local.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{local.version} · {local.author || 'unknown'}</div>
          </div>
        </div>
        <button className="modal-close" onClick={onClose}><X size={18} /></button>
      </div>

      <div className="skill-detail-body">
        {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError(null)}><X size={16} /></button></div>}
        {success && <div className="success-banner"><span>{success}</span><button onClick={() => setSuccess(null)}><X size={16} /></button></div>}

        <div className="skill-detail-section">
          <div className="skill-detail-label">描述</div>
          <div className="skill-detail-value">{local.description}</div>
        </div>

        <div className="skill-detail-section">
          <div className="skill-detail-label">提示词</div>
          <textarea
            className="input"
            rows={6}
            value={local.prompt || ''}
            onChange={e => setLocal({ ...local, prompt: e.target.value })}
            style={{ resize: 'vertical' }}
          />
        </div>

        <div className="skill-detail-section">
          <div className="skill-detail-label">能力</div>
          <div className="skill-detail-value">
            {local.capabilities?.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {local.capabilities.map(c => <span key={c} className="tag info">{c}</span>)}
              </div>
            ) : (
              <span style={{ color: 'var(--text-secondary)' }}>暂无</span>
            )}
          </div>
        </div>

        <div className="skill-detail-section">
          <div className="skill-detail-label">工具</div>
          <div className="skill-detail-value">
            {local.tools?.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {local.tools.map(t => <span key={t} className="tag success">{t}</span>)}
              </div>
            ) : (
              <span style={{ color: 'var(--text-secondary)' }}>暂无</span>
            )}
          </div>
        </div>

        <div className="skill-detail-section">
          <div className="skill-detail-label">配置</div>
          <pre className="code-block" style={{ padding: 12, fontSize: 13, overflow: 'auto' }}>{JSON.stringify(local.config || {}, null, 2)}</pre>
        </div>
      </div>

      <div className="skill-detail-footer">
        <button className="btn btn-secondary" onClick={onClose} disabled={saving}>关闭</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '保存配置'}
        </button>
      </div>
    </div>
  );
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Skill | null>(null);
  const [_togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch<Skill[]>('/skills')
      .then(data => {
        if (!cancelled) setSkills(data || []);
      })
      .catch(err => {
        if (!cancelled) setError(getFriendlyMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const toggleSkill = async (skill: Skill) => {
    setTogglingId(skill.id);
    setError(null);
    try {
      const updated = await apiFetch<Skill>(`/skills/${encodeURIComponent(skill.id)}/toggle`, { method: 'PATCH' });
      setSkills(prev => prev.map(s => s.id === skill.id ? updated : s));
      setSelected(prev => prev && prev.id === skill.id ? updated : prev);
    } catch (e) {
      setError(getFriendlyMessage(e));
    } finally {
      setTogglingId(null);
    }
  };

  if (loading) {
    return <div className="settings-loading">加载技能...</div>;
  }

  return (
    <div className="skills-page">
      <div className="skills-header">
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>技能管理</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 14 }}>启用/停用技能，配置智能体的能力扩展</p>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}><span>{error}</span><button onClick={() => setError(null)}><X size={16} /></button></div>}

      {skills.length === 0 ? (
        <div className="settings-empty" style={{ padding: '60px 0' }}>
          <Sparkles size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
          <h3 style={{ margin: '0 0 8px' }}>暂无技能</h3>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>当前没有可用的技能包</p>
        </div>
      ) : (
        <div className="skills-grid">
          {skills.map(skill => {
            const Icon = getSkillIcon(skill);
            return (
              <div key={skill.id} className="skill-card" onClick={() => setSelected(skill)}>
                <div className="skill-card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-color)', flexShrink: 0 }}>
                      <Icon size={20} />
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
                <div className="skill-card-meta">
                  {(skill.capabilities || []).slice(0, 3).map(cap => (
                    <span key={cap} className="tag info">{cap}</span>
                  ))}
                  {(() => { const len = skill.capabilities?.length ?? 0; return len > 3 ? <span className="tag">+{len - 3}</span> : null; })()}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <SkillDetailPanel
          skill={selected}
          onClose={() => setSelected(null)}
          onUpdate={(updated) => {
            setSkills(prev => prev.map(s => s.id === updated.id ? updated : s));
            setSelected(updated);
          }}
        />
      )}
    </div>
  );
}
