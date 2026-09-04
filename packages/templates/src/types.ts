/**
 * 模板市场类型定义
 */

export interface Template {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  category: string;
  tags: string[];
  content: Record<string, unknown>;
  version: string;
  is_public: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateVersion {
  id: string;
  template_id: string;
  version: string;
  content: Record<string, unknown>;
  changelog: string | null;
  created_by: string | null;
  created_at: string;
}

export interface TemplateRating {
  id: string;
  template_id: string;
  user_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface TemplateInstall {
  id: string;
  template_id: string;
  tenant_id: string;
  installed_by: string | null;
  installed_at: string;
}

export interface ShareLink {
  id: string;
  resource_type: string;
  resource_id: string;
  token: string;
  permissions: string[];
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CreateTemplateInput {
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  content?: Record<string, unknown>;
  is_public?: boolean;
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  content?: Record<string, unknown>;
  is_public?: boolean;
}

export interface PublishVersionInput {
  version?: string;
  changelog?: string;
  content?: Record<string, unknown>;
}

export interface RateTemplateInput {
  rating: number;
  comment?: string;
}

export interface CreateShareLinkInput {
  resource_type: string;
  resource_id: string;
  permissions?: string[];
  expires_at?: string;
}

export interface TemplateListOptions {
  tenant_id?: string;
  category?: string;
  search?: string;
  is_public?: boolean;
  sort?: 'newest' | 'rating' | 'installs';
  limit?: number;
  offset?: number;
}
