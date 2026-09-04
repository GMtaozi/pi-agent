import type { ShareLink, CreateShareLinkInput } from './types.js';

/**
 * 分享链接服务 — 管理资源的分享链接
 */
export class ShareService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  constructor(private readonly db: any) {}

  /**
   * 生成随机 token
   */
  private generateToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }

  /**
   * 解析 JSON 字段
   */
  private parseRow(row: Record<string, unknown>): ShareLink {
    return {
      id: row.id as string,
      resource_type: row.resource_type as string,
      resource_id: row.resource_id as string,
      token: row.token as string,
      permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions as string) : (row.permissions as string[]) || ['read'],
      expires_at: row.expires_at as string | null,
      created_by: row.created_by as string | null,
      created_at: row.created_at as string
    };
  }

  /**
   * 创建分享链接
   */
  async create(createdBy: string | null, input: CreateShareLinkInput): Promise<ShareLink> {
    const id = 'sl-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    const token = this.generateToken();
    const permissions = JSON.stringify(input.permissions || ['read']);
    const now = new Date().toISOString();

    await this.db.query('share_links',
      'INSERT INTO share_links (id, resource_type, resource_id, token, permissions, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, input.resource_type, input.resource_id, token, permissions, input.expires_at || null, createdBy, now]
    );

    return {
      id,
      resource_type: input.resource_type,
      resource_id: input.resource_id,
      token,
      permissions: input.permissions || ['read'],
      expires_at: input.expires_at || null,
      created_by: createdBy,
      created_at: now
    };
  }

  /**
   * 通过 token 查找分享链接
   */
  async findByToken(token: string): Promise<ShareLink | null> {
    const result = await this.db.query('share_links', 'SELECT * FROM share_links WHERE token = ?', [token]);
    if (result.rows.length === 0) return null;
    return this.parseRow(result.rows[0]);
  }

  /**
   * 检查分享链接是否有效（未过期）
   */
  isValid(shareLink: ShareLink): boolean {
    if (!shareLink.expires_at) return true;
    return new Date(shareLink.expires_at).getTime() > Date.now();
  }

  /**
   * 获取资源的分享链接列表
   */
  async listByResource(resourceType: string, resourceId: string): Promise<ShareLink[]> {
    const result = await this.db.query('share_links', 'SELECT * FROM share_links WHERE resource_type = ? AND resource_id = ? ORDER BY created_at DESC', [resourceType, resourceId]);
    return result.rows.map((r: Record<string, unknown>) => this.parseRow(r));
  }

  /**
   * 删除分享链接
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db.query('share_links', 'DELETE FROM share_links WHERE id = ?', [id]);
    return (result.changes || result.rowCount || 0) > 0;
  }

  /**
   * 清理过期链接
   */
  async cleanupExpired(): Promise<number> {
    const now = new Date().toISOString();
    const result = await this.db.query('share_links', 'DELETE FROM share_links WHERE expires_at IS NOT NULL AND expires_at < ?', [now]);
    return result.changes || result.rowCount || 0;
  }
}
