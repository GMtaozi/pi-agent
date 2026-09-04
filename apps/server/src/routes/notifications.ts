import type { FastifyInstance } from 'fastify';

export interface NotificationRouteDeps {
  notificationService?: any;
}

export function registerNotificationRoutes(server: FastifyInstance, deps: NotificationRouteDeps): void {
  const { notificationService } = deps;

  // GET /api/v1/notifications - List notifications
  server.get('/api/v1/notifications', async (req, res) => {
    if (!notificationService) {
      return res.code(503).send({ error: 'Notification service unavailable' });
    }
    try {
      const userId = (req as any).userId;
      if (!userId) return res.code(401).send({ error: 'Unauthorized' });
      const { unreadOnly, limit } = req.query as any;
      const notifications = await notificationService.listNotifications(userId, {
        unreadOnly: unreadOnly === 'true',
        limit: limit ? parseInt(limit) : undefined,
      });
      return res.send(notifications);
    } catch (error) {
      req.log.error({ error }, 'List notifications failed');
      return res.code(500).send({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/notifications/unread-count - Get unread count
  server.get('/api/v1/notifications/unread-count', async (req, res) => {
    if (!notificationService) {
      return res.code(503).send({ error: 'Notification service unavailable' });
    }
    try {
      const userId = (req as any).userId;
      if (!userId) return res.code(401).send({ error: 'Unauthorized' });
      const count = await notificationService.getUnreadCount(userId);
      return res.send({ count });
    } catch (error) {
      req.log.error({ error }, 'Get unread count failed');
      return res.code(500).send({ error: 'Internal server error' });
    }
  });

  // PUT /api/v1/notifications/:id/read - Mark as read
  server.put('/api/v1/notifications/:id/read', async (req, res) => {
    if (!notificationService) {
      return res.code(503).send({ error: 'Notification service unavailable' });
    }
    try {
      const userId = (req as any).userId;
      if (!userId) return res.code(401).send({ error: 'Unauthorized' });
      const { id } = req.params as { id: string };
      await notificationService.markAsRead(id, userId);
      return res.send({ message: 'Marked as read' });
    } catch (error) {
      req.log.error({ error }, 'Mark as read failed');
      return res.code(500).send({ error: 'Internal server error' });
    }
  });

  // PUT /api/v1/notifications/read-all - Mark all as read
  server.put('/api/v1/notifications/read-all', async (req, res) => {
    if (!notificationService) {
      return res.code(503).send({ error: 'Notification service unavailable' });
    }
    try {
      const userId = (req as any).userId;
      if (!userId) return res.code(401).send({ error: 'Unauthorized' });
      await notificationService.markAllAsRead(userId);
      return res.send({ message: 'All marked as read' });
    } catch (error) {
      req.log.error({ error }, 'Mark all as read failed');
      return res.code(500).send({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/notification-channels - Create notification channel
  server.post('/api/v1/notification-channels', async (req, res) => {
    if (!notificationService) {
      return res.code(503).send({ error: 'Notification service unavailable' });
    }
    try {
      const userId = (req as any).userId;
      if (!userId) return res.code(401).send({ error: 'Unauthorized' });
      const { type, name, config } = req.body as any;

      if (!type || !name || !config) {
        return res.code(400).send({ error: 'Type, name, and config are required' });
      }

      const channel = await notificationService.createChannel({ userId, type, name, config });
      return res.code(201).send(channel);
    } catch (error) {
      req.log.error({ error }, 'Create notification channel failed');
      return res.code(500).send({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/notification-channels - List notification channels
  server.get('/api/v1/notification-channels', async (req, res) => {
    if (!notificationService) {
      return res.code(503).send({ error: 'Notification service unavailable' });
    }
    try {
      const userId = (req as any).userId;
      if (!userId) return res.code(401).send({ error: 'Unauthorized' });
      const channels = await notificationService.listChannels(userId);
      return res.send(channels);
    } catch (error) {
      req.log.error({ error }, 'List notification channels failed');
      return res.code(500).send({ error: 'Internal server error' });
    }
  });

  // DELETE /api/v1/notification-channels/:id - Delete notification channel
  server.delete('/api/v1/notification-channels/:id', async (req, res) => {
    if (!notificationService) {
      return res.code(503).send({ error: 'Notification service unavailable' });
    }
    try {
      const userId = (req as any).userId;
      if (!userId) return res.code(401).send({ error: 'Unauthorized' });
      const { id } = req.params as { id: string };
      await notificationService.deleteChannel(id, userId);
      return res.send({ message: 'Channel deleted' });
    } catch (error) {
      req.log.error({ error }, 'Delete notification channel failed');
      return res.code(500).send({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/alert-rules - Create alert rule
  server.post('/api/v1/alert-rules', async (req, res) => {
    if (!notificationService) {
      return res.code(503).send({ error: 'Notification service unavailable' });
    }
    try {
      const userId = (req as any).userId;
      if (!userId) return res.code(401).send({ error: 'Unauthorized' });
      const { name, ruleType, threshold, windowMinutes, channelIds } = req.body as any;

      if (!name || !ruleType || threshold === undefined || !channelIds) {
        return res.code(400).send({ error: 'Name, ruleType, threshold, and channelIds are required' });
      }

      const rule = await notificationService.createAlertRule({
        userId,
        name,
        ruleType,
        threshold,
        windowMinutes,
        channelIds,
      });
      return res.code(201).send(rule);
    } catch (error) {
      req.log.error({ error }, 'Create alert rule failed');
      return res.code(500).send({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/alert-rules - List alert rules
  server.get('/api/v1/alert-rules', async (req, res) => {
    if (!notificationService) {
      return res.code(503).send({ error: 'Notification service unavailable' });
    }
    try {
      const userId = (req as any).userId;
      if (!userId) return res.code(401).send({ error: 'Unauthorized' });
      const rules = await notificationService.listAlertRules(userId);
      return res.send(rules);
    } catch (error) {
      req.log.error({ error }, 'List alert rules failed');
      return res.code(500).send({ error: 'Internal server error' });
    }
  });

  // DELETE /api/v1/alert-rules/:id - Delete alert rule
  server.delete('/api/v1/alert-rules/:id', async (req, res) => {
    if (!notificationService) {
      return res.code(503).send({ error: 'Notification service unavailable' });
    }
    try {
      const userId = (req as any).userId;
      if (!userId) return res.code(401).send({ error: 'Unauthorized' });
      const { id } = req.params as { id: string };
      await notificationService.deleteAlertRule(id, userId);
      return res.send({ message: 'Alert rule deleted' });
    } catch (error) {
      req.log.error({ error }, 'Delete alert rule failed');
      return res.code(500).send({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/notification-silence - 设置静默窗口（免打扰）
  server.post('/api/v1/notification-silence', async (req, res) => {
    if (!notificationService) {
      return res.code(503).send({ error: 'Notification service unavailable' });
    }
    try {
      const userId = (req as any).userId;
      if (!userId) return res.code(401).send({ error: 'Unauthorized' });
      const { until, reason } = req.body as any;
      if (!until) {
        return res.code(400).send({ error: 'until (ISO timestamp) is required' });
      }
      const entry = await notificationService.setSilenceUntil(userId, until, reason);
      return res.code(201).send(entry);
    } catch (error) {
      req.log.error({ error }, 'Set silence window failed');
      return res.code(500).send({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/notification-silence - 查询当前静默窗口
  server.get('/api/v1/notification-silence', async (req, res) => {
    if (!notificationService) {
      return res.code(503).send({ error: 'Notification service unavailable' });
    }
    try {
      const userId = (req as any).userId;
      if (!userId) return res.code(401).send({ error: 'Unauthorized' });
      const entry = await notificationService.getSilence(userId);
      return res.send({ silence: entry });
    } catch (error) {
      req.log.error({ error }, 'Get silence window failed');
      return res.code(500).send({ error: 'Internal server error' });
    }
  });

  // DELETE /api/v1/notification-silence - 清除静默窗口
  server.delete('/api/v1/notification-silence', async (req, res) => {
    if (!notificationService) {
      return res.code(503).send({ error: 'Notification service unavailable' });
    }
    try {
      const userId = (req as any).userId;
      if (!userId) return res.code(401).send({ error: 'Unauthorized' });
      await notificationService.clearSilence(userId);
      return res.send({ message: 'Silence window cleared' });
    } catch (error) {
      req.log.error({ error }, 'Clear silence window failed');
      return res.code(500).send({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/notification-channels/:id/test - 向指定渠道发送一条测试通知
  server.post('/api/v1/notification-channels/:id/test', async (req, res) => {
    if (!notificationService) {
      return res.code(503).send({ error: 'Notification service unavailable' });
    }
    try {
      const userId = (req as any).userId;
      if (!userId) return res.code(401).send({ error: 'Unauthorized' });
      const { id } = req.params as { id: string };
      const channel = await notificationService.getChannel(id, userId);
      if (!channel) {
        return res.code(404).send({ error: 'Channel not found' });
      }
      const notification = await notificationService.createNotification({
        userId,
        channelId: id,
        type: 'info',
        title: 'Test notification',
        content: 'This is a test message from pi-agent notification service.',
        severity: 'info',
      });
      const result = await notificationService.dispatch(channel, notification);
      return res.send({ result });
    } catch (error) {
      req.log.error({ error }, 'Test dispatch failed');
      return res.code(500).send({ error: 'Internal server error' });
    }
  });
}
