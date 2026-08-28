import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from './deps.js';
import 'path';

export function registerMonitoringRoutes(server: FastifyInstance, deps: ServerDeps): void {
  server.get('/api/monitoring/dashboard', async () => {
    return deps.monitoring.getDashboardData();
  });

  server.get('/api/monitoring/metrics', async () => {
    return deps.monitoring.getMetricsSummary();
  });

  server.post('/api/monitoring/reset', async () => {
    deps.monitoring.reset();
    return { ok: true };
  });

  server.get('/api/monitoring/alerts', async () => {
    return deps.monitoring.getAlerts();
  });

  server.post('/api/monitoring/alerts/:id/acknowledge', async (req, _res) => {
    const { id } = req.params as { id: string };
    deps.monitoring.acknowledgeAlert(id);
    return { ok: true };
  });

  server.get('/api/monitoring/health', async () => {
    return deps.monitoring.getHealthStatus();
  });

  server.get('/api/monitoring/logs', async (req, _res) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const level = (req.query as any).level as string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const service = (req.query as any).service as string | undefined;
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const limit = (req.query as any).limit ? parseInt((req.query as any).limit) : 100;
    return deps.monitoring.getLogs(level, service, limit);
  });

  server.get('/api/monitoring/logs/search', async (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const query = (req.query as any).q as string | undefined;
    if (!query) {
      return res.status(400).send({ error: 'Query parameter q is required' });
    }
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const limit = (req.query as any).limit ? parseInt((req.query as any).limit) : 100;
    return deps.monitoring.searchLogs(query, limit);
  });

   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  server.get('/api/monitoring/ws', { websocket: true }, (connection: any, _req: any) => {
    console.log('Monitoring WebSocket client connected');
    if (connection.socket && typeof connection.socket.send === 'function') {
      connection.socket.send(JSON.stringify({
        type: 'connected',
        data: deps.monitoring.getDashboardData()
      }));
    }
    const interval = setInterval(() => {
      if (connection.socket.readyState === 1) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        const alerts = deps.monitoring.getAlerts().filter((a: any) => !a.acknowledged);
        if (alerts.length > 0) {
          connection.socket.send(JSON.stringify({
            type: 'alerts',
            data: alerts
          }));
        }
      }
    }, 5000);
    connection.socket.on('close', () => {
      clearInterval(interval);
      console.log('Monitoring WebSocket client disconnected');
    });
    connection.socket.on('error', (err: Error) => {
      console.error('Monitoring WebSocket error:', err);
      clearInterval(interval);
    });
  });
}
