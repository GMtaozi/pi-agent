import { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell
} from 'recharts';
import {
  Activity, AlertTriangle, CheckCircle, Clock, Coins, Cpu, DollarSign,
  Filter, Layers, Play, RefreshCw, Search, Sparkles, TrendingUp, XCircle,
  type LucideIcon
} from 'lucide-react';
import {
  getExecutionStats, listExecutions, getExecutionDetail,
  getCostSummary, getCostByModel, getCostTrend,
  getOptimizationSuggestions,
  type ExecutionRecord, type ExecutionStats, type CostBreakdownRow,
  type TrendPoint, type OptimizationSuggestion
} from '../lib/api';
import { getFriendlyMessage } from '../lib/errors';

type TimeRange = '1d' | '7d' | '30d';
type TabId = 'overview' | 'executions' | 'costs' | 'optimizations';

const TIME_RANGE_DAYS: Record<TimeRange, number> = { '1d': 1, '7d': 7, '30d': 30 };

const formatTime = (ts: string) => new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const formatDuration = (ms: number) => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
const formatTokens = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
const formatCost = (c: number) => c < 0.001 ? c.toExponential(2) : `$${c.toFixed(4)}`;

const STATUS_META: Record<string, { color: string; label: string; icon: LucideIcon }> = {
  running: { color: '#06b6d4', label: '运行中', icon: Play },
  completed: { color: '#81c995', label: '已完成', icon: CheckCircle },
  failed: { color: '#f28b82', label: '失败', icon: XCircle },
  stopped: { color: '#fdd663', label: '已停止', icon: AlertTriangle },
};

const SEVERITY_META: Record<string, { color: string; bg: string; label: string }> = {
  high: { color: '#f28b82', bg: '#f28b8220', label: '高' },
  medium: { color: '#fdd663', bg: '#fdd66320', label: '中' },
  low: { color: '#81c995', bg: '#81c99520', label: '低' },
};

const PIE_COLORS = ['#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#6366f1'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '10px 14px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
      <p style={{ margin: '0 0 6px', color: 'var(--text-muted)', fontSize: 12 }}>{label}</p>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ margin: '2px 0', color: entry.color, fontSize: 13, fontWeight: 500 }}>
          {entry.name}: <span style={{ fontFamily: 'var(--font-mono)' }}>{entry.value?.toLocaleString?.() ?? entry.value}</span>
        </p>
      ))}
    </div>
  );
};

const KpiCard = ({ label, value, sub, icon: Icon, accent }: { label: string; value: string; sub?: string; icon: LucideIcon; accent: string }) => (
  <div className="monitoring-kpi-card" style={{ '--kpi-accent': accent } as React.CSSProperties}>
    <div className="monitoring-kpi-header">
      <span className="monitoring-kpi-icon" aria-hidden="true"><Icon size={20} /></span>
      <span className="monitoring-kpi-label">{label}</span>
    </div>
    <div className="monitoring-kpi-value">{value}</div>
    {sub && <div className="monitoring-kpi-detail"><span>{sub}</span></div>}
  </div>
);

export default function ExecutionMonitoringPage() {
  const [tab, setTab] = useState<TabId>('overview');
  const [range, setRange] = useState<TimeRange>('7d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ExecutionStats | null>(null);
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [costBreakdown, setCostBreakdown] = useState<CostBreakdownRow[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [optimizations, setOptimizations] = useState<OptimizationSuggestion[]>([]);
  const [totalSavings, setTotalSavings] = useState(0);
  const [selectedExecution, setSelectedExecution] = useState<ExecutionRecord | null>(null);
  const [usageEvents, setUsageEvents] = useState<Array<{ model: string; cost: number; total_tokens: number; created_at: string }>>([]);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);

  const days = TIME_RANGE_DAYS[range];

  const fetchAll = async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const [statsRes, execsRes, breakdownRes, trendRes, optRes] = await Promise.all([
        getExecutionStats(days),
        listExecutions({ days, limit: 50, status: filterStatus || undefined }),
        getCostByModel(days, 10),
        getCostTrend(days),
        getOptimizationSuggestions(days),
      ]);
      setStats(statsRes);
      setExecutions(execsRes.items);
      setCostBreakdown(breakdownRes.items);
      setTrend(trendRes.items);
      setOptimizations(optRes.items);
      setTotalSavings(optRes.totalMonthlySavingUsd);
      setError(null);
    } catch (e) {
      setError(getFriendlyMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAll(true);
  }, [days, filterStatus]);

  const openExecutionDetail = async (exec: ExecutionRecord) => {
    setSelectedExecution(exec);
    try {
      const detail = await getExecutionDetail(exec.id);
      setUsageEvents(detail.events);
    } catch {
      setUsageEvents([]);
    }
  };

  const trendData = useMemo(() =>
    trend.map(p => ({ date: p.date, cost: Number(p.cost.toFixed(4)), tokens: p.tokens, executions: p.executions })),
    [trend]);

  const pieData = useMemo(() =>
    costBreakdown.map(r => ({ name: r.model, value: Number(r.totalCost.toFixed(4)) })),
    [costBreakdown]);

  const tabs: { id: TabId; label: string; icon: LucideIcon }[] = [
    { id: 'overview', label: '总览', icon: Activity },
    { id: 'executions', label: '执行历史', icon: Layers },
    { id: 'costs', label: '成本分析', icon: DollarSign },
    { id: 'optimizations', label: '优化建议', icon: Sparkles },
  ];

  if (loading && !refreshing) {
    return (
      <div className="monitoring-page" role="status">
        <div className="monitoring-header"><h1 className="monitoring-title">执行追踪</h1></div>
        <div className="monitoring-tabs" aria-hidden="true">{tabs.map(t => <div key={t.id} className="monitoring-tab" style={{ opacity: 0.5 }}>{t.label}</div>)}</div>
        <div className="monitoring-kpi-grid">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="monitoring-kpi-card skeleton" />)}</div>
      </div>
    );
  }

  return (
    <div className="monitoring-page">
      <div className="monitoring-header">
        <div className="monitoring-title-group">
          <h1 className="monitoring-title">执行追踪</h1>
          <span className="monitoring-subtitle">Agent 执行历史与成本分析</span>
        </div>
        <div className="monitoring-header-right">
          <div className="monitoring-time-range" role="group">
            {(['1d', '7d', '30d'] as TimeRange[]).map(r => (
              <button key={r} className={'monitoring-time-btn' + (range === r ? ' active' : '')} onClick={() => setRange(r)} aria-pressed={range === r}>
                {r === '1d' ? '今天' : r === '7d' ? '7天' : '30天'}
              </button>
            ))}
          </div>
          <button className="monitoring-time-btn" onClick={() => fetchAll(true)} title="刷新" disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
          </button>
        </div>
      </div>

      <div className="monitoring-tabs" role="tablist">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={'monitoring-tab' + (tab === t.id ? ' active' : '')} role="tab" aria-selected={tab === t.id}>
              <span className="monitoring-tab-icon" aria-hidden="true"><Icon size={16} /></span>{t.label}
            </button>
          );
        })}
      </div>

      {error && <div className="error-banner" style={{ margin: '0 20px' }}><span>{error}</span></div>}

      {/* ===== Overview Tab ===== */}
      {tab === 'overview' && stats && (
        <div role="tabpanel" className="monitoring-tab-panel">
          <div className="monitoring-kpi-grid">
            <KpiCard label="总执行数" value={stats.totalExecutions.toLocaleString()} sub={`成功率 ${(stats.successRate * 100).toFixed(1)}%`} icon={Activity} accent="#8b5cf6" />
            <KpiCard label="消耗 Token" value={formatTokens(stats.totalTokens)} sub={`输入 ${formatTokens(stats.promptTokens)} / 输出 ${formatTokens(stats.completionTokens)}`} icon={Cpu} accent="#06b6d4" />
            <KpiCard label="总成本" value={`$${stats.totalCost.toFixed(4)}`} sub={`平均 $${stats.totalExecutions > 0 ? (stats.totalCost / stats.totalExecutions).toFixed(4) : '0'} / 次`} icon={DollarSign} accent="#f59e0b" />
            <KpiCard label="平均耗时" value={formatDuration(stats.avgDurationMs)} sub={`${stats.failedExecutions} 次失败`} icon={Clock} accent="#10b981" />
          </div>

          <div className="monitoring-charts-grid">
            <div className="monitoring-chart-card">
              <div className="monitoring-chart-header"><div><div className="monitoring-chart-title">成本趋势</div><div className="monitoring-chart-subtitle">每日成本变化 (USD)</div></div></div>
              <div className="monitoring-chart-content">
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="gradCost" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} /><stop offset="95%" stopColor="#f59e0b" stopOpacity={0} /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} stroke="var(--border-color)" />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} stroke="var(--border-color)" />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="cost" stroke="#f59e0b" fill="url(#gradCost)" name="成本 ($)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="monitoring-chart-card">
              <div className="monitoring-chart-header"><div><div className="monitoring-chart-title">模型成本占比</div><div className="monitoring-chart-subtitle">按模型分组</div></div></div>
              <div className="monitoring-chart-content">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value">
                      {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {optimizations.length > 0 && (
            <div className="monitoring-table-card" style={{ margin: '0 20px 20px' }}>
              <div className="monitoring-table-header"><div className="monitoring-table-title">优化建议</div><div className="monitoring-table-count">预计月节省 ${totalSavings.toFixed(2)}</div></div>
              <div style={{ padding: '8px 20px 20px' }}>
                {optimizations.slice(0, 3).map(opt => {
                  const sev = SEVERITY_META[opt.severity] || SEVERITY_META.low;
                  return (
                    <div key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}>
                      <span className="status-badge" style={{ background: sev.bg, color: sev.color }}>{sev.label}</span>
                      <div style={{ flex: 1 }}><div style={{ fontWeight: 500, fontSize: 13 }}>{opt.title}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{opt.description}</div></div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--success-color)' }}>-${opt.estimatedMonthlySavingUsd.toFixed(2)}/月</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== Executions Tab ===== */}
      {tab === 'executions' && (
        <div role="tabpanel" className="monitoring-tab-panel">
          <div className="monitoring-table-card" style={{ margin: 20 }}>
            <div className="monitoring-table-header">
              <div className="monitoring-table-title">执行历史</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div className="monitoring-search">
                  <Search size={14} />
                  <select className="input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ border: 'none', background: 'transparent', fontSize: 12, padding: '4px 8px' }}>
                    <option value="">全部状态</option>
                    <option value="completed">已完成</option>
                    <option value="running">运行中</option>
                    <option value="failed">失败</option>
                    <option value="stopped">已停止</option>
                  </select>
                </div>
              </div>
            </div>
            {executions.length === 0 ? (
              <div className="monitoring-empty"><Layers size={32} /><div className="monitoring-empty-title">暂无执行记录</div></div>
            ) : (
              <div className="table-container">
                <table className="monitoring-table" role="table">
                  <thead><tr><th>模型</th><th>状态</th><th>Token</th><th>成本</th><th>耗时</th><th>时间</th></tr></thead>
                  <tbody>
                    {executions.map(exec => {
                      const st = STATUS_META[exec.status] || STATUS_META.running;
                      const StIcon = st.icon;
                      return (
                        <tr key={exec.id} style={{ cursor: 'pointer' }} onClick={() => openExecutionDetail(exec)}>
                          <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Cpu size={14} style={{ color: 'var(--text-muted)' }} /><span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{exec.model}</span></div></td>
                          <td><span className="status-badge" style={{ background: st.color + '20', color: st.color }}><StIcon size={12} style={{ marginRight: 4 }} />{st.label}</span></td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{formatTokens(exec.total_tokens)}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--warning-color)' }}>{formatCost(exec.cost)}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{formatDuration(exec.duration_ms)}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatTime(exec.started_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Execution detail panel */}
          {selectedExecution && (
            <div className="monitoring-table-card" style={{ margin: '0 20px 20px' }}>
              <div className="monitoring-table-header">
                <div className="monitoring-table-title">执行详情 — {selectedExecution.model}</div>
                <button className="modal-close" onClick={() => setSelectedExecution(null)}><XCircle size={18} /></button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, padding: '0 20px 16px' }}>
                <div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>输入 Token</div><div style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{selectedExecution.prompt_tokens.toLocaleString()}</div></div>
                <div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>输出 Token</div><div style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{selectedExecution.completion_tokens.toLocaleString()}</div></div>
                <div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>成本</div><div style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, color: 'var(--warning-color)' }}>{formatCost(selectedExecution.cost)}</div></div>
                <div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>耗时</div><div style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{formatDuration(selectedExecution.duration_ms)}</div></div>
              </div>
              {usageEvents.length > 0 && (
                <div style={{ padding: '0 20px 20px' }}>
                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, color: 'var(--text-secondary)' }}>LLM 调用序列</div>
                  <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                    {usageEvents.map((ev, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border-light)', fontSize: 12 }}>
                        <span style={{ color: 'var(--text-muted)', width: 24 }}>#{i + 1}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', flex: 1 }}>{ev.model}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{formatTokens(ev.total_tokens)}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--warning-color)' }}>{formatCost(ev.cost)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== Costs Tab ===== */}
      {tab === 'costs' && (
        <div role="tabpanel" className="monitoring-tab-panel">
          <div className="monitoring-charts-grid">
            <div className="monitoring-chart-card">
              <div className="monitoring-chart-header"><div><div className="monitoring-chart-title">每日成本趋势</div><div className="monitoring-chart-subtitle">最近 {days} 天</div></div></div>
              <div className="monitoring-chart-content">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} stroke="var(--border-color)" />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} stroke="var(--border-color)" />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="cost" fill="#f59e0b" name="成本 ($)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="monitoring-chart-card">
              <div className="monitoring-chart-header"><div><div className="monitoring-chart-title">Token 消耗趋势</div><div className="monitoring-chart-subtitle">每日 Token 总量</div></div></div>
              <div className="monitoring-chart-content">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} stroke="var(--border-color)" />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} stroke="var(--border-color)" tickFormatter={formatTokens} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend />
                    <Line type="monotone" dataKey="tokens" stroke="#06b6d4" name="Token" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="executions" stroke="#8b5cf6" name="执行次数" strokeWidth={2} dot={false} yAxisId={0} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="monitoring-table-card" style={{ margin: '0 20px 20px' }}>
            <div className="monitoring-table-header"><div className="monitoring-table-title">模型成本排行</div></div>
            <div className="table-container">
              <table className="monitoring-table" role="table">
                <thead><tr><th>模型</th><th>总成本</th><th>Token</th><th>执行数</th><th>平均成本</th></tr></thead>
                <tbody>
                  {costBreakdown.map(row => (
                    <tr key={row.model}>
                      <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500 }}>{row.model}</span></td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--warning-color)' }}>${row.totalCost.toFixed(4)}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{formatTokens(row.totalTokens)}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{row.executionCount}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>${row.avgCostPerExecution.toFixed(4)}</td>
                    </tr>
                  ))}
                  {costBreakdown.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>暂无数据</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===== Optimizations Tab ===== */}
      {tab === 'optimizations' && (
        <div role="tabpanel" className="monitoring-tab-panel">
          <div className="monitoring-kpi-grid" style={{ marginBottom: 0 }}>
            <KpiCard label="可优化项" value={String(optimizations.length)} sub="基于历史数据分析" icon={Sparkles} accent="#8b5cf6" />
            <KpiCard label="预计月节省" value={`$${totalSavings.toFixed(2)}`} sub="全部应用后" icon={TrendingUp} accent="#10b981" />
          </div>

          <div style={{ padding: 20 }}>
            {optimizations.length === 0 ? (
              <div className="monitoring-empty"><Sparkles size={32} /><div className="monitoring-empty-title">暂无优化建议</div><div className="monitoring-empty-desc">积累更多执行数据后将自动生成</div></div>
            ) : (
              optimizations.map(opt => {
                const sev = SEVERITY_META[opt.severity] || SEVERITY_META.low;
                return (
                  <div key={opt.id} className="opt-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <span className="status-badge" style={{ background: sev.bg, color: sev.color }}>{sev.label}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{opt.type}</span>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{opt.title}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8 }}>{opt.description}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--success-color)' }}>
                      <Coins size={14} />预计月节省 ${opt.estimatedMonthlySavingUsd.toFixed(2)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
