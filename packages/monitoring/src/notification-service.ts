import { randomBytes, createHmac } from 'crypto';

export interface NotificationChannel {
  id: string;
  user_id: string;
  type: 'email' | 'webhook' | 'slack' | 'feishu' | 'dingtalk';
  name: string;
  config: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface DispatchResult {
  ok: boolean;
  error?: string;
}

export interface SilenceEntry {
  id: string;
  user_id: string;
  until: string;
  reason?: string;
  created_at: string;
}

export interface AlertRule {
  id: string;
  user_id: string;
  name: string;
  rule_type: 'cost_threshold' | 'failure_rate' | 'token_usage' | 'execution_count';
  threshold: number;
  window_minutes: number;
  channels: string;
  enabled: number;
  last_triggered_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  channel_id?: string;
  alert_rule_id?: string;
  type: 'alert' | 'info' | 'warning' | 'error';
  title: string;
  content: string;
  severity: 'info' | 'warning' | 'critical';
  read: number;
  metadata?: string;
  created_at: string;
}

function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
}

export class NotificationService {
  private db: any;
  private logger: any;

  constructor(db: any, logger?: any) {
    this.db = db;
    this.logger = logger || {
      info: (msg: string, data?: any) => console.log('[Notification]', msg, data || ''),
      warn: (msg: string, data?: any) => console.warn('[Notification]', msg, data || ''),
      error: (msg: string, data?: any) => console.error('[Notification]', msg, data || ''),
    };
  }

  async createChannel(data: {
    userId: string;
    type: 'email' | 'webhook' | 'slack' | 'feishu' | 'dingtalk';
    name: string;
    config: Record<string, any>;
  }): Promise<NotificationChannel> {
    const id = generateId('nch');
    const now = new Date().toISOString();
    const channel: NotificationChannel = {
      id,
      user_id: data.userId,
      type: data.type,
      name: data.name,
      config: JSON.stringify(data.config),
      enabled: 1,
      created_at: now,
      updated_at: now,
    };

    await this.db.query('notification_channels',
      `INSERT INTO notification_channels (id, user_id, type, name, config, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [channel.id, channel.user_id, channel.type, channel.name, channel.config, channel.enabled, channel.created_at, channel.updated_at]
    );

    return channel;
  }

  async listChannels(userId: string): Promise<NotificationChannel[]> {
    const result = await this.db.query('notification_channels',
      'SELECT * FROM notification_channels WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return result.rows.map((r: any) => ({ ...r, config: JSON.parse(r.config) }));
  }

  async deleteChannel(id: string, userId: string): Promise<void> {
    await this.db.query('notification_channels',
      'DELETE FROM notification_channels WHERE id = ? AND user_id = ?',
      [id, userId]
    );
  }

  async createAlertRule(data: {
    userId: string;
    name: string;
    ruleType: 'cost_threshold' | 'failure_rate' | 'token_usage' | 'execution_count';
    threshold: number;
    windowMinutes?: number;
    channelIds: string[];
  }): Promise<AlertRule> {
    const id = generateId('arl');
    const now = new Date().toISOString();
    const rule: AlertRule = {
      id,
      user_id: data.userId,
      name: data.name,
      rule_type: data.ruleType,
      threshold: data.threshold,
      window_minutes: data.windowMinutes || 60,
      channels: JSON.stringify(data.channelIds),
      enabled: 1,
      created_at: now,
      updated_at: now,
    };

    await this.db.query('alert_rules',
      `INSERT INTO alert_rules (id, user_id, name, rule_type, threshold, window_minutes, channels, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [rule.id, rule.user_id, rule.name, rule.rule_type, rule.threshold, rule.window_minutes, rule.channels, rule.enabled, rule.created_at, rule.updated_at]
    );

    return rule;
  }

  async listAlertRules(userId: string): Promise<AlertRule[]> {
    const result = await this.db.query('alert_rules',
      'SELECT * FROM alert_rules WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return result.rows.map((r: any) => ({ ...r, channels: JSON.parse(r.channels) }));
  }

  async deleteAlertRule(id: string, userId: string): Promise<void> {
    await this.db.query('alert_rules',
      'DELETE FROM alert_rules WHERE id = ? AND user_id = ?',
      [id, userId]
    );
  }

  async createNotification(data: {
    userId: string;
    channelId?: string;
    alertRuleId?: string;
    type: 'alert' | 'info' | 'warning' | 'error';
    title: string;
    content: string;
    severity?: 'info' | 'warning' | 'critical';
    metadata?: Record<string, any>;
  }): Promise<Notification> {
    const id = generateId('ntf');
    const now = new Date().toISOString();
    const notification: Notification = {
      id,
      user_id: data.userId,
      channel_id: data.channelId,
      alert_rule_id: data.alertRuleId,
      type: data.type,
      title: data.title,
      content: data.content,
      severity: data.severity || 'info',
      read: 0,
      metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
      created_at: now,
    };

    await this.db.query('notifications',
      `INSERT INTO notifications (id, user_id, channel_id, alert_rule_id, type, title, content, severity, read, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [notification.id, notification.user_id, notification.channel_id, notification.alert_rule_id,
       notification.type, notification.title, notification.content, notification.severity,
       notification.read, notification.metadata, notification.created_at]
    );

    return notification;
  }

  async listNotifications(userId: string, options: { unreadOnly?: boolean; limit?: number } = {}): Promise<Notification[]> {
    let sql = 'SELECT * FROM notifications WHERE user_id = ?';
    const params: any[] = [userId];

    if (options.unreadOnly) {
      sql += ' AND read = 0';
    }

    sql += ' ORDER BY created_at DESC';

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const result = await this.db.query('notifications', sql, params);
    return result.rows.map((r: any) => ({
      ...r,
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
    }));
  }

  async markAsRead(id: string, userId: string): Promise<void> {
    await this.db.query('notifications',
      'UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?',
      [id, userId]
    );
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.db.query('notifications',
      'UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0',
      [userId]
    );
  }

  async getUnreadCount(userId: string): Promise<number> {
    const result = await this.db.query('notifications',
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0',
      [userId]
    );
    return result.rows[0]?.count || 0;
  }

  async checkAlertRules(userId: string, metrics: {
    cost?: number;
    failureRate?: number;
    tokenUsage?: number;
    executionCount?: number;
  }): Promise<AlertRule[]> {
    // 静默窗口：处于免打扰期内直接跳过，不触发任何通知（含真实渠道分发）
    if (await this.isSilenced(userId)) {
      this.logger?.info?.('Alert evaluation skipped: user in silence window', { userId });
      return [];
    }

    const rules = await this.listAlertRules(userId);
    const triggered: AlertRule[] = [];

    for (const rule of rules) {
      if (!rule.enabled) continue;

      let ruleTriggered = false;
      const now = new Date();

      if (rule.rule_type === 'cost_threshold' && metrics.cost !== undefined) {
        if (metrics.cost >= rule.threshold) ruleTriggered = true;
      } else if (rule.rule_type === 'failure_rate' && metrics.failureRate !== undefined) {
        if (metrics.failureRate >= rule.threshold) ruleTriggered = true;
      } else if (rule.rule_type === 'token_usage' && metrics.tokenUsage !== undefined) {
        if (metrics.tokenUsage >= rule.threshold) ruleTriggered = true;
      } else if (rule.rule_type === 'execution_count' && metrics.executionCount !== undefined) {
        if (metrics.executionCount >= rule.threshold) ruleTriggered = true;
      }

      if (ruleTriggered) {
        const channelIds: string[] = JSON.parse(rule.channels);
        const notification = await this.createNotification({
          userId,
          alertRuleId: rule.id,
          type: 'alert',
          title: `Alert: ${rule.name}`,
          content: `Rule "${rule.name}" triggered. Threshold: ${rule.threshold}, Window: ${rule.window_minutes}min`,
          severity: 'warning',
          metadata: { channelIds },
        });

        // 真实分发：向规则配置的渠道实际发送（webhook/feishu/dingtalk）
        const dispatchResults: Record<string, DispatchResult> = {};
        for (const channelId of channelIds) {
          try {
            const channel = await this.getChannel(channelId, userId);
            if (!channel) {
              dispatchResults[channelId] = { ok: false, error: 'channel not found' };
              continue;
            }
            dispatchResults[channelId] = await this.dispatch(channel, notification);
          } catch (err) {
            dispatchResults[channelId] = { ok: false, error: err instanceof Error ? err.message : String(err) };
          }
        }
        this.logger?.info?.('Alert dispatched', { ruleId: rule.id, dispatchResults });

        await this.db.query('alert_rules',
          'UPDATE alert_rules SET last_triggered_at = ? WHERE id = ?',
          [new Date().toISOString(), rule.id]
        );

        triggered.push(rule);
      }
    }

    return triggered;
  }

  // -------------------------------------------------------------------------
  // 静默窗口（免打扰）
  // -------------------------------------------------------------------------

  /** 设置静默窗口：until 之前的告警不触发任何渠道分发。reason 仅用于审计展示。 */
  async setSilenceUntil(userId: string, untilISO: string, reason?: string): Promise<SilenceEntry> {
    // 先清掉该用户已有的静默记录，避免叠加
    await this.db.query('notification_silence', 'DELETE FROM notification_silence WHERE user_id = ?', [userId]);
    const id = generateId('sil');
    const now = new Date().toISOString();
    const entry: SilenceEntry = { id, user_id: userId, until: untilISO, reason, created_at: now };
    await this.db.query('notification_silence',
      'INSERT INTO notification_silence (id, user_id, until, reason, created_at) VALUES (?, ?, ?, ?, ?)',
      [entry.id, entry.user_id, entry.until, entry.reason ?? null, entry.created_at]
    );
    return entry;
  }

  /** 清除静默窗口。 */
  async clearSilence(userId: string): Promise<void> {
    await this.db.query('notification_silence', 'DELETE FROM notification_silence WHERE user_id = ?', [userId]);
  }

  /** 返回当前静默条目（已过期则顺带清除并返回 null）。 */
  async getSilence(userId: string): Promise<SilenceEntry | null> {
    const res = await this.db.query('notification_silence',
      'SELECT * FROM notification_silence WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', [userId]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const row = (res.rows as any[])[0];
    if (!row) return null;
    const entry: SilenceEntry = {
      id: row.id,
      user_id: row.user_id,
      until: row.until,
      reason: row.reason ?? undefined,
      created_at: row.created_at,
    };
    if (new Date(entry.until).getTime() <= Date.now()) {
      await this.clearSilence(userId);
      return null;
    }
    return entry;
  }

  /** 是否处于静默期内。 */
  async isSilenced(userId: string): Promise<boolean> {
    const entry = await this.getSilence(userId);
    return !!entry;
  }

  // -------------------------------------------------------------------------
  // 实际渠道分发
  // -------------------------------------------------------------------------

  /** 获取单个渠道（带所有权校验）。 */
  async getChannel(channelId: string, userId: string): Promise<NotificationChannel | null> {
    const res = await this.db.query('notification_channels',
      'SELECT * FROM notification_channels WHERE id = ? AND user_id = ?', [channelId, userId]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const row = (res.rows as any[])[0];
    if (!row) return null;
    return { ...row, config: JSON.parse(row.config) } as NotificationChannel;
  }

  /**
   * 真实发送一条通知到渠道。
   * - webhook：原始 JSON POST（title/content/severity/type）
   * - feishu：飞书自定义机器人 text 消息
   * - dingtalk：钉钉自定义机器人 markdown 消息（支持可选的 secret 加签）
   * - email/slack：暂未接入 SMTP/Slack API，仅记录（返回 ok:false 并说明原因）
   */
  async dispatch(channel: NotificationChannel, notification: Notification): Promise<DispatchResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const config = (typeof channel.config === 'string' ? JSON.parse(channel.config) : channel.config) as any;
    const url: string | undefined = config?.url;
    if (!url) return { ok: false, error: 'channel has no url' };

    let payload: unknown;
    if (channel.type === 'feishu') {
      payload = { msg_type: 'text', content: { text: `${notification.title}\n${notification.content}` } };
    } else if (channel.type === 'dingtalk') {
      const sign = this.dingtalkSign(config?.secret);
      payload = {
        msgtype: 'markdown',
        markdown: { title: notification.title, text: `## ${notification.title}\n\n${notification.content}` },
        ...(sign ? { timestamp: String(sign.timestamp), sign: sign.sign } : {}),
      };
    } else if (channel.type === 'email' || channel.type === 'slack') {
      return { ok: false, error: `${channel.type} delivery not configured (no SMTP/Slack transport)` };
    } else {
      payload = {
        title: notification.title,
        content: notification.content,
        severity: notification.severity,
        type: notification.type,
      };
    }

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        // AbortSignal.timeout 需要 Node 17.3+，本服务运行于 Node 22
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        return { ok: false, error: `HTTP ${resp.status}: ${text.slice(0, 200)}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** 钉钉自定义机器人加签：HmacSHA256(base64)。无 secret 时返回 null（无需签名）。 */
  private dingtalkSign(secret?: string): { timestamp: number; sign: string } | null {
    if (!secret) return null;
    const timestamp = Date.now();
    const stringToSign = `${timestamp}\n${secret}`;
    const sign = createHmac('sha256', secret).update(stringToSign).digest('base64');
    return { timestamp, sign };
  }
}
