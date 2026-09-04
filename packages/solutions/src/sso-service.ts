import type {
  SsoConfig,
  CreateSsoConfigInput,
  UpdateSsoConfigInput,
  SsoLoginInput,
} from './types.js';

/**
 * 支持的 SSO Provider 列表
 */
export const SUPPORTED_SSO_PROVIDERS = ['wecom', 'dingtalk', 'azure_ad', 'saml', 'oidc'];

/**
 * SSO 服务 — 处理 SAML/OIDC 集成、多 Provider 支持
 */
export class SsoService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  constructor(private readonly db: any) {}

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return 'sso-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  /**
   * 解析 JSON 字段
   */
  private parseSsoConfigRow(row: Record<string, unknown>): SsoConfig {
    return {
      id: row.id as string,
      tenant_id: row.tenant_id as string,
      provider: row.provider as string,
      config: typeof row.config === 'string' ? JSON.parse(row.config as string) : (row.config as Record<string, unknown>) || {},
      enabled: row.enabled === 1 || row.enabled === true,
      created_at: row.created_at as string,
    };
  }

  /**
   * 获取支持的 Provider 列表
   */
  getSupportedProviders(): string[] {
    return SUPPORTED_SSO_PROVIDERS;
  }

  /**
   * 获取 SSO 配置列表
   */
  async listConfigs(tenantId: string): Promise<SsoConfig[]> {
    const result = await this.db.query('sso_configs', 'SELECT * FROM sso_configs WHERE tenant_id = ?', [tenantId]);
    return result.rows.map((r: Record<string, unknown>) => this.parseSsoConfigRow(r));
  }

  /**
   * 获取单个 SSO 配置
   */
  async getConfig(id: string, tenantId: string): Promise<SsoConfig | null> {
    const result = await this.db.query('sso_configs', 'SELECT * FROM sso_configs WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    if (result.rows.length === 0) return null;
    return this.parseSsoConfigRow(result.rows[0]);
  }

  /**
   * 创建 SSO 配置
   */
  async createConfig(tenantId: string, input: CreateSsoConfigInput): Promise<SsoConfig> {
    if (!SUPPORTED_SSO_PROVIDERS.includes(input.provider)) {
      throw new Error(`Unsupported provider. Supported: ${SUPPORTED_SSO_PROVIDERS.join(', ')}`);
    }

    const id = this.generateId();
    const now = new Date().toISOString();

    await this.db.query(
      'sso_configs',
      'INSERT INTO sso_configs (id, tenant_id, provider, config, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, tenantId, input.provider, JSON.stringify(input.config), input.enabled !== false ? 1 : 0, now]
    );

    return this.getConfig(id, tenantId) as Promise<SsoConfig>;
  }

  /**
   * 更新 SSO 配置
   */
  async updateConfig(id: string, tenantId: string, input: UpdateSsoConfigInput): Promise<SsoConfig | null> {
    const existing = await this.getConfig(id, tenantId);
    if (!existing) return null;

    const updates: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const values: any[] = [];

    if (input.config !== undefined) { updates.push('config = ?'); values.push(JSON.stringify(input.config)); }
    if (input.enabled !== undefined) { updates.push('enabled = ?'); values.push(input.enabled ? 1 : 0); }

    if (updates.length === 0) return existing;

    values.push(id);
    values.push(tenantId);

    await this.db.query('sso_configs', `UPDATE sso_configs SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`, values);
    return this.getConfig(id, tenantId);
  }

  /**
   * 删除 SSO 配置
   */
  async deleteConfig(id: string, tenantId: string): Promise<boolean> {
    const existing = await this.getConfig(id, tenantId);
    if (!existing) return false;

    await this.db.query('sso_configs', 'DELETE FROM sso_configs WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    return true;
  }

  /**
   * 生成 SSO 登录 URL
   */
  async getLoginUrl(tenantId: string, input: SsoLoginInput, baseUrl: string): Promise<{ loginUrl: string; provider: string }> {
    const configs = await this.listConfigs(tenantId);
    const config = configs.find(c => c.provider === input.provider && c.enabled);

    if (!config) {
      throw new Error('SSO provider not configured or disabled');
    }

    const configData = config.config;
    const redirectUri = input.redirectUrl || `${baseUrl}/api/v1/sso/callback?provider=${input.provider}`;

    let loginUrl: string;

    switch (input.provider) {
      case 'wecom':
        loginUrl = `https://open.work.weixin.qq.com/wwopen/sso/3rd_qrConnect?appid=${configData.appId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
        break;
      case 'dingtalk':
        loginUrl = `https://login.dingtalk.com/oauth2/auth?client_id=${configData.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;
        break;
      case 'azure_ad':
        loginUrl = `https://login.microsoftonline.com/${configData.tenantId}/oauth2/v2.0/authorize?client_id=${configData.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;
        break;
      case 'saml':
        loginUrl = `/api/v1/sso/saml/login?tenant_id=${tenantId}&redirect_uri=${encodeURIComponent(input.redirectUrl || '/')}`;
        break;
      case 'oidc':
        loginUrl = `${configData.authorizationEndpoint}?client_id=${configData.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid profile email`;
        break;
      default:
        throw new Error('Unsupported provider');
    }

    return { loginUrl, provider: input.provider };
  }
}
