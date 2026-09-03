import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentService } from '../src/agent-service';

// Mock db and logger
const createMockDb = () => ({
  query: vi.fn(),
});

const createMockLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

describe('AgentService', () => {
  let db: ReturnType<typeof createMockDb>;
  let logger: ReturnType<typeof createMockLogger>;
  let service: AgentService;

  beforeEach(() => {
    db = createMockDb();
    logger = createMockLogger();
    service = new AgentService(db, logger);
  });

  describe('generateFromDescription', () => {
    it('should generate agent from template (customer service)', async () => {
      db.query.mockResolvedValue({ rows: [], rowsAffected: 1 });

      const agent = await service.generateFromDescription({
        description: '我需要一个客服助手来回复客户咨询',
      });

      expect(agent).toBeDefined();
      expect(agent.name).toBe('智能客服助手');
      expect(agent.status).toBe('draft');
      expect(agent.model).toBe('gpt-4o');
      expect(db.query).toHaveBeenCalledTimes(1);
    });

    it('should generate writer agent from template', async () => {
      db.query.mockResolvedValue({ rows: [], rowsAffected: 1 });

      const agent = await service.generateFromDescription({
        description: '请帮我写文章和文案',
      });

      expect(agent.name).toBe('内容创作助手');
      expect(agent.temperature).toBe(0.8);
    });

    it('should generate coder agent from template', async () => {
      db.query.mockResolvedValue({ rows: [], rowsAffected: 1 });

      const agent = await service.generateFromDescription({
        description: '我需要软件工程师来编程和调试程序',
      });

      expect(agent.name).toBe('代码助手');
      expect(agent.temperature).toBe(0.2);
    });

    it('should generate analyst agent from template', async () => {
      db.query.mockResolvedValue({ rows: [], rowsAffected: 1 });

      const agent = await service.generateFromDescription({
        description: '分析业务数据趋势并生成洞察报告',
      });

      expect(agent.name).toBe('数据分析助手');
    });

    it('should generate teacher agent from template', async () => {
      db.query.mockResolvedValue({ rows: [], rowsAffected: 1 });

      const agent = await service.generateFromDescription({
        description: '一位耐心的老师来辅导学生功课',
      });

      expect(agent.name).toBe('教学助手');
    });

    it('should generate default agent for unknown intent', async () => {
      db.query.mockResolvedValue({ rows: [], rowsAffected: 1 });

      const agent = await service.generateFromDescription({
        description: '帮我做点事情',
      });

      expect(agent.name).toBe('通用AI助手');
    });
  });

  describe('streamAgentConfig', () => {
    it('should yield config from fallback when no modelRuntime', async () => {
      const results: any[] = [];
      const generator = service.streamAgentConfig({ description: '客服助手' });
      for await (const event of generator) {
        results.push(event);
      }

      expect(results.some(e => e.type === 'config')).toBe(true);
      const configEvent = results.find(e => e.type === 'config');
      expect(configEvent.data.name).toBeDefined();
    });

    it('should use LLM when modelRuntime is available', async () => {
      const mockStream = async function* () {
        yield { type: 'text_delta', delta: '{"name":"LLM Agent"}' };
        yield { type: 'config', data: { name: 'LLM Agent', description: 'test' } };
      };
      const mockRuntime = {
        stream: vi.fn().mockReturnValue(mockStream()),
      };

      const serviceWithLLM = new AgentService(db, logger, mockRuntime as any);
      const results: any[] = [];
      const generator = serviceWithLLM.streamAgentConfig({ description: '客服助手' });
      for await (const event of generator) {
        results.push(event);
      }

      expect(results.some(e => e.type === 'config')).toBe(true);
    });
  });

  describe('CRUD', () => {
    it('should list agents', async () => {
      db.query.mockResolvedValue({
        rows: [
          { id: 'agent_1', name: 'Test', systemPrompt: 'test', model: 'gpt-4o' },
        ],
      });

      const agents = await service.listAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('Test');
    });

    it('should get agent by id', async () => {
      db.query.mockResolvedValue({
        rows: [{ id: 'agent_1', name: 'Test', systemPrompt: 'test', model: 'gpt-4o' }],
      });

      const agent = await service.getAgent('agent_1');
      expect(agent).not.toBeNull();
      expect(agent?.id).toBe('agent_1');
    });

    it('should return null for non-existent agent', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const agent = await service.getAgent('nonexistent');
      expect(agent).toBeNull();
    });

    it('should update agent', async () => {
      db.query
        .mockResolvedValueOnce({ rowsAffected: 1 }) // UPDATE
        .mockResolvedValueOnce({
          rows: [{ id: 'agent_1', name: 'New', systemPrompt: 'test', model: 'gpt-4o' }],
        }); // getAgent

      const updated = await service.updateAgent('agent_1', { name: 'New' });
      expect(updated).not.toBeNull();
      expect(updated?.name).toBe('New');
    });

    it('should delete agent', async () => {
      db.query.mockResolvedValue({ rowsAffected: 1 });

      const result = await service.deleteAgent('agent_1');
      expect(result).toBe(true);
    });

    it('should not update with disallowed columns', async () => {
      db.query
        .mockResolvedValueOnce({
          rows: [{ id: 'agent_1', name: 'Test', systemPrompt: 'test', model: 'gpt-4o' }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'agent_1', name: 'Test', systemPrompt: 'test', model: 'gpt-4o' }],
        });

      const updated = await service.updateAgent('agent_1', { id: 'hack' } as any);
      expect(updated).not.toBeNull();
      expect(updated?.name).toBe('Test');
    });
  });
});
