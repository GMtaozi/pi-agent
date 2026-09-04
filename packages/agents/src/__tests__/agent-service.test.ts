import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Database, migrations, type Agent } from '@workforge/persistence';
import { AgentService } from '../agent-service.js';

describe('AgentService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let service: AgentService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let logger: any;

  beforeEach(async () => {
    db = new Database({ inMemory: true });
    await db.initialize();
    await db.runMigrations(migrations);
    logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    // 不传 modelRuntime —— 走 fallback 模板分支，保证测试确定性
    service = new AgentService(db, logger);
  });

  describe('template recognition (fallback, no LLM)', () => {
    it('should recognise a customer-service agent', async () => {
      const agent = await service.generateFromDescription({ description: '我需要一个客服助手来回复客户咨询' });

      expect(agent.name).toBe('智能客服助手');
      expect(agent.icon).toBe('🎧');
      expect(agent.temperature).toBe(0.3);
      expect(agent.tools).toContain('knowledge-base');
    });

    it('should recognise a content-writing agent', async () => {
      const agent = await service.generateFromDescription({ description: '帮我创作小红书文案文章' });

      expect(agent.name).toBe('内容创作助手');
      expect(agent.icon).toBe('✍️');
      expect(agent.temperature).toBe(0.8);
    });

    it('should recognise a coding agent', async () => {
      const agent = await service.generateFromDescription({ description: '帮我调试代码和开发程序' });

      expect(agent.name).toBe('代码助手');
      expect(agent.icon).toBe('💻');
      expect(agent.temperature).toBe(0.2);
      expect(agent.tools).toContain('code-interpreter');
    });

    it('should recognise a data-analysis agent', async () => {
      const agent = await service.generateFromDescription({ description: '帮我分析数据并生成报告' });

      expect(agent.name).toBe('数据分析助手');
      expect(agent.icon).toBe('📊');
    });

    it('should recognise a teaching agent', async () => {
      const agent = await service.generateFromDescription({ description: '我想学习教育辅导课程' });

      expect(agent.name).toBe('教学助手');
      expect(agent.icon).toBe('🎓');
    });

    it('should fall back to a general assistant for unmatched descriptions', async () => {
      const agent = await service.generateFromDescription({ description: '帮我做一件很普通的事情' });

      expect(agent.name).toBe('通用AI助手');
      expect(agent.icon).toBe('🤖');
      expect(agent.temperature).toBe(0.7);
    });
  });

  describe('generateFromDescription persistence', () => {
    it('should persist the agent as a draft with defaults', async () => {
      const agent = await service.generateFromDescription({ description: '帮我调试代码' });

      expect(agent.id).toMatch(/^agent_/);
      expect(agent.status).toBe('draft');
      expect(agent.tenantId).toBe('default');
      expect(agent.createdAt).toBeDefined();

      const stored = await service.getAgent(agent.id);
      expect(stored?.name).toBe('代码助手');
    });

    it('should serialise the tools array to JSON', async () => {
      const agent = await service.generateFromDescription({ description: '帮我调试代码' });

      expect(typeof agent.tools).toBe('string');
      expect(JSON.parse(agent.tools!)).toContain('code-interpreter');
    });

    it('should honour tenantId and createdBy', async () => {
      const agent = await service.generateFromDescription({
        description: '帮我调试代码',
        tenantId: 'acme',
        userId: 'u-1',
      });

      expect(agent.tenantId).toBe('acme');
      expect(agent.createdBy).toBe('u-1');
    });

    it('should produce a detailed system prompt', async () => {
      const agent = await service.generateFromDescription({ description: '帮我调试代码' });

      expect(agent.systemPrompt.length).toBeGreaterThan(20);
      expect(agent.systemPrompt).toContain('1.');
    });
  });

  describe('CRUD', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let seeded: Agent;

    beforeEach(async () => {
      seeded = await service.generateFromDescription({
        description: '帮我调试代码',
        tenantId: 'acme',
      });
      await service.generateFromDescription({ description: '帮我分析数据', tenantId: 'other' });
    });

    it('should list all agents', async () => {
      expect(await service.listAgents()).toHaveLength(2);
    });

    it('should filter by tenantId', async () => {
      const agents = await service.listAgents('acme');
      expect(agents).toHaveLength(1);
      expect(agents[0].tenantId).toBe('acme');
    });

    it('should filter by status', async () => {
      expect(await service.listAgents(undefined, 'draft')).toHaveLength(2);
      expect(await service.listAgents(undefined, 'active')).toHaveLength(0);
    });

    it('should get an agent by id', async () => {
      expect((await service.getAgent(seeded.id))?.id).toBe(seeded.id);
    });

    it('should return null for an unknown id', async () => {
      expect(await service.getAgent('nope')).toBeNull();
    });

    it('should update scalar fields', async () => {
      const updated = await service.updateAgent(seeded.id, { name: '改名了', temperature: 0.1 });

      expect(updated?.name).toBe('改名了');
      expect(updated?.temperature).toBe(0.1);
    });

    it('should update camelCase columns such as systemPrompt', async () => {
      const updated = await service.updateAgent(seeded.id, { systemPrompt: '你是一个测试助手' });

      expect(updated?.systemPrompt).toBe('你是一个测试助手');
    });

    it('should update camelCase columns such as maxTokens', async () => {
      const updated = await service.updateAgent(seeded.id, { maxTokens: 4096 });

      expect(updated?.maxTokens).toBe(4096);
    });

    it('should bump updatedAt on update', async () => {
      const before = (await service.getAgent(seeded.id))!.updatedAt;
      await new Promise(r => setTimeout(r, 15));
      const updated = await service.updateAgent(seeded.id, { name: 'again' });

      expect(updated!.updatedAt > before).toBe(true);
    });

    it('should return null when updating an unknown id', async () => {
      expect(await service.updateAgent('nope', { name: 'x' })).toBeNull();
    });

    it('should delete an agent', async () => {
      expect(await service.deleteAgent(seeded.id)).toBe(true);
      expect(await service.getAgent(seeded.id)).toBeNull();
    });

    it('should return false when deleting an unknown id', async () => {
      expect(await service.deleteAgent('nope')).toBe(false);
    });
  });

  describe('streamAgentConfig', () => {
    it('should emit a status event then a config event when no LLM is configured', async () => {
      const events = [];
      for await (const ev of service.streamAgentConfig({ description: '帮我分析数据并生成报告' })) {
        events.push(ev);
      }

      expect(events.map(e => e.type)).toEqual(['status', 'status', 'config']);
      const config = events.at(-1)!.data;
      expect(config.name).toBe('数据分析助手');
      expect(config.icon).toBe('📊');
    });

    it('should emit a template-based config matching the description', async () => {
      const events = [];
      for await (const ev of service.streamAgentConfig({ description: '我需要客服回复咨询' })) {
        events.push(ev);
      }

      expect(events.at(-1)!.data.name).toBe('智能客服助手');
    });
  });
});
