import { Logger } from '@workforge/logging';
import { MetricsDashboard, DashboardData, Alert, LogEntry, HealthCheck } from './metrics-dashboard.js';

export class MonitoringService {
  private dashboard = new MetricsDashboard();
  private logger: Logger;

  constructor() {
    this.logger = new Logger({ service: 'monitoring', level: 'info' });
  }

  recordRequest(success: boolean, duration: number): void {
    this.dashboard.recordRequest(success, duration);
  }

  recordToolCall(toolName: string, duration: number, success: boolean): void {
    this.dashboard.recordToolCall(toolName, duration, success);
    this.logger.debug('Tool call recorded', { toolName, duration, success });
  }

  recordError(message: string, service: string, stack?: string): void {
    this.dashboard.recordError(message, service, stack);
    this.logger.warn('Error recorded', { message, service });
  }

  recordLog(level: string, service: string, message: string, context?: Record<string, unknown>, error?: string): void {
    this.dashboard.recordLog(level, service, message, context, error);
  }

  updateSystemMetrics(memoryUsage: number, cpuUsage: number): void {
    this.dashboard.updateSystemMetrics(memoryUsage, cpuUsage);
  }

  updateHealthCheck(name: string, status: boolean): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    this.dashboard.updateHealthCheck(name as any, status);
  }

  getDashboardData(): DashboardData {
    return this.dashboard.getDashboardData();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  getMetricsSummary(): any[] {
    return this.dashboard.getMetricsSummary();
  }

  getLogs(level?: string, service?: string, limit = 100): LogEntry[] {
    return this.dashboard.getLogs(level, service, limit);
  }

  searchLogs(query: string, limit = 100): LogEntry[] {
    return this.dashboard.searchLogs(query, limit);
  }

  getHealthStatus(): HealthCheck {
    return this.dashboard.getHealthStatus();
  }

  getAlerts(): Alert[] {
    return this.dashboard.getAlerts();
  }

  acknowledgeAlert(alertId: string): void {
    this.dashboard.acknowledgeAlert(alertId);
    this.logger.info('Alert acknowledged', { alertId });
  }

  reset(): void {
    this.dashboard.reset();
    this.logger.info('Monitoring metrics reset');
  }
}