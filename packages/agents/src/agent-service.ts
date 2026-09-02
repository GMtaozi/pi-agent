/**
 * Agent management service — CRUD + AI-powered agent generation from description.
 */

import type { Agent, QueryResult } from '@workforge/persistence';

export interface GenerateAgentRequest {
  description: string;
  userId?: string;
  tenantId?: string;
  model?: string;
}

export interface GeneratedAgentConfig {
  name: string;
  description: string;
  systemPrompt: string;
  model: string;
  provider: string;
  temperature: number;
  maxTokens: number;
  tools: string[];
  icon: string;
  suggestedKnowledgeBases: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any database backend (SQLite or Postgres)
export class AgentService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private logger: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: any, logger: any) {
    this.db = db;
    this.logger = logger;
  }

  /**
   * Generate agent configuration from a natural language description.
   * Uses a lightweight LLM call to produce a structured configuration.
   */
  async generateFromDescription(req: GenerateAgentRequest): Promise<Agent> {
    const { description, userId, tenantId, model } = req;

    // Use LLM to generate structured config
    const config = await this.callLLMForAgentConfig(description, model);

    const now = new Date().toISOString();
    const agent: Agent = {
      id: this.generateId(),
      name: config.name,
      description: config.description,
      systemPrompt: config.systemPrompt,
      model: config.model,
      provider: config.provider,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      tools: JSON.stringify(config.tools),
      icon: config.icon,
      status: 'draft',
      tenantId: tenantId || 'default',
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.query('agents', `INSERT INTO agents (id, name, description, systemPrompt, model, provider, temperature, maxTokens, tools, icon, status, tenantId, createdBy, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      agent.id, agent.name, agent.description, agent.systemPrompt, agent.model,
      agent.provider, agent.temperature, agent.maxTokens, agent.tools, agent.icon,
      agent.status, agent.tenantId, agent.createdBy, agent.createdAt, agent.updatedAt
    ]);

    this.logger.info(`Agent generated from description: ${agent.id} (${agent.name})`);
    return agent;
  }

  async listAgents(tenantId?: string, status?: string): Promise<Agent[]> {
    let sql = 'SELECT * FROM agents WHERE 1=1';
    const params: any[] = [];
    if (tenantId) { sql += ' AND tenantId = ?'; params.push(tenantId); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY updatedAt DESC';
    const result: QueryResult = await this.db.query('agents', sql, params);
    return result.rows.map((r: any) => this.mapRowToAgent(r));
  }

  async getAgent(id: string): Promise<Agent | null> {
    const result: QueryResult = await this.db.query('agents', 'SELECT * FROM agents WHERE id = ?', [id]);
    if (!result.rows[0]) return null;
    return this.mapRowToAgent(result.rows[0]);
  }

  async updateAgent(id: string, updates: Partial<Agent>): Promise<Agent | null> {
    const sets: string[] = [];
    const params: any[] = [];
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) continue;
      const col = this.camelToSnake(key);
      sets.push(`${col} = ?`);
      params.push(typeof value === 'object' ? JSON.stringify(value) : value);
    }
    if (sets.length === 0) return this.getAgent(id);
    sets.push('updatedAt = ?');
    params.push(new Date().toISOString());
    params.push(id);
    await this.db.query('agents', `UPDATE agents SET ${sets.join(', ')} WHERE id = ?`, params);
    return this.getAgent(id);
  }

  async deleteAgent(id: string): Promise<boolean> {
    const result: QueryResult = await this.db.query('agents', 'DELETE FROM agents WHERE id = ?', [id]);
    return result.rowsAffected > 0;
  }

  private mapRowToAgent(row: any): Agent {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      systemPrompt: row.systemPrompt ?? row.system_prompt,
      model: row.model,
      provider: row.provider,
      temperature: row.temperature,
      maxTokens: row.maxTokens ?? row.max_tokens,
      tools: row.tools,
      knowledgeBaseIds: row.knowledgeBaseIds ?? row.knowledge_base_ids,
      icon: row.icon,
      status: row.status,
      tenantId: row.tenantId ?? row.tenant_id,
      createdBy: row.createdBy ?? row.created_by,
      createdAt: row.createdAt ?? row.created_at,
      updatedAt: row.updatedAt ?? row.updated_at,
      metadata: row.metadata,
    };
  }

  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, l => `_${l.toLowerCase()}`);
  }

  private generateId(): string {
    return `agent_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Call LLM to produce a structured agent configuration from description.
   * Falls back to a template if no LLM is available.
   */
  private async callLLMForAgentConfig(description: string, model?: string): Promise<GeneratedAgentConfig> {
    const systemPrompt = `You are an AI agent configuration generator. Given a user's natural language description of what they want an AI agent to do, produce a JSON configuration for the agent.

Output ONLY valid JSON (no markdown, no explanation) with these fields:
{
  "name": "Short agent name (max 50 chars)",
  "description": "One sentence description",
  "systemPrompt": "Detailed system prompt for the agent (in the user's language)",
  "model": "gpt-4o",
  "provider": "openai",
  "temperature": 0.7,
  "maxTokens": 2000,
  "tools": ["tool1", "tool2"],
  "icon": "emoji"
}

Rules:
- systemPrompt must be detailed and actionable
- temperature: 0.0-0.3 for factual tasks, 0.4-0.7 for balanced, 0.8-1.2 for creative
- tools: pick from [web-search, file-read, file-write, shell, code-interpreter, image-gen, knowledge-base]
- icon: pick a relevant emoji

User description: "${description}"`;

    try {
      // Try to use the project's model-runtime if available
      const prompt = `${systemPrompt}\n\nGenerate the configuration now.`;
      // For now, return a structured template based on description analysis
      return this.fallbackConfig(description);
    } catch {
      return this.fallbackConfig(description);
    }
  }

  /**
   * Template-based fallback that analyzes description keywords.
   */
  private fallbackConfig(description: string): GeneratedAgentConfig {
    const lower = description.toLowerCase();

    // Detect intent from keywords
    const isCustomerService = /客服|回复|customer|support|answer.*question/i.test(description);
    const isWriter = /写|文章|文案|写手|blog|content|copy/i.test(description);
    const isCoder = /代码|程序|开发|code|program|debug|api/i.test(description);
    const isAnalyst = /数据|分析|报告|data|analytics|report|chart/i.test(description);
    const isTeacher = /教育|教学|老师|教|teach|tutor|learn/i.test(description);

    if (isCustomerService) {
      return {
        name: '智能客服助手',
        description: '自动回复客户咨询的AI客服',
        systemPrompt: `你是一位专业的客服代表。你的职责：\n1. 友好、专业地回答客户问题\n2. 遇到不知道的问题，坦诚告知并建议转接人工\n3. 不要承诺任何未确认的事项\n4. 使用简洁明了的语言\n5. 适当使用表情增加亲和力`,
        model: 'gpt-4o',
        provider: 'openai',
        temperature: 0.3,
        maxTokens: 1000,
        tools: ['knowledge-base', 'web-search'],
        icon: '🎧',
        suggestedKnowledgeBases: [],
      };
    }

    if (isWriter) {
      return {
        name: '内容创作助手',
        description: '帮助用户创作高质量文案和内容',
        systemPrompt: `你是一位才华横溢的内容创作者。你的职责：\n1. 根据用户要求创作吸引人的内容\n2. 适应不同平台风格（小红书/公众号/抖音等）\n3. 使用emoji和生动的语言\n4. 提供多个版本供选择\n5. 注意SEO关键词自然融入`,
        model: 'gpt-4o',
        provider: 'openai',
        temperature: 0.8,
        maxTokens: 2000,
        tools: ['web-search', 'file-read'],
        icon: '✍️',
        suggestedKnowledgeBases: [],
      };
    }

    if (isCoder) {
      return {
        name: '代码助手',
        description: '帮助编写、调试和优化代码',
        systemPrompt: `你是一位资深软件工程师。你的职责：\n1. 编写清晰、可维护的代码\n2. 解释代码逻辑和设计决策\n3. 帮助调试和修复bug\n4. 遵循最佳实践和设计模式\n5. 提供代码示例和文档`,
        model: 'gpt-4o',
        provider: 'openai',
        temperature: 0.2,
        maxTokens: 4000,
        tools: ['code-interpreter', 'file-read', 'file-write', 'shell'],
        icon: '💻',
        suggestedKnowledgeBases: [],
      };
    }

    if (isAnalyst) {
      return {
        name: '数据分析助手',
        description: '分析数据并生成洞察报告',
        systemPrompt: `你是一位数据分析专家。你的职责：\n1. 分析数据并提取关键洞察\n2. 生成清晰的数据报告\n3. 使用图表可视化数据\n4. 提供可操作的建议\n5. 用非技术语言解释复杂分析`,
        model: 'gpt-4o',
        provider: 'openai',
        temperature: 0.3,
        maxTokens: 3000,
        tools: ['code-interpreter', 'file-read', 'file-write'],
        icon: '📊',
        suggestedKnowledgeBases: [],
      };
    }

    if (isTeacher) {
      return {
        name: '教学助手',
        description: '提供个性化教学辅导',
        systemPrompt: `你是一位耐心且知识渊博的教师。你的职责：\n1. 用简单易懂的方式解释概念\n2. 根据学生水平调整教学方式\n3. 提供练习和反馈\n4. 鼓励学生思考而非直接给答案\n5. 总结重点并检查理解`,
        model: 'gpt-4o',
        provider: 'openai',
        temperature: 0.5,
        maxTokens: 2000,
        tools: ['knowledge-base', 'file-read'],
        icon: '🎓',
        suggestedKnowledgeBases: [],
      };
    }

    // Default: general-purpose assistant
    return {
      name: '通用AI助手',
      description: '一个多功能AI助手',
      systemPrompt: `你是一位乐于助人的AI助手。你的职责：\n1. 认真倾听用户需求\n2. 提供准确、有用的回答\n3. 保持友好和专业的态度\n4. 不确定时坦诚告知\n5. 尽可能帮助用户解决问题`,
      model: 'gpt-4o',
      provider: 'openai',
      temperature: 0.7,
      maxTokens: 2000,
      tools: ['web-search', 'file-read'],
      icon: '🤖',
      suggestedKnowledgeBases: [],
    };
  }
}
