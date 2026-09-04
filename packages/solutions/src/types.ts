/**
 * 行业方案类型定义
 */

export interface IndustrySolution {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  category: string;
  industry: string;
  config: Record<string, unknown>;
  status: 'draft' | 'active' | 'deployed' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface SolutionComponent {
  id: string;
  solution_id: string;
  component_type: 'template' | 'knowledge_base' | 'workflow' | 'agent';
  component_id: string;
  config: Record<string, unknown>;
  created_at: string;
}

export interface CloudSubscription {
  id: string;
  tenant_id: string;
  plan: string;
  status: 'active' | 'cancelled' | 'expired';
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
}

export interface SsoConfig {
  id: string;
  tenant_id: string;
  provider: string;
  config: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
}

export interface SlaPolicy {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  target_uptime: number;
  response_time: number;
  created_at: string;
}

export interface CreateSolutionInput {
  name: string;
  description?: string;
  category?: string;
  industry: string;
  config?: Record<string, unknown>;
}

export interface UpdateSolutionInput {
  name?: string;
  description?: string;
  category?: string;
  industry?: string;
  config?: Record<string, unknown>;
  status?: string;
}

export interface CreateSubscriptionInput {
  plan: string;
}

export interface UpdateSubscriptionInput {
  plan?: string;
}

export interface CreateSsoConfigInput {
  provider: string;
  config: Record<string, unknown>;
  enabled?: boolean;
}

export interface UpdateSsoConfigInput {
  config?: Record<string, unknown>;
  enabled?: boolean;
}

export interface DeploySolutionInput {
  targetTenantId?: string;
}

export interface SsoLoginInput {
  provider: string;
  redirectUrl?: string;
}

export interface CloudPlan {
  id: string;
  name: string;
  price: number;
  features: {
    agents: number;
    tokens: number;
    storage: number;
    users: number;
  };
  description: string;
}
