import { useState, useEffect } from 'react';
import { ArrowLeft, ThumbsUp, CheckCircle, AlertCircle, XCircle, BarChart3 } from 'lucide-react';
import { getAdminMetrics, type MetricsSummary } from '../lib/api';
import { getFriendlyMessage } from '../lib/errors';

interface AnalyticsPageProps {
  onBack?: () => void;
}

function AnalyticsPage({ onBack }: AnalyticsPageProps) {
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAdminMetrics()
      .then(data => {
        if (!cancelled) setMetrics(data);
      })
      .catch(err => {
        if (!cancelled) setError(getFriendlyMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <div className="settings-loading">加载指标中...</div>;
  }

  if (error) {
    return <div className="error-banner"><span>{error}</span></div>;
  }

  if (!metrics) {
    return <div className="settings-empty">暂无数据</div>;
  }

  const totalCodeFeedback = metrics.codeAdoption.reduce((sum, item) => sum + item.count, 0);
  const runnableCount = metrics.codeAdoption.find(item => item.rating === 'runnable')?.count || 0;
  const needsFixCount = metrics.codeAdoption.find(item => item.rating === 'needs_fix')?.count || 0;
  const wrongCount = metrics.codeAdoption.find(item => item.rating === 'wrong')?.count || 0;
  const codeAdoptionRate = totalCodeFeedback > 0 ? ((runnableCount / totalCodeFeedback) * 100).toFixed(1) : '0.0';

  return (
    <div className="analytics-page">
      <div className="settings-header">
        {onBack && (
          <button className="settings-back-btn" onClick={onBack} title="返回对话">
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="settings-header-content">
          <h1 className="settings-title">数据看板</h1>
          <p className="settings-subtitle">用户反馈、模型使用与代码采纳率概览</p>
        </div>
      </div>

      <div className="analytics-grid">
        <div className="config-card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ThumbsUp size={18} />
              <div>
                <div className="title">用户满意度</div>
                <div className="desc">基于消息点赞/点踩统计</div>
              </div>
            </div>
            <div className="card-actions">
              <span className="tag success">{metrics.userSatisfaction.avgRating > 0 ? metrics.userSatisfaction.avgRating.toFixed(1) : '--'} / 1</span>
            </div>
          </div>
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
            总反馈数：{metrics.userSatisfaction.totalFeedback}
          </div>
        </div>

        <div className="config-card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CheckCircle size={18} />
              <div>
                <div className="title">代码采纳率</div>
                <div className="desc">标记为“可运行”的代码占比</div>
              </div>
            </div>
            <div className="card-actions">
              <span className="tag info">{codeAdoptionRate}%</span>
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span className="tag success"><CheckCircle size={12} style={{ marginRight: 4 }} /> 可运行 {runnableCount}</span>
            <span className="tag warning"><AlertCircle size={12} style={{ marginRight: 4 }} /> 需修改 {needsFixCount}</span>
            <span className="tag danger"><XCircle size={12} style={{ marginRight: 4 }} /> 完全错误 {wrongCount}</span>
          </div>
        </div>

        <div className="config-card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <BarChart3 size={18} />
              <div>
                <div className="title">模型使用量</div>
                <div className="desc">按模型分组统计</div>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            {metrics.modelUsage.length === 0 ? (
              <div className="settings-empty" style={{ padding: '20px 0' }}>暂无数据</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {metrics.modelUsage.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: idx < metrics.modelUsage.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{item.model}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.provider}</div>
                    </div>
                    <span className="tag info">{item.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AnalyticsPage;
