export interface MetricSummary {
  name: string;
  count: number;
  average: number;
  min: number;
  max: number;
  lastValue: number;
  unit: string;
}

export interface TimeSeriesPoint {
  timestamp: number;
  value: number;
}

export interface DashboardData {
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
  errors: Array<{
    timestamp: string;
    message: string;
    service: string;
    stack?: string;
  }>;
  system: {
    memoryUsage: number;
    cpuUsage: number;
    activeConnections: number;
  };
  timeSeries: {
    requests: TimeSeriesPoint[];
    duration: TimeSeriesPoint[];
    errors: TimeSeriesPoint[];
    memory: TimeSeriesPoint[];
    cpu: TimeSeriesPoint[];
  };
  performance: {
    slowTools: Array<{ name: string; duration: number; timestamp: string }>;
    hotFiles: Array<{ path: string; accessCount: number }>;
  };
}

export interface AlertRule {
  id: string;
  name: string;
  condition: string;
  threshold: number;
  enabled: boolean;
  lastTriggered?: string;
}

export interface Alert {
  id: string;
  ruleId: string;
  name: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: string;
  acknowledged: boolean;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  service: string;
  message: string;
  context?: Record<string, unknown>;
  error?: string;
}

export interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    database: boolean;
    cache: boolean;
    provider: boolean;
    workspace: boolean;
  };
  uptime: number;
  lastCheck: string;
}

export class MetricsDashboard {
  private startTime = Date.now();
  private requestCount = 0;
  private successCount = 0;
  private failedCount = 0;
  private totalDuration = 0;
  private durationSamples: number[] = [];
  private toolSuccessCounts = { readFile: 0, writeFile: 0, editFile: 0 };
  private toolCounts = { readFile: 0, writeFile: 0, editFile: 0 };
  private toolDurations = { readFile: 0, writeFile: 0, editFile: 0 };
  private toolSlowCounts = { readFile: 0, writeFile: 0, editFile: 0 };
  private recentErrors: Array<{ timestamp: string; message: string; service: string; stack?: string }> = [];
  private readonly maxErrors = 100;

  // Time series data
  private requestTimeSeries: TimeSeriesPoint[] = [];
  private durationTimeSeries: TimeSeriesPoint[] = [];
  private errorTimeSeries: TimeSeriesPoint[] = [];
  private memoryTimeSeries: TimeSeriesPoint[] = [];
  private cpuTimeSeries: TimeSeriesPoint[] = [];
  private readonly maxTimeSeriesPoints = 100;

  // Alerts
  private alertRules: AlertRule[] = [
    { id: 'high-error-rate', name: 'High Error Rate', condition: 'error_rate >', threshold: 20, enabled: true },
    { id: 'slow-response', name: 'Slow Response', condition: 'avg_duration >', threshold: 5000, enabled: true },
    { id: 'high-memory', name: 'High Memory Usage', condition: 'memory_usage >', threshold: 500, enabled: true },
    { id: 'high-cpu', name: 'High CPU Usage', condition: 'cpu_usage >', threshold: 80, enabled: true }
  ];
  private alerts: Alert[] = [];
  private readonly maxAlerts = 50;

  // Performance tracking
  private slowTools: Array<{ name: string; duration: number; timestamp: string }> = [];
  private fileAccessCounts = new Map<string, number>();
  private readonly maxSlowTools = 50;

  // Logs
  private logs: LogEntry[] = [];
  private readonly maxLogs = 500;

  // Health
  private healthChecks = {
    database: true,
    cache: true,
    provider: true,
    workspace: true
  };

  recordRequest(success: boolean, duration: number): void {
    this.requestCount++;
    this.totalDuration += duration;
    this.durationSamples.push(duration);

    if (success) {
      this.successCount++;
    } else {
      this.failedCount++;
    }

    // Record time series
    const now = Date.now();
    this.requestTimeSeries.push({ timestamp: now, value: 1 });
    this.durationTimeSeries.push({ timestamp: now, value: duration });

    // Trim time series
    if (this.requestTimeSeries.length > this.maxTimeSeriesPoints) {
      this.requestTimeSeries = this.requestTimeSeries.slice(-this.maxTimeSeriesPoints);
    }
    if (this.durationTimeSeries.length > this.maxTimeSeriesPoints) {
      this.durationTimeSeries = this.durationTimeSeries.slice(-this.maxTimeSeriesPoints);
    }

    // Track slow requests
    if (duration > 3000) {
      this.slowTools.push({
        name: 'request',
        duration,
        timestamp: new Date().toISOString()
      });
      if (this.slowTools.length > this.maxSlowTools) {
        this.slowTools = this.slowTools.slice(-this.maxSlowTools);
      }
    }

    // Check alerts
    this.checkAlerts();
  }

  recordToolCall(toolName: string, duration: number, success: boolean): void {
    if (toolName in this.toolCounts) {
      this.toolCounts[toolName as keyof typeof this.toolCounts]++;
      this.toolDurations[toolName as keyof typeof this.toolDurations] += duration;
      if (success) {
        this.toolSuccessCounts[toolName as keyof typeof this.toolSuccessCounts]++;
      }
      if (duration > 2000) {
        this.toolSlowCounts[toolName as keyof typeof this.toolSlowCounts]++;
      }
    }

    // Track file access
    if (toolName === 'read_file' || toolName === 'write_file' || toolName === 'edit_file') {
      // Note: path tracking would need to be passed here
    }
  }

  recordError(message: string, service: string, stack?: string): void {
    this.recentErrors.push({
      timestamp: new Date().toISOString(),
      message,
      service,
      stack
    });

    if (this.recentErrors.length > this.maxErrors) {
      this.recentErrors = this.recentErrors.slice(-this.maxErrors);
    }

    // Record error time series
    const now = Date.now();
    this.errorTimeSeries.push({ timestamp: now, value: 1 });

    if (this.errorTimeSeries.length > this.maxTimeSeriesPoints) {
      this.errorTimeSeries = this.errorTimeSeries.slice(-this.maxTimeSeriesPoints);
    }

    // Add log entry
    this.addLog('error', service, message, undefined, stack);

    // Check alerts
    this.checkAlerts();
  }

  recordLog(level: string, service: string, message: string, context?: Record<string, unknown>, error?: string): void {
    this.addLog(level, service, message, context, error);
  }

  private addLog(level: string, service: string, message: string, context?: Record<string, unknown>, error?: string): void {
    this.logs.push({
      timestamp: new Date().toISOString(),
      level,
      service,
      message,
      context,
      error
    });

    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
  }

  updateSystemMetrics(memoryUsage: number, cpuUsage: number): void {
    const now = Date.now();
    this.memoryTimeSeries.push({ timestamp: now, value: memoryUsage });
    this.cpuTimeSeries.push({ timestamp: now, value: cpuUsage });

    if (this.memoryTimeSeries.length > this.maxTimeSeriesPoints) {
      this.memoryTimeSeries = this.memoryTimeSeries.slice(-this.maxTimeSeriesPoints);
    }
    if (this.cpuTimeSeries.length > this.maxTimeSeriesPoints) {
      this.cpuTimeSeries = this.cpuTimeSeries.slice(-this.maxTimeSeriesPoints);
    }
  }

  updateHealthCheck(name: keyof typeof this.healthChecks, status: boolean): void {
    this.healthChecks[name] = status;
  }

  getHealthStatus(): HealthCheck {
    const checks = this.healthChecks;
    const allHealthy = Object.values(checks).every(v => v);
    const anyUnhealthy = Object.values(checks).some(v => !v);

    return {
      status: allHealthy ? 'healthy' : anyUnhealthy ? 'unhealthy' : 'degraded',
      checks,
      uptime: Date.now() - this.startTime,
      lastCheck: new Date().toISOString()
    };
  }

  private checkAlerts(): void {
    const errorRate = this.requestCount > 0 ? (this.failedCount / this.requestCount) * 100 : 0;
    const avgDuration = this.requestCount > 0 ? this.totalDuration / this.requestCount : 0;
    const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
    const cpuUsage = this.cpuTimeSeries.length > 0 ? this.cpuTimeSeries[this.cpuTimeSeries.length - 1].value : 0;

    for (const rule of this.alertRules) {
      if (!rule.enabled) continue;

      let triggered = false;
      let message = '';

      switch (rule.id) {
        case 'high-error-rate':
          if (errorRate > rule.threshold) {
            triggered = true;
            message = 'Error rate is ' + errorRate.toFixed(1) + '% (threshold: ' + rule.threshold + '%)';
          }
          break;
        case 'slow-response':
          if (avgDuration > rule.threshold) {
            triggered = true;
            message = 'Average response time is ' + avgDuration.toFixed(0) + 'ms (threshold: ' + rule.threshold + 'ms)';
          }
          break;
        case 'high-memory':
          if (memoryUsage > rule.threshold) {
            triggered = true;
            message = 'Memory usage is ' + memoryUsage.toFixed(1) + 'MB (threshold: ' + rule.threshold + 'MB)';
          }
          break;
        case 'high-cpu':
          if (cpuUsage > rule.threshold) {
            triggered = true;
            message = 'CPU usage is ' + cpuUsage.toFixed(1) + '% (threshold: ' + rule.threshold + '%)';
          }
          break;
      }

      if (triggered) {
        this.alerts.push({
          id: Date.now().toString() + Math.random().toString(36).slice(2, 8),
          ruleId: rule.id,
          name: rule.name,
          message,
          severity: rule.id === 'high-error-rate' ? 'critical' : 'warning',
          timestamp: new Date().toISOString(),
          acknowledged: false
        });

        if (this.alerts.length > this.maxAlerts) {
          this.alerts = this.alerts.slice(-this.maxAlerts);
        }
      }
    }
  }

  getDashboardData(): DashboardData {
    const uptime = Date.now() - this.startTime;
    const errorRate = this.requestCount > 0 ? (this.failedCount / this.requestCount) * 100 : 0;
    const avgDuration = this.requestCount > 0 ? this.totalDuration / this.requestCount : 0;
    const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
    const cpuUsage = this.cpuTimeSeries.length > 0 ? this.cpuTimeSeries[this.cpuTimeSeries.length - 1].value : 0;

    // Calculate percentiles
    const sortedDurations = [...this.durationSamples].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedDurations.length * 0.95);
    const p99Index = Math.floor(sortedDurations.length * 0.99);
    const p95Duration = sortedDurations.length > 0 ? sortedDurations[Math.min(p95Index, sortedDurations.length - 1)] : 0;
    const p99Duration = sortedDurations.length > 0 ? sortedDurations[Math.min(p99Index, sortedDurations.length - 1)] : 0;

    // Health status
    const health = this.getHealthStatus().status;

    // Hot files
    const hotFiles = Array.from(this.fileAccessCounts.entries())
      .map(([path, count]) => ({ path, accessCount: count }))
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, 10);

    return {
      timestamp: new Date().toISOString(),
      uptime,
      health,
      requests: {
        total: this.requestCount,
        success: this.successCount,
        failed: this.failedCount,
        averageDuration: avgDuration,
        successRate: errorRate,
        p95Duration,
        p99Duration
      },
      tools: {
        readFile: {
          count: this.toolCounts.readFile,
          averageDuration: this.toolCounts.readFile > 0 ? this.toolDurations.readFile / this.toolCounts.readFile : 0,
          successRate: this.toolCounts.readFile > 0 ? (this.toolSuccessCounts.readFile / this.toolCounts.readFile) * 100 : 100,
          slowCount: this.toolSlowCounts.readFile
        },
        writeFile: {
          count: this.toolCounts.writeFile,
          averageDuration: this.toolCounts.writeFile > 0 ? this.toolDurations.writeFile / this.toolCounts.writeFile : 0,
          successRate: this.toolCounts.writeFile > 0 ? (this.toolSuccessCounts.writeFile / this.toolCounts.writeFile) * 100 : 100,
          slowCount: this.toolSlowCounts.writeFile
        },
        editFile: {
          count: this.toolCounts.editFile,
          averageDuration: this.toolCounts.editFile > 0 ? this.toolDurations.editFile / this.toolCounts.editFile : 0,
          successRate: this.toolCounts.editFile > 0 ? (this.toolSuccessCounts.editFile / this.toolCounts.editFile) * 100 : 100,
          slowCount: this.toolSlowCounts.editFile
        }
      },
      errors: this.recentErrors.slice(-20),
      system: {
        memoryUsage,
        cpuUsage,
        activeConnections: 0
      },
      timeSeries: {
        requests: this.requestTimeSeries,
        duration: this.durationTimeSeries,
        errors: this.errorTimeSeries,
        memory: this.memoryTimeSeries,
        cpu: this.cpuTimeSeries
      },
      performance: {
        slowTools: this.slowTools.slice(-10),
        hotFiles
      }
    };
  }

  getMetricsSummary(): MetricSummary[] {
    const metrics: MetricSummary[] = [];
    const errorRate = this.requestCount > 0 ? (this.failedCount / this.requestCount) * 100 : 0;
    const avgDuration = this.requestCount > 0 ? this.totalDuration / this.requestCount : 0;

    metrics.push({
      name: 'requests.total',
      count: this.requestCount,
      average: avgDuration,
      min: 0,
      max: 0,
      lastValue: this.requestCount,
      unit: 'count'
    });

    metrics.push({
      name: 'requests.success_rate',
      count: this.requestCount,
      average: errorRate,
      min: 0,
      max: 100,
      lastValue: errorRate,
      unit: '%'
    });

    for (const [tool, count] of Object.entries(this.toolCounts)) {
      const duration = this.toolDurations[tool as keyof typeof this.toolDurations];
      metrics.push({
        name: 'tool.' + tool + '.count',
        count,
        average: count > 0 ? duration / count : 0,
        min: 0,
        max: 0,
        lastValue: count,
        unit: 'count'
      });
    }

    return metrics;
  }

  getLogs(level?: string, service?: string, limit = 100): LogEntry[] {
    let filtered = this.logs;
    if (level) {
      filtered = filtered.filter(log => log.level === level);
    }
    if (service) {
      filtered = filtered.filter(log => log.service === service);
    }
    return filtered.slice(-limit);
  }

  searchLogs(query: string, limit = 100): LogEntry[] {
    const lowerQuery = query.toLowerCase();
    return this.logs.filter(log =>
      log.message.toLowerCase().includes(lowerQuery) ||
      log.service.toLowerCase().includes(lowerQuery) ||
      (log.error && log.error.toLowerCase().includes(lowerQuery))
    ).slice(-limit);
  }

  getAlerts(): Alert[] {
    return [...this.alerts];
  }

  acknowledgeAlert(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
    }
  }

  reset(): void {
    this.requestCount = 0;
    this.successCount = 0;
    this.failedCount = 0;
    this.totalDuration = 0;
    this.durationSamples = [];
    this.toolCounts = { readFile: 0, writeFile: 0, editFile: 0 };
    this.toolSuccessCounts = { readFile: 0, writeFile: 0, editFile: 0 };
    this.toolDurations = { readFile: 0, writeFile: 0, editFile: 0 };
    this.toolSlowCounts = { readFile: 0, writeFile: 0, editFile: 0 };
    this.recentErrors = [];
    this.requestTimeSeries = [];
    this.durationTimeSeries = [];
    this.errorTimeSeries = [];
    this.memoryTimeSeries = [];
    this.cpuTimeSeries = [];
    this.alerts = [];
    this.slowTools = [];
    this.logs = [];
    this.fileAccessCounts.clear();
    this.startTime = Date.now();
  }
}
