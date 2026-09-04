import { randomBytes } from 'crypto';

export interface AgentVersion {
  id: string;
  agent_id: string;
  version: number;
  name: string;
  description?: string;
  systemPrompt: string;
  model: string;
  provider?: string;
  temperature: number;
  maxTokens: number;
  tools?: string;
  knowledgeBaseIds?: string;
  icon?: string;
  created_by?: string;
  created_at: string;
}

export class AgentVersionService {
  private db: any;
  private logger: any;

  constructor(db: any, logger?: any) {
    this.db = db;
    this.logger = logger || {
      info: (msg: string, data?: any) => console.log('[AgentVersion]', msg, data || ''),
      warn: (msg: string, data?: any) => console.warn('[AgentVersion]', msg, data || ''),
      error: (msg: string, data?: any) => console.error('[AgentVersion]', msg, data || ''),
    };
  }

  async createVersion(agentId: string, config: {
    name: string;
    description?: string;
    systemPrompt: string;
    model: string;
    provider?: string;
    temperature?: number;
    maxTokens?: number;
    tools?: string;
    knowledgeBaseIds?: string;
    icon?: string;
    createdBy?: string;
  }): Promise<AgentVersion> {
    const id = generateId('aver');
    const now = new Date().toISOString();

    // Get next version number
    const existing = await this.listVersions(agentId);
    const nextVersion = existing.length > 0 ? Math.max(...existing.map(v => v.version)) + 1 : 1;

    const version: AgentVersion = {
      id,
      agent_id: agentId,
      version: nextVersion,
      name: config.name,
      description: config.description,
      systemPrompt: config.systemPrompt,
      model: config.model,
      provider: config.provider,
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 2000,
      tools: config.tools,
      knowledgeBaseIds: config.knowledgeBaseIds,
      icon: config.icon,
      created_by: config.createdBy,
      created_at: now,
    };

    await this.db.query('agent_versions',
      `INSERT INTO agent_versions (id, agent_id, version, name, description, systemPrompt, model, provider, temperature, maxTokens, tools, knowledgeBaseIds, icon, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [version.id, version.agent_id, version.version, version.name, version.description,
       version.systemPrompt, version.model, version.provider, version.temperature,
       version.maxTokens, version.tools, version.knowledgeBaseIds, version.icon,
       version.created_by, version.created_at]
    );

    // Update agent's current version
    await this.db.query('agents',
      'UPDATE agents SET current_version = ?, updatedAt = ? WHERE id = ?',
      [nextVersion, now, agentId]
    );

    this.logger.info('Created agent version', { agentId, version: nextVersion });
    return version;
  }

  async listVersions(agentId: string): Promise<AgentVersion[]> {
    const result = await this.db.query('agent_versions',
      'SELECT * FROM agent_versions WHERE agent_id = ? ORDER BY version DESC',
      [agentId]
    );
    return result.rows;
  }

  async getVersion(agentId: string, version: number): Promise<AgentVersion | null> {
    const result = await this.db.query('agent_versions',
      'SELECT * FROM agent_versions WHERE agent_id = ? AND version = ?',
      [agentId, version]
    );
    return result.rows[0] || null;
  }

  async rollbackToVersion(agentId: string, version: number): Promise<AgentVersion | null> {
    const targetVersion = await this.getVersion(agentId, version);
    if (!targetVersion) {
      throw new Error(`Version ${version} not found for agent ${agentId}`);
    }

    // Create new version with old config (preserves history)
    const newVersion = await this.createVersion(agentId, {
      name: targetVersion.name,
      description: targetVersion.description,
      systemPrompt: targetVersion.systemPrompt,
      model: targetVersion.model,
      provider: targetVersion.provider,
      temperature: targetVersion.temperature,
      maxTokens: targetVersion.maxTokens,
      tools: targetVersion.tools,
      knowledgeBaseIds: targetVersion.knowledgeBaseIds,
      icon: targetVersion.icon,
      createdBy: targetVersion.created_by,
    });

    this.logger.info('Rolled back agent', { agentId, fromVersion: version, toVersion: newVersion.version });
    return newVersion;
  }

  async compareVersions(agentId: string, v1: number, v2: number): Promise<{
    version1: AgentVersion | null;
    version2: AgentVersion | null;
    differences: Array<{
      field: string;
      oldValue: any;
      newValue: any;
    }>;
  }> {
    const version1 = await this.getVersion(agentId, v1);
    const version2 = await this.getVersion(agentId, v2);

    if (!version1 || !version2) {
      throw new Error('One or both versions not found');
    }

    const differences: Array<{ field: string; oldValue: any; newValue: any }> = [];
    const fields = ['name', 'description', 'systemPrompt', 'model', 'provider', 'temperature', 'maxTokens', 'tools', 'knowledgeBaseIds', 'icon'];

    for (const field of fields) {
      const val1 = (version1 as any)[field];
      const val2 = (version2 as any)[field];
      if (val1 !== val2) {
        differences.push({ field, oldValue: val1, newValue: val2 });
      }
    }

    return { version1, version2, differences };
  }
}

function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
}
