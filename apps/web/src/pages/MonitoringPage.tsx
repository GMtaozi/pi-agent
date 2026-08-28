import { authedFetch } from '../lib/api';
import { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, BarChart, Bar } from 'recharts';
import { BookOpen, Pencil, Wrench, Radio, CheckCircle, Timer, Link2, HardDrive, AlertTriangle, FolderOpen, ArrowUp, Zap, FileText, Play, Pause, BarChart3, Bell, XCircle, type LucideIcon } from 'lucide-react';
import { getFriendlyMessage } from '../lib/errors';
import { useMonitoringWebSocket } from '../hooks/useMonitoringWebSocket';

interface Metrics {
  timestamp: string;
  uptime: number;
  health: 'healthy' | 'degraded' | 'unhealthy';
  requests: {
    total: number;
    success: number;
    failed: number;
    averageDuration: number;
    successRate: number;
    p95Duration: number;
    p99Duration: number;
  };
  tools: {
    readFile: { count: number; averageDuration: number; successRate: number; slowCount: number };
    writeFile: { count: number; averageDuration: number; successRate: number; slowCount: number };
    editFile: { count: number; averageDuration: number; successRate: number; slowCount: number };
  };
  errors: Array<{ timestamp: string; message: string; service: string; stack?: string }>;
  system: {
    memoryUsage: number;
    cpuUsage: number;
    activeConnections: number;
  };
  timeSeries: {
    requests: Array<{ timestamp: number; value: number }>;
    duration: Array<{ timestamp: number; value: number }>;
    errors: Array<{ timestamp: number; value: number }>;
    memory: Array<{ timestamp: number; value: number }>;
    cpu: Array<{ timestamp: number; value: number }>;
  };
  performance: {
    slowTools: Array<{ name: string; duration: number; timestamp: string }>;
    hotFiles: Array<{ path: string; accessCount: number }>;
  };
}

type TimeRange = '1h' | '24h' | '7d';

const formatUptime = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  return days > 0 ? days + '天 ' + (hours % 24) + '小时' : hours > 0 ? hours + '小时 ' + (minutes % 60) + '分钟' : minutes > 0 ? minutes + '分钟 ' + (seconds % 60) + '秒' : seconds + '秒';
};

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const healthColor = (health: string) => {
  switch (health) {
    case 'healthy': return '#16a34a';
    case 'degraded': return '#f59e0b';
    case 'unhealthy': return '#dc2626';
    default: return '#666';
  }
};

const toolLabel: Record<string, string> = {
  readFile: '读取文件',
  writeFile: '写入文件',
  editFile: '编辑文件'
};

const toolIcon: Record<string, React.ComponentType<React.ComponentProps<LucideIcon>>> = {
  readFile: BookOpen,
  writeFile: Pencil,
  editFile: Wrench
};

const kpiIcons: Record<string, { icon: LucideIcon; color: string }> = {
  totalRequests: { icon: Radio, color: '#8ab4f8' },
  successRate: { icon: CheckCircle, color: '#81c995' },
  avgDuration: { icon: Timer, color: '#fdd663' },
  activeConnections: { icon: Link2, color: '#8b5cf6' },
  memoryUsage: { icon: HardDrive, color: '#06b6d4' },
  errors: { icon: AlertTriangle, color: '#f28b82' },
};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(26, 26, 46, 0.95)',
      border: '1px solid #3c3c5a',
      borderRadius: 10,
      padding: '10px 14px',
      backdropFilter: 'blur(8px)',
      boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
    }}>
      <p style={{ margin: '0 0 6px', color: '#9aa0a6', fontSize: 12 }}>{label}</p>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      {payload.map((entry: { name: string; color: string; value: number | string }, index: number) => (
        <p key={index} style={{ margin: '2px 0', color: entry.color, fontSize: 13, fontWeight: 500 }}>
          {entry.name}: <span style={{ fontFamily: 'var(--font-mono)' }}>{entry.value?.toLocaleString?.() ?? entry.value}</span>
        </p>
      ))}
    </div>
  );
};

const SkeletonCard = () => (
  <div className="monitoring-kpi-card" style={{ background: 'var(--bg-secondary)' }}>
    <div className="monitoring-kpi-label" style={{ width: '60%', height: 12, background: 'var(--bg-tertiary)', borderRadius: 4, animation: 'pulse 1.5s ease-in-out infinite' }} />
    <div className="monitoring-kpi-value" style={{ width: '80%', height: 32, background: 'var(--bg-tertiary)', borderRadius: 6, marginTop: 8, animation: 'pulse 1.5s ease-in-out infinite 0.1s' }} />
    <div style={{ width: '100%', height: 12, background: 'var(--bg-tertiary)', borderRadius: 4, marginTop: 12, animation: 'pulse 1.5s ease-in-out infinite 0.2s' }} />
  </div>
);

const SkeletonChart = () => (
  <div className="monitoring-chart-card">
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
      <div>
        <div style={{ width: 120, height: 16, background: 'var(--bg-tertiary)', borderRadius: 4, animation: 'pulse 1.5s ease-in-out infinite' }} />
        <div style={{ width: 80, height: 12, background: 'var(--bg-tertiary)', borderRadius: 4, marginTop: 6, animation: 'pulse 1.5s ease-in-out infinite 0.1s' }} />
      </div>
    </div>
    <div style={{ height: 280, background: 'var(--bg-tertiary)', borderRadius: 8, animation: 'pulse 1.5s ease-in-out infinite 0.2s' }} />
  </div>
);

export default function MonitoringPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'tools' | 'alerts' | 'logs' | 'performance'>('overview');
  const [timeRange, setTimeRange] = useState<TimeRange>('1h');
  const [retryCount, setRetryCount] = useState(0);
  const [paused, setPaused] = useState(false);
  const [wsAlerts, setWsAlerts] = useState<Array<{ timestamp: string; service: string; message: string; stack?: string }>>([]);
  const [wsConnectionState, setWsConnectionState] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');

  useMonitoringWebSocket({
    onAlerts: (alerts) => {
      setWsAlerts(prev => {
        const merged = [...alerts, ...prev];
        // Deduplicate by timestamp + service + message
        const seen = new Set<string>();
        const deduped: typeof merged = [];
        for (const alert of merged) {
          const key = `${alert.timestamp}|${alert.service}|${alert.message}`;
          if (!seen.has(key)) {
            seen.add(key);
            deduped.push(alert);
          }
        }
        return deduped.slice(0, 100);
      });
    },
    onConnected: (data) => {
      if (data) {
        setMetrics(data);
        setError(null);
      }
    },
    onStateChange: setWsConnectionState,
    onError: (err) => {
      console.error('Monitoring WebSocket error:', err);
    }
  });

  const fetchMetrics = async () => {
    try {
      const res = await authedFetch('/monitoring/dashboard');
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
        setError(null);
      } else {
        const error = await res.json().catch(() => ({ error: 'Failed to fetch metrics' }));
        setError(getFriendlyMessage(new Error(error.error || '加载监控数据失败')));
      }
    } catch (e) {
      setError(getFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    if (!paused) {
      const interval = setInterval(fetchMetrics, 5000);
      return () => clearInterval(interval);
    }
  }, [retryCount, timeRange, paused]);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    setRetryCount(c => c + 1);
  };

  const timeRangeOptions: { value: TimeRange; label: string }[] = [
    { value: '1h', label: '1小时' },
    { value: '24h', label: '24小时' },
    { value: '7d', label: '7天' }
  ];

  const sampledMetrics = useMemo(() => {
    if (!metrics) return null;
    const sampleRate = timeRange === '1h' ? 1 : timeRange === '24h' ? 6 : 24;
    const sample = <T,>(arr: T[]): T[] => arr.filter((_, i) => i % sampleRate === 0);
    return {
      ...metrics,
      timeSeries: {
        requests: sample(metrics.timeSeries.requests),
        duration: sample(metrics.timeSeries.duration),
        errors: sample(metrics.timeSeries.errors),
        memory: sample(metrics.timeSeries.memory),
        cpu: sample(metrics.timeSeries.cpu),
      }
    };
  }, [metrics, timeRange]);

  if (loading) {
    return (
      <div className="monitoring-page" role="status" aria-label="加载监控数据">
        <div className="monitoring-header">
          <h1 className="monitoring-title">监控中心</h1>
        </div>
        <div className="monitoring-tabs" aria-hidden="true">
          {['总览', '工具统计', '告警', '日志', '性能'].map(tab => (
            <div key={tab} className="monitoring-tab" style={{ opacity: 0.5 }}>{tab}</div>
          ))}
        </div>
        <div className="monitoring-kpi-grid" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="monitoring-charts-grid" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonChart key={i} />)}
        </div>
      </div>
    );
  }

  if (error || !sampledMetrics) {
    return (
      <div className="monitoring-page">
        <div className="monitoring-header">
          <h1 className="monitoring-title">监控中心</h1>
        </div>
        <div className="monitoring-empty">
          <div className="monitoring-empty-icon"><AlertTriangle size={32} /></div>
          <div className="monitoring-empty-title">加载失败</div>
          <div className="monitoring-empty-desc">{error || 'No metrics data available'}</div>
          <button className="btn btn-primary" onClick={handleRetry} style={{ marginTop: 16 }}>
            重新加载
          </button>
        </div>
      </div>
    );
  }

  const requestTimeSeriesData = sampledMetrics.timeSeries.requests.map((point, index) => ({
    time: formatTime(point.timestamp),
    requests: point.value,
    duration: sampledMetrics.timeSeries.duration[index]?.value || 0
  }));

  const systemTimeSeriesData = sampledMetrics.timeSeries.memory.map((point, index) => ({
    time: formatTime(point.timestamp),
    memory: point.value,
    cpu: sampledMetrics.timeSeries.cpu[index]?.value || 0
  }));

  const tabs = [
    { id: 'overview' as const, label: '总览', icon: BarChart3 },
    { id: 'tools' as const, label: '工具统计', icon: Wrench },
    { id: 'alerts' as const, label: '告警', icon: Bell },
    { id: 'logs' as const, label: '日志', icon: FileText },
    { id: 'performance' as const, label: '性能', icon: Zap }
  ];

  return (
    <div className="monitoring-page">
      {/* Header */}
      <div className="monitoring-header">
        <div className="monitoring-title-group">
          <h1 className="monitoring-title">监控中心</h1>
          <span className="monitoring-subtitle">实时系统健康状态</span>
        </div>
        <div className="monitoring-header-right">
          <div className="monitoring-time-range" role="group" aria-label="时间范围选择">
            {timeRangeOptions.map(option => (
              <button
                key={option.value}
                onClick={() => setTimeRange(option.value)}
                className={'monitoring-time-btn' + (timeRange === option.value ? ' active' : '')}
                aria-pressed={timeRange === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            className={'monitoring-time-btn' + (paused ? ' active' : '')}
            onClick={() => setPaused(!paused)}
            aria-pressed={paused}
            title={paused ? '恢复轮询' : '暂停轮询'}
          >
            {paused ? <><Play size={14} style={{ marginRight: 4 }} />恢复</> : <><Pause size={14} style={{ marginRight: 4 }} />暂停</>}
          </button>
          <span className="monitoring-status-badge" style={{
            background: healthColor(sampledMetrics.health) + '20',
            color: healthColor(sampledMetrics.health),
            border: '1px solid ' + healthColor(sampledMetrics.health)
          }}>
            <span className="monitoring-status-dot" style={{ background: healthColor(sampledMetrics.health) }}></span>
            {sampledMetrics.health === 'healthy' ? '健康' : sampledMetrics.health === 'degraded' ? '降级' : '异常'}
          </span>
          <span className="monitoring-uptime">运行时间: {formatUptime(sampledMetrics.uptime)}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="monitoring-tabs" role="tablist" aria-label="监控页面导航">
        {tabs.map(tab => {
          const Icon = tab.icon as LucideIcon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={'monitoring-tab' + (activeTab === tab.id ? ' active' : '')}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
            >
              <span className="monitoring-tab-icon" aria-hidden="true"><Icon size={16} /></span>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div id="panel-overview" role="tabpanel" className="monitoring-tab-panel">
          {/* KPI Cards */}
          <div className="monitoring-kpi-grid">
            {(() => {
              const TotalRequestsIcon = kpiIcons.totalRequests.icon;
              const SuccessRateIcon = kpiIcons.successRate.icon;
              const AvgDurationIcon = kpiIcons.avgDuration.icon;
              const ActiveConnectionsIcon = kpiIcons.activeConnections.icon;
              const MemoryUsageIcon = kpiIcons.memoryUsage.icon;
              const ErrorsIcon = kpiIcons.errors.icon;
              return (
                <>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
                  <div className="monitoring-kpi-card" style={{ '--kpi-accent': kpiIcons.totalRequests.color } as React.CSSProperties}>
                    <div className="monitoring-kpi-header">
                      <span className="monitoring-kpi-icon" aria-hidden="true"><TotalRequestsIcon size={20} /></span>
                      <span className="monitoring-kpi-label">总请求数</span>
                    </div>
                    <div className="monitoring-kpi-value">{sampledMetrics.requests.total.toLocaleString()}</div>
                    <div className="monitoring-kpi-detail">
                      <span style={{ color: '#81c995', display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCircle size={14} /> 成功 {sampledMetrics.requests.success.toLocaleString()}</span>
                      <span style={{ color: '#f28b82', display: 'inline-flex', alignItems: 'center', gap: 4 }}><XCircle size={14} /> 失败 {sampledMetrics.requests.failed.toLocaleString()}</span>
                    </div>
                  </div>

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
                  <div className="monitoring-kpi-card" style={{ '--kpi-accent': kpiIcons.successRate.color } as React.CSSProperties}>
                    <div className="monitoring-kpi-header">
                      <span className="monitoring-kpi-icon" aria-hidden="true"><SuccessRateIcon size={20} /></span>
                      <span className="monitoring-kpi-label">成功率</span>
                    </div>
                    <div className="monitoring-kpi-value">{(sampledMetrics.requests.successRate * 100).toFixed(1)}%</div>
                    <div className="monitoring-kpi-detail">
                      <span>P95: {sampledMetrics.requests.p95Duration.toFixed(0)}ms</span>
                      <span>P99: {sampledMetrics.requests.p99Duration.toFixed(0)}ms</span>
                    </div>
                  </div>

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
                  <div className="monitoring-kpi-card" style={{ '--kpi-accent': kpiIcons.avgDuration.color } as React.CSSProperties}>
                    <div className="monitoring-kpi-header">
                      <span className="monitoring-kpi-icon" aria-hidden="true"><AvgDurationIcon size={20} /></span>
                      <span className="monitoring-kpi-label">平均响应时间</span>
                    </div>
                    <div className="monitoring-kpi-value">{sampledMetrics.requests.averageDuration.toFixed(0)}<span className="monitoring-kpi-unit">ms</span></div>
                    <div className="monitoring-kpi-detail">
                      <span className="monitoring-kpi-trend down"><ArrowUp size={14} style={{ marginRight: 4 }} />12%</span>
                      <span>较上周</span>
                    </div>
                  </div>

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
                  <div className="monitoring-kpi-card" style={{ '--kpi-accent': kpiIcons.activeConnections.color } as React.CSSProperties}>
                    <div className="monitoring-kpi-header">
                      <span className="monitoring-kpi-icon" aria-hidden="true"><ActiveConnectionsIcon size={20} /></span>
                      <span className="monitoring-kpi-label">活跃连接</span>
                    </div>
                    <div className="monitoring-kpi-value">{sampledMetrics.system.activeConnections}</div>
                    <div className="monitoring-kpi-detail">
                      <span className="status-dot success"></span>
                      <span>正常运行</span>
                    </div>
                  </div>

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
                  <div className="monitoring-kpi-card" style={{ '--kpi-accent': kpiIcons.memoryUsage.color } as React.CSSProperties}>
                    <div className="monitoring-kpi-header">
                      <span className="monitoring-kpi-icon" aria-hidden="true"><MemoryUsageIcon size={20} /></span>
                      <span className="monitoring-kpi-label">内存使用</span>
                    </div>
                    <div className="monitoring-kpi-value">{sampledMetrics.system.memoryUsage.toFixed(1)}<span className="monitoring-kpi-unit">%</span></div>
                    <div className="monitoring-kpi-detail">
                      <span>CPU: {sampledMetrics.system.cpuUsage.toFixed(1)}%</span>
                    </div>
                  </div>

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
                  <div className="monitoring-kpi-card" style={{ '--kpi-accent': kpiIcons.errors.color } as React.CSSProperties}>
                    <div className="monitoring-kpi-header">
                      <span className="monitoring-kpi-icon" aria-hidden="true"><ErrorsIcon size={20} /></span>
                      <span className="monitoring-kpi-label">错误数</span>
                    </div>
                    <div className="monitoring-kpi-value" style={{ color: sampledMetrics.requests.failed > 0 ? '#f28b82' : 'inherit' }}>
                      {sampledMetrics.requests.failed}
                    </div>
                    <div className="monitoring-kpi-detail">
                      <span>最近 {sampledMetrics.errors.length} 条错误</span>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

          {/* Charts */}
          <div className="monitoring-charts-grid">
            <div className="monitoring-chart-card">
              <div className="monitoring-chart-header">
                <div>
                  <div className="monitoring-chart-title">请求量趋势</div>
                  <div className="monitoring-chart-subtitle">最近 {timeRangeOptions.find(o => o.value === timeRange)?.label} </div>
                </div>
              </div>
              <div className="monitoring-chart-content">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={requestTimeSeriesData}>
                    <defs>
                      <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8ab4f8" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="#8ab4f8" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#3c3c5a" />
                    <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#9aa0a6' }} stroke="#3c3c5a" />
                    <YAxis tick={{ fontSize: 11, fill: '#9aa0a6' }} stroke="#3c3c5a" />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="requests" stroke="#8ab4f8" fill="url(#colorRequests)" name="请求数" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="monitoring-chart-card">
              <div className="monitoring-chart-header">
                <div>
                  <div className="monitoring-chart-title">响应时间趋势</div>
                  <div className="monitoring-chart-subtitle">平均响应时间 (ms)</div>
                </div>
              </div>
              <div className="monitoring-chart-content">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={requestTimeSeriesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#3c3c5a" />
                    <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#9aa0a6' }} stroke="#3c3c5a" />
                    <YAxis tick={{ fontSize: 11, fill: '#9aa0a6' }} stroke="#3c3c5a" />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="duration" stroke="#fdd663" name="响应时间 (ms)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="monitoring-chart-card">
              <div className="monitoring-chart-header">
                <div>
                  <div className="monitoring-chart-title">系统资源</div>
                  <div className="monitoring-chart-subtitle">CPU 和内存使用率</div>
                </div>
              </div>
              <div className="monitoring-chart-content">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={systemTimeSeriesData}>
                    <defs>
                      <linearGradient id="colorMemory" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#3c3c5a" />
                    <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#9aa0a6' }} stroke="#3c3c5a" />
                    <YAxis tick={{ fontSize: 11, fill: '#9aa0a6' }} stroke="#3c3c5a" domain={[0, 100]} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Area type="monotone" dataKey="memory" stroke="#8b5cf6" fill="url(#colorMemory)" name="内存 %" strokeWidth={2} />
                    <Area type="monotone" dataKey="cpu" stroke="#06b6d4" fill="url(#colorCpu)" name="CPU %" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="monitoring-chart-card">
              <div className="monitoring-chart-header">
                <div>
                  <div className="monitoring-chart-title">错误统计</div>
                  <div className="monitoring-chart-subtitle">错误请求数量</div>
                </div>
              </div>
              <div className="monitoring-chart-content">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={requestTimeSeriesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#3c3c5a" />
                    <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#9aa0a6' }} stroke="#3c3c5a" />
                    <YAxis tick={{ fontSize: 11, fill: '#9aa0a6' }} stroke="#3c3c5a" />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="requests" fill="#f28b82" name="错误数" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tools Tab */}
      {activeTab === 'tools' && (
        <div id="panel-tools" role="tabpanel" className="monitoring-tab-panel">
          <div className="monitoring-table-card">
            <div className="monitoring-table-header">
              <div className="monitoring-table-title">工具使用统计</div>
              <div className="monitoring-table-count">
                {Object.values(sampledMetrics.tools).reduce((sum, t) => sum + t.count, 0).toLocaleString()} 次调用
              </div>
            </div>
            <div className="table-container">
              <table className="monitoring-table" role="table">
                <thead>
                  <tr>
                    <th scope="col">工具</th>
                    <th scope="col">调用次数</th>
                    <th scope="col">平均耗时</th>
                    <th scope="col">成功率</th>
                    <th scope="col">慢调用</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(sampledMetrics.tools).map(([name, stats]) => {
                    const ToolIcon = toolIcon[name] || Wrench;
                    return (
                      <tr key={name}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="monitoring-tool-icon" aria-hidden="true"><ToolIcon size={18} /></span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500 }}>
                              {toolLabel[name] || name}
                            </span>
                          </div>
                        </td>
                        <td><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{stats.count.toLocaleString()}</span></td>
                        <td><span style={{ fontFamily: 'var(--font-mono)' }}>{stats.averageDuration.toFixed(0)}ms</span></td>
                        <td>
                          <span className={'status-badge ' + (stats.successRate >= 99 ? 'success' : stats.successRate >= 90 ? 'warning' : 'error')}>
                            {(stats.successRate * 100).toFixed(1)}%
                          </span>
                        </td>
                        <td>
                          {stats.slowCount > 0 ? (
                            <span className="monitoring-slow-badge">{stats.slowCount}</span>
                          ) : (
                            <span style={{ color: 'var(--text-tertiary)' }}>-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Alerts Tab */}
      {activeTab === 'alerts' && (
        <div id="panel-alerts" role="tabpanel" className="monitoring-tab-panel">
          <div className="monitoring-table-card">
            <div className="monitoring-table-header">
              <div className="monitoring-table-title">最近告警</div>
              <div className="monitoring-table-count">
                {wsAlerts.length + (sampledMetrics?.errors.length || 0)} 条
                {wsConnectionState === 'connected' && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--success-color)' }}>● 实时</span>
                )}
              </div>
            </div>
            {(wsAlerts.length === 0 && (!sampledMetrics || sampledMetrics.errors.length === 0)) ? (
              <div className="monitoring-empty">
                <div className="monitoring-empty-icon"><CheckCircle size={32} /></div>
                <div className="monitoring-empty-title">暂无告警</div>
                <div className="monitoring-empty-desc">系统运行正常，没有发现错误</div>
              </div>
            ) : (
              <div className="table-container">
                <table className="monitoring-table" role="table">
                  <thead>
                    <tr>
                      <th scope="col">时间</th>
                      <th scope="col">服务</th>
                      <th scope="col">消息</th>
                      <th scope="col">堆栈</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wsAlerts.map((alert, index) => (
                      <tr key={`ws-${index}`}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'nowrap' }}>
                          {new Date(alert.timestamp).toLocaleString('zh-CN')}
                        </td>
                        <td>
                          <span className="status-badge error">{alert.service}</span>
                        </td>
                        <td style={{ maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{alert.message}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-tertiary)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {alert.stack || '-'}
                        </td>
                      </tr>
                    ))}
                    {sampledMetrics?.errors.slice(-20).reverse().map((err, index) => (
                      <tr key={`metrics-${index}`}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'nowrap' }}>
                          {new Date(err.timestamp).toLocaleString('zh-CN')}
                        </td>
                        <td>
                          <span className="status-badge error">{err.service}</span>
                        </td>
                        <td style={{ maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{err.message}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-tertiary)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {err.stack || '-'}
                        </td>
                      </tr>
                    ))}
                    </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Logs Tab */}
      {activeTab === 'logs' && (
        <div id="panel-logs" role="tabpanel" className="monitoring-tab-panel">
          <div className="monitoring-table-card">
            <div className="monitoring-table-header">
              <div className="monitoring-table-title">系统日志</div>
              <div className="monitoring-table-count">{sampledMetrics.errors.length} 条</div>
            </div>
            <div style={{ maxHeight: 600, overflowY: 'auto' }}>
              {sampledMetrics.errors.length === 0 ? (
                <div className="monitoring-empty">
                  <div className="monitoring-empty-icon"><FileText size={32} /></div>
                  <div className="monitoring-empty-title">暂无日志</div>
                  <div className="monitoring-empty-desc">系统运行正常，没有日志记录</div>
                </div>
              ) : (
                <table className="monitoring-table" role="table">
                  <thead>
                    <tr>
                      <th scope="col">时间</th>
                      <th scope="col">级别</th>
                      <th scope="col">服务</th>
                      <th scope="col">消息</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sampledMetrics.errors.slice(-50).reverse().map((log, index) => (
                      <tr key={index}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'nowrap' }}>
                          {new Date(log.timestamp).toLocaleString('zh-CN')}
                        </td>
                        <td>
                          <span className="status-badge error">error</span>
                        </td>
                        <td>{log.service}</td>
                        <td style={{ maxWidth: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.message}</td>
                      </tr>
                    ))}
                    </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Performance Tab */}
      {activeTab === 'performance' && (
        <div id="panel-performance" role="tabpanel" className="monitoring-tab-panel">
          <div className="monitoring-performance-grid">
            <div className="monitoring-table-card">
              <div className="monitoring-table-header">
                <div className="monitoring-table-title">慢工具调用</div>
                <div className="monitoring-table-count">{sampledMetrics.performance.slowTools.length} 条</div>
              </div>
              {sampledMetrics.performance.slowTools.length === 0 ? (
                <div className="monitoring-empty">
                  <div className="monitoring-empty-icon"><Zap size={32} /></div>
                  <div className="monitoring-empty-title">暂无慢调用</div>
                  <div className="monitoring-empty-desc">所有工具调用都在正常时间内完成</div>
                </div>
              ) : (
                <div className="table-container">
                  <table className="monitoring-table" role="table">
                    <thead>
                      <tr>
                        <th scope="col">工具</th>
                        <th scope="col">耗时</th>
                        <th scope="col">时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sampledMetrics.performance.slowTools.slice(-10).reverse().map((tool, index) => {
                        const ToolIcon = toolIcon[tool.name] || Wrench;
                        return (
                          <tr key={index}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span className="monitoring-tool-icon" aria-hidden="true"><ToolIcon size={18} /></span>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500 }}>{tool.name}</span>
                              </div>
                            </td>
                            <td>
                              <span className="monitoring-duration">{tool.duration.toFixed(0)}ms</span>
                            </td>
                            <td style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{new Date(tool.timestamp).toLocaleString('zh-CN')}</td>
                          </tr>
                      );
                    })}
                    </tbody>
                   </table>
                </div>
              )}
            </div>
            <div className="monitoring-table-card">
            <div className="monitoring-table-header">
              <div className="monitoring-table-title">热文件访问排行</div>
              <div className="monitoring-table-count">{sampledMetrics.performance.hotFiles.length} 个文件</div>
            </div>
              {sampledMetrics.performance.hotFiles.length === 0 ? (
                <div className="monitoring-empty">
                  <div className="monitoring-empty-icon"><FolderOpen size={32} /></div>
                  <div className="monitoring-empty-title">暂无数据</div>
                  <div className="monitoring-empty-desc">还没有文件访问记录</div>
                </div>
              ) : (
                <div className="table-container">
                  <table className="monitoring-table" role="table">
                    <thead>
                      <tr>
                        <th scope="col">文件路径</th>
                        <th scope="col">访问次数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sampledMetrics.performance.hotFiles.map((file, index) => (
                        <tr key={index}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{file.path}</td>
                          <td>
                            <span className="status-badge" style={{ background: '#8ab4f820', color: '#8ab4f8' }}>
                              {file.accessCount}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
