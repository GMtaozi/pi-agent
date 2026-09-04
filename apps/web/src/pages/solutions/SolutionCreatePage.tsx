import { authedFetch } from '../../lib/api';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const INDUSTRIES = [
  { value: 'finance', label: '金融' },
  { value: 'healthcare', label: '医疗' },
  { value: 'education', label: '教育' },
  { value: 'retail', label: '零售' },
  { value: 'manufacturing', label: '制造业' },
  { value: 'general', label: '通用' },
];

const CATEGORIES = ['general', 'compliance', 'research', 'support', 'automation'];

export default function SolutionCreatePage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [industry, setIndustry] = useState('general');
  const [category, setCategory] = useState('general');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('请输入方案名称');
      return;
    }

    setSubmitting(true);
    try {
      const res = await authedFetch('/api/v1/solutions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, industry, category }),
      });

      if (res.ok) {
        const data = await res.json();
        navigate(`/solutions/${data.id}`);
      } else {
        const data = await res.json();
        alert(`创建失败: ${data.error || '未知错误'}`);
      }
    } catch (e) {
      console.error('Failed to create solution:', e);
      alert('创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>创建行业方案</h1>

      <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 600 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>方案名称 *</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="input"
            placeholder="输入方案名称"
            required
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>描述</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="input"
            rows={3}
            placeholder="输入方案描述"
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>行业 *</label>
          <select value={industry} onChange={e => setIndustry(e.target.value)} className="select">
            {INDUSTRIES.map(i => (
              <option key={i.value} value={i.value}>{i.label}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>分类</label>
          <select value={category} onChange={e => setCategory(e.target.value)} className="select">
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? '创建中...' : '创建方案'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/solutions')}>
            取消
          </button>
        </div>
      </form>
    </div>
  );
}
