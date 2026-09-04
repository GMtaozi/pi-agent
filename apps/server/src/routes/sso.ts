import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import type { ServerDeps } from './deps.js';

// ---------------------------------------------------------------------------
// TypeBox schemas
// ---------------------------------------------------------------------------
const CreateSsoConfigSchema = Type.Object({
  provider: Type.String({ minLength: 1 }),
  config: Type.Object({}),
  enabled: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });

const UpdateSsoConfigSchema = Type.Object({
  config: Type.Optional(Type.Object({})),
  enabled: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });

const SsoLoginSchema = Type.Object({
  provider: Type.String({ minLength: 1 }),
  redirectUrl: Type.Optional(Type.String()),
}, { additionalProperties: false });

// ---------------------------------------------------------------------------
// 支持的 SSO Provider
// ---------------------------------------------------------------------------
const SUPPORTED_PROVIDERS = ['wecom', 'dingtalk', 'azure_ad', 'saml', 'oidc'];

// ---------------------------------------------------------------------------
// 路由注册
// ---------------------------------------------------------------------------
export function registerSsoRoutes(server: FastifyInstance, deps: ServerDeps): void {
  if (!deps.database) return;

  // SSO 配置
  server.get('/api/v1/sso/config', async (req, res) => {
    try {
      const tenantId = req.tenantId || 'default';
      const result = await deps.database!.query(
        'sso_configs',
        'SELECT * FROM sso_configs WHERE tenant_id = ?',
        [tenantId]
      );

      return result.rows;
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to get SSO config' });
    }
  });

  // 创建 SSO 配置
  server.post('/api/v1/sso/config', { schema: { body: CreateSsoConfigSchema } }, async (req, res) => {
    try {
      const tenantId = req.tenantId || 'default';
      const userId = req.userId || 'anonymous';
      const body = req.body as { provider: string; config: Record<string, unknown>; enabled?: boolean };

      if (!SUPPORTED_PROVIDERS.includes(body.provider)) {
        return res.status(400).send({ error: `Unsupported provider. Supported: ${SUPPORTED_PROVIDERS.join(', ')}` });
      }

      const id = `sso-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const now = new Date().toISOString();

      await deps.database!.query(
        'sso_configs',
        `INSERT INTO sso_configs (id, tenant_id, provider, config, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, tenantId, body.provider, JSON.stringify(body.config), body.enabled !== false ? 1 : 0, now]
      );

      // 审计日志
      if (deps.auditService) {
        await deps.auditService.log({
          tenant_id: tenantId,
          actor_id: userId,
          action: 'sso_config.create',
          category: 'sso',
          resource_type: 'sso_config',
          resource_id: id,
          result: 'success',
          request_id: req.requestId,
          details: { provider: body.provider },
        });
      }

      return { ok: true, id, provider: body.provider, enabled: body.enabled !== false };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to create SSO config' });
    }
  });

  // 更新 SSO 配置
  server.put('/api/v1/sso/config/:id', { schema: { body: UpdateSsoConfigSchema } }, async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const tenantId = req.tenantId || 'default';
      const userId = req.userId || 'anonymous';
      const body = req.body as { config?: Record<string, unknown>; enabled?: boolean };

      // 检查是否存在
      const existing = await deps.database!.query(
        'sso_configs',
        'SELECT * FROM sso_configs WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).send({ error: 'SSO config not found' });
      }

      const updates: string[] = [];
      const values: unknown[] = [];

      if (body.config !== undefined) { updates.push('config = ?'); values.push(JSON.stringify(body.config)); }
      if (body.enabled !== undefined) { updates.push('enabled = ?'); values.push(body.enabled ? 1 : 0); }

      if (updates.length === 0) {
        return res.status(400).send({ error: 'No fields to update' });
      }

      values.push(id);
      values.push(tenantId);

      await deps.database!.query(
        'sso_configs',
        `UPDATE sso_configs SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`,
        values
      );

      // 审计日志
      if (deps.auditService) {
        await deps.auditService.log({
          tenant_id: tenantId,
          actor_id: userId,
          action: 'sso_config.update',
          category: 'sso',
          resource_type: 'sso_config',
          resource_id: id,
          result: 'success',
          request_id: req.requestId,
          details: { updated_fields: Object.keys(body) },
        });
      }

      return { ok: true, id };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to update SSO config' });
    }
  });

  // SSO 登录入口
  server.post('/api/v1/sso/login', { schema: { body: SsoLoginSchema } }, async (req, res) => {
    try {
      const tenantId = req.tenantId || 'default';
      const { provider, redirectUrl } = req.body as { provider: string; redirectUrl?: string };

      // 获取 SSO 配置
      const configResult = await deps.database!.query(
        'sso_configs',
        'SELECT * FROM sso_configs WHERE tenant_id = ? AND provider = ? AND enabled = 1',
        [tenantId, provider]
      );

      if (configResult.rows.length === 0) {
        return res.status(404).send({ error: 'SSO provider not configured or disabled' });
      }

      const ssoConfig = configResult.rows[0];

      // 根据 provider 生成登录 URL
      let loginUrl = '';
      const config = JSON.parse(ssoConfig.config);

      switch (provider) {
        case 'wecom':
          loginUrl = `https://open.work.weixin.qq.com/wwopen/sso/3rd_qrConnect?appid=${config.appId}&redirect_uri=${encodeURIComponent(redirectUrl || `${req.protocol}://${req.host}/api/v1/sso/callback?provider=wecom`)}`;
          break;
        case 'dingtalk':
          loginUrl = `https://login.dingtalk.com/oauth2/auth?client_id=${config.clientId}&redirect_uri=${encodeURIComponent(redirectUrl || `${req.protocol}://${req.host}/api/v1/sso/callback?provider=dingtalk`)}&response_type=code`;
          break;
        case 'azure_ad':
          loginUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize?client_id=${config.clientId}&redirect_uri=${encodeURIComponent(redirectUrl || `${req.protocol}://${req.host}/api/v1/sso/callback?provider=azure_ad`)}&response_type=code`;
          break;
        case 'saml':
          loginUrl = `/api/v1/sso/saml/login?tenant_id=${tenantId}&redirect_uri=${encodeURIComponent(redirectUrl || '/')}`;
          break;
        case 'oidc':
          loginUrl = `${config.authorizationEndpoint}?client_id=${config.clientId}&redirect_uri=${encodeURIComponent(redirectUrl || `${req.protocol}://${req.host}/api/v1/sso/callback?provider=oidc`)}&response_type=code&scope=openid profile email`;
          break;
        default:
          return res.status(400).send({ error: 'Unsupported provider' });
      }

      return { ok: true, loginUrl, provider };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to initiate SSO login' });
    }
  });

  // SSO 回调
  server.get('/api/v1/sso/callback', async (req, res) => {
    try {
      const query = req.query as { provider?: string; code?: string; state?: string };
      const { provider, code } = query;

      if (!provider || !code) {
        return res.status(400).send({ error: 'Missing provider or code' });
      }

      // 返回回调信息（实际实现需要处理 OAuth/OIDC 流程）
      return {
        ok: true,
        provider,
        code,
        message: 'SSO callback received. Token exchange should be implemented here.',
      };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'SSO callback failed' });
    }
  });

  // 获取支持的 Provider 列表
  server.get('/api/v1/sso/providers', async () => {
    return SUPPORTED_PROVIDERS;
  });
}
