import { useState, useEffect } from 'react';
import { Play, CheckCircle, XCircle } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { getFriendlyMessage } from '../../lib/errors';

interface Dataset {
  id: string;
  name: string;
  items: string;
}

interface EvalResult {
  id: string;
  dataset_id: string;
  agent_id: string | null;
  model: string;
  scores: string;
  created_at: string;
}

export default function EvalRunPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [results, setResults] = useState<EvalResult[]>([]);
  const [selectedDataset, setSelectedDataset] = useState('');
  const [model, setModel] = useState('gpt-3.5-turbo');
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [dsRes, resRes] = await Promise.all([
        apiFetch<{ items: Dataset[] }>('/api/v1/eval/datasets'),
        apiFetch<{ items: EvalResult[] }>('/api/v1/eval/results'),
      ]);
      setDatasets(dsRes.items || []);
      setResults(resRes.items || []);
    } catch (err) {
      setError(getFriendlyMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const runEvaluation = async () => {
    if (!selectedDataset) {
      setError('请选择数据集');
      return;
    }
    setRunning(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/eval/datasets/${selectedDataset}/run`, {
        method: 'POST',
        body: JSON.stringify({ model }),
      });
      fetchData();
    } catch (err) {
      setError(getFriendlyMessage(err));
    } finally {
      setRunning(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'var(--color-success)';
    if (score >= 0.6) return 'var(--color-warning)';
    return 'var(--color-danger)';
  };

  if (loading) return <div className="settings-loading">加载评测数据中...</div>;
  if (error) return <div className="error-banner"><span>{error}</span></div>;

  return (
    <div className="page">
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>评测执行</h1>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16 }}>运行评测</h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-muted)' }}>数据集</label>
            <select
              value={selectedDataset}
              onChange={e => setSelectedDataset(e.target.value)}
              className="form-input"
            >
              <option value="">选择数据集</option>
              {datasets.map(ds => (
                <option key={ds.id} value={ds.id}>{ds.name} ({JSON.parse(ds.items || '[]').length} 条)</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-muted)' }}>模型</label>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="form-input"
            >
              <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
              <option value="gpt-4">GPT-4</option>
              <option value="claude-3-sonnet">Claude 3 Sonnet</option>
              <option value="deepseek-chat">DeepSeek Chat</option>
              <option value="qwen-plus">Qwen Plus</option>
            </select>
          </div>
          <button
            className="btn btn-primary"
            onClick={runEvaluation}
            disabled={running || !selectedDataset}
          >
            <Play size={16} style={{ marginRight: 6 }} />
            {running ? '运行中...' : '运行评测'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>评测结果</h2>
        {results.length === 0 ? (
          <div className="settings-empty">暂无评测结果</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>模型</th>
                <th>综合得分</th>
                <th>相关性</th>
                <th>完整性</th>
                <th>准确性</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {results.map(result => {
                const scores = JSON.parse(result.scores || '{}');
                const avgScore = Object.values(scores).length > 0
                  ? (Object.values(scores) as number[]).reduce((a, b) => a + b, 0) / Object.values(scores).length
                  : 0;
                return (
                  <tr key={result.id}>
                    <td className="mono">{result.id.slice(0, 12)}...</td>
                    <td>{result.model}</td>
                    <td style={{ color: getScoreColor(avgScore), fontWeight: 600 }}>
                      {(avgScore * 100).toFixed(1)}%
                    </td>
                    <td style={{ color: getScoreColor(scores.relevance || 0) }}>
                      {scores.relevance ? `${(scores.relevance * 100).toFixed(1)}%` : '-'}
                    </td>
                    <td style={{ color: getScoreColor(scores.completeness || 0) }}>
                      {scores.completeness ? `${(scores.completeness * 100).toFixed(1)}%` : '-'}
                    </td>
                    <td style={{ color: getScoreColor(scores.accuracy || 0) }}>
                      {scores.accuracy ? `${(scores.accuracy * 100).toFixed(1)}%` : '-'}
                    </td>
                    <td>{new Date(result.created_at).toLocaleString('zh-CN')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
