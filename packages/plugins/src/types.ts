/**
 * 插件市场 & MCP 生态类型定义
 */

// ============================================================================
// 插件类型
// ============================================================================

export type PluginType = 'tool' | 'workflow' | 'agent';
export type PluginKind = 'builtin' | 'community' | 'official';
export type PluginVisibility = 'public' | 'private' | 'unlisted';
export type PluginStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'suspended';

export interface Plugin {
  id: string;
  tenant_id: string;
  publisher_id: string | null;
  type: PluginType;
  kind: PluginKind;
  title: string;
  summary: string | null;
  description: string | null;
  category: string;
  subcategory: string | null;
  cover_image: string | null;
  version: string;
  current_version: string;
  manifest: Record<string, unknown>;
  visibility: PluginVisibility;
  status: PluginStatus;
  verified: boolean;
  min_plan: string;
  download_count: number;
  install_count: number;
  avg_rating: number;
  rating_count: number;
  created_at: string;
  updated_at: string;
}

export interface PluginVersion {
  id: string;
  plugin_id: string;
  version: string;
  manifest: Record<string, unknown>;
  artifact_ref: string | null;
  checksum: string | null;
  signature: string | null;
  yanked: boolean;
  changelog: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PluginReview {
  id: string;
  plugin_id: string;
  tenant_id: string;
  user_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface PluginInstall {
  id: string;
  tenant_id: string;
  plugin_id: string;
  pinned_version: string | null;
  enabled: boolean;
  config: Record<string, unknown>;
  auto_update: boolean;
  installed_by: string | null;
  installed_at: string;
}

export interface PluginModeration {
  id: string;
  plugin_id: string;
  action: 'approve' | 'reject' | 'suspend' | 'unsuspend' | 'yank' | 'unyank';
  actor_id: string | null;
  reason: string | null;
  created_at: string;
}

export interface PluginUsage {
  id: string;
  plugin_id: string;
  success: boolean;
  duration_ms: number;
  executed_at: string;
}

// ============================================================================
// MCP 类型
// ============================================================================

export type McpTransport = 'stdio' | 'http' | 'sse';
export type McpConnectionStatus = 'connected' | 'disconnected' | 'error' | 'syncing';

export interface McpConnection {
  id: string;
  tenant_id: string;
  server_id: string;
  transport: McpTransport;
  endpoint: string | null;
  status: McpConnectionStatus;
  last_sync_at: string | null;
  created_at: string;
}

export interface McpToolCache {
  id: string;
  connection_id: string;
  tool_name: string;
  tool_schema: Record<string, unknown>;
  checksum: string | null;
  cached_at: string;
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

// ============================================================================
// 输入类型
// ============================================================================

export interface CreatePluginInput {
  title: string;
  type?: PluginType;
  kind?: PluginKind;
  summary?: string;
  description?: string;
  category?: string;
  subcategory?: string;
  cover_image?: string;
  visibility?: PluginVisibility;
  manifest?: Record<string, unknown>;
  min_plan?: string;
}

export interface UpdatePluginInput {
  title?: string;
  summary?: string;
  description?: string;
  category?: string;
  subcategory?: string;
  cover_image?: string;
  visibility?: PluginVisibility;
  manifest?: Record<string, unknown>;
  min_plan?: string;
}

export interface PublishVersionInput {
  version?: string;
  manifest?: Record<string, unknown>;
  artifact_ref?: string;
  checksum?: string;
  signature?: string;
  changelog?: string;
}

export interface InstallPluginInput {
  pinned_version?: string;
  config?: Record<string, unknown>;
  auto_update?: boolean;
}

export interface RatePluginInput {
  rating: number;
  comment?: string;
}

export interface ModeratePluginInput {
  action: 'approve' | 'reject' | 'suspend' | 'unsuspend' | 'yank' | 'unyank';
  reason?: string;
}

export interface CreateMcpConnectionInput {
  server_id: string;
  transport: McpTransport;
  endpoint?: string;
}

export interface ExecutePluginInput {
  tool_name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  params?: Record<string, any>;
}

export interface PluginListOptions {
  tenant_id?: string;
  category?: string;
  subcategory?: string;
  type?: PluginType;
  kind?: PluginKind;
  visibility?: PluginVisibility;
  status?: PluginStatus;
  verified?: boolean;
  search?: string;
  sort?: 'newest' | 'downloads' | 'installs' | 'rating';
  limit?: number;
  offset?: number;
}
