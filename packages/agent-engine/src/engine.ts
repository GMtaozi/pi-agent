import { Agent } from '@earendil-works/pi-agent-core';
import type { AgentMessage, AgentTool, AgentEvent, AgentToolResult } from '@earendil-works/pi-agent-core/src/types.ts';
import { SettingsService } from '@workforge/settings';
import { WorkspaceService } from '@workforge/workspace';
import { SkillsService } from '@workforge/skills';
import { executeSkillTool } from '@workforge/sandbox';
import { ContextBuilder, WorkspaceContext } from '@workforge/workspace';
import { Logger } from '@workforge/logging';
import { ModelRuntime } from '@workforge/provider-runtime';
import { createWorkspaceTools } from '@workforge/tools';
import { PolicyAction } from '@workforge/governance';
import { join } from 'node:path';
import { ModelRouter } from './model-router.js';
import { ModelSelector, SelectorContext } from './model-selector.js';
import './tools/file-tools.js';
import { shellTools } from './tools/shell-tools.js';
import { webTools } from './tools/web-tools.js';
import { ptcTools } from './tools/ptc-tools.js';

export interface ProviderConfig {
  id: string;
  apiKey?: string;
  getApiKey?: (providerId: string) => string | undefined;
  baseUrl?: string;
}

export interface RuntimeConfig {
  providers: ProviderConfig[];
  defaultProvider?: string;
}

export interface SessionInfo {
  id: string;
  model: string;
  mode: string;
}

export interface AgentEngineOptions {
  retries?: number;
  timeout?: number;
  settingsService: SettingsService;
  workspaceService: WorkspaceService;
  runtimeConfig?: RuntimeConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  tools?: AgentTool<any>[];
  systemPrompt?: string;
  skills?: SkillsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  governanceService?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  messageRepository?: any;
  apiBaseUrl?: string;
  /** 返回最新 providers 配置（含动态 getApiKey），用于配置变更后重建运行时 */
  getProviders?: () => ProviderConfig[];
}

export interface StreamCallback {
  onEvent: (event: AgentEvent) => void;
  onComplete: (response: string) => void;
  onError: (error: Error) => void;
}

export class AgentEngine {
  private sessions = new Map<string, Agent>();
  private settingsService: SettingsService;
  private workspaceService: WorkspaceService;
  private runtime: ModelRuntime;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  private defaultTools: AgentTool<any>[];
  private defaultSystemPrompt: string;
  private contextBuilder: ContextBuilder;
  // 同一 sessionId 可能同时存在多个 SSE 连接（常驻连接 + 每次发送新建的连接）。
  // 用 Set 保存多个回调并广播事件，避免单个连接关闭时误删其他连接的回调，
  // 否则首条消息的事件会因回调被删而丢失。
  private sessionStreams = new Map<string, Set<StreamCallback>>();

  private emitStream(sessionId: string, emit: (cb: StreamCallback) => void): void {
    const callbacks = this.sessionStreams.get(sessionId);
    if (!callbacks) return;
    for (const cb of callbacks) {
      try {
        emit(cb);
      } catch {
        // 单个回调失败不影响其他连接
      }
    }
  }
  private sessionWorkspaceIds = new Map<string, string>();
  private sessionRequestIds = new Map<string, string>();
  private logger: Logger;
  private retries: number;
  private timeout: number;
  private skills: SkillsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  private governanceService: any;
  private readonly MAX_TURNS = 50;
  private sessionTurnCounts = new Map<string, number>();
  private sessionRunTurnCounts = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  private messageRepository: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  private sessionRepository: any;
  private messagePersistenceStacks = new Map<string, string[]>();
  private modelRouter: ModelRouter;
  private modelSelector: ModelSelector;
  private getProviders?: () => ProviderConfig[];

  // Temporary model capability overrides until ModelRuntime exposes them.
  private readonly MODEL_CONFIGS: Record<string, { contextWindow: number; maxTokens: number }> = {
    'deepseek-chat': { contextWindow: 128000, maxTokens: 8192 },
    'deepseek-reasoner': { contextWindow: 128000, maxTokens: 8192 },
    'step-3.7-flash': { contextWindow: 64000, maxTokens: 4096 },
    'step-2-16k': { contextWindow: 16384, maxTokens: 4096 },
    'default': { contextWindow: 32768, maxTokens: 4096 },
  };

  private getModelCap(model: string): { contextWindow: number; maxTokens: number } {
    return this.MODEL_CONFIGS[model] || this.MODEL_CONFIGS['default'];
  }

  constructor(options: AgentEngineOptions) {
    this.logger = new Logger({ service: 'agent-engine', level: 'info' });
    this.retries = options.retries ?? 3;
    this.timeout = options.timeout ?? 60000;

    this.settingsService = options.settingsService;
    this.workspaceService = options.workspaceService;
    this.runtime = new ModelRuntime(options.runtimeConfig || { providers: [] });
    this.defaultTools = options.tools || [];
    this.defaultSystemPrompt = options.systemPrompt || '';
    this.contextBuilder = new ContextBuilder(options.workspaceService);
    this.skills = options.skills || new SkillsService();
    this.governanceService = options.governanceService;
    this.messageRepository = options.messageRepository;
    this.modelRouter = new ModelRouter({ apiBaseUrl: options.apiBaseUrl });
    this.modelSelector = new ModelSelector({ apiBaseUrl: options.apiBaseUrl });
    this.getProviders = options.getProviders;
  }

  /** 配置（供应商/密钥）变更后调用，用最新配置重建模型运行时，使改动立即生效 */
  async syncProviders(): Promise<void> {
    if (typeof this.getProviders !== 'function') return;
    const providers = this.getProviders();
    await this.runtime.refreshProviders(providers);
  }

  async initialize(): Promise<void> {
    await this.runtime.initialize();
  }

  async createSession(model: string, mode: string = 'standard', workspaceId?: string, providerId?: string): Promise<SessionInfo> {
    return this.createSessionInternal(model, mode, workspaceId, providerId);
  }

  private async createSessionInternal(model: string, mode: string = 'standard', workspaceId?: string, providerId?: string, existingId?: string): Promise<SessionInfo> {
    const id = existingId || ('session-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
    const resolvedWorkspaceId = workspaceId || '';
    
    // Get enabled skill tools and prompts
    const skillTools = this.getSkillTools();
    const skillPrompts = this.getSkillPrompts();
    
    // Get workspace tools (file operations)
    const wsTools = createWorkspaceTools(this.workspaceService, resolvedWorkspaceId, (toolName, duration, success) => {
      this.logger.debug('Tool call', { toolName, duration, success, sessionId: id });
    });
    
    // Get mode-specific tools
    const modeTools = this.getToolsForMode(mode, resolvedWorkspaceId);
    
    // Add runtime/system tools: model self-awareness and workspace exploration
    const workspaceServiceRef = this.workspaceService;
    const resolvedWorkspaceIdRef = resolvedWorkspaceId;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const systemTools: AgentTool<any>[] = [
      {
        name: 'get_current_model',
        label: 'Get Current Model',
        description: 'Return the actual model and provider this session is running on. Use this whenever the user asks what model you are, which provider you use, or any identity/runtime question.',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        },
    
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        async execute(_toolCallId: string, _params: any): Promise<AgentToolResult<any>> {
          const providerName = resolvedProvider || 'deepseek';
          const modelName = model || 'deepseek-chat';
          const text = [
            `Current model: ${modelName}`,
            `Provider: ${providerName}`
          ].join('\n');
          return {
            content: [{ type: 'text', text }],
            details: { model: modelName, provider: providerName }
          };
        }
      },
      {
        name: 'list_directory',
        label: 'List Directory',
        description: 'List files and directories in the workspace. Use this to explore the project structure before making changes.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative directory path within the workspace (empty for root)' }
          },
          required: []
        },
    
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        async execute(_toolCallId: string, params: any): Promise<AgentToolResult<any>> {
          try {
            const files = await workspaceServiceRef.listFiles(resolvedWorkspaceIdRef, params.path || '');
            const text = files.map(f => (f.isDirectory ? '[DIR] ' : '[FILE] ') + f.path).join('\n') || '(empty)';
            return {
              content: [{ type: 'text', text }],
              details: { success: true, files }
            };
          } catch (error) {
            return {
              content: [{ type: 'text', text: 'Error: ' + (error instanceof Error ? error.message : 'Failed to list directory') }],
              details: { success: false, error: error instanceof Error ? error.message : 'Failed to list directory' }
            };
          }
        }
      },
    ];
    
    // Wrap tools with governance interception if available
    
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const governanceWrapped = this.governanceService ? (tool: any) => this.wrapToolWithGovernance(tool, id) : (tool: any) => tool;
    const allTools = [...wsTools, ...modeTools, ...systemTools, ...(this.defaultTools), ...skillTools].map(governanceWrapped);
    
    // Build model configuration for the Agent
    // Use the model name as-is; provider resolution happens in streamFn
    const resolvedProvider = providerId || 'deepseek';
    const settings = this.settingsService.getSettings();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const customProviders = (settings as any).customProviders || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const customProvider = customProviders.find((cp: any) => cp.id === resolvedProvider);
    const modelCap = this.getModelCap(model);
    const modelConfig = {
      id: model || 'deepseek-chat',
      name: model || 'DeepSeek Chat',
      api: 'openai',
      provider: resolvedProvider,
      baseUrl: customProvider?.baseURL || (resolvedProvider === 'stepfun' ? 'https://api.stepfun.com/step_plan/v1' : 'https://api.deepseek.com/v1'),
      reasoning: false,
      input: [],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: modelCap.contextWindow,
      maxTokens: modelCap.maxTokens
    };
    
    // Build combined system prompt
    const modePrompt = this.getSystemPromptForMode(mode);
    const systemPrompt = this.buildSystemPrompt(modePrompt, skillPrompts, model, resolvedProvider);
    
    const agent = new Agent({
      sessionId: id,
      initialState: {
        systemPrompt,
        tools: allTools,
        model: modelConfig,
      },
      streamFn: this.createStreamFn(),
      transformContext: async (messages) => this.transformContextForWindow(messages, modelConfig),
      prepareNextTurnWithContext: async (turnContext) => {
        if (turnContext.message.stopReason === 'length') {
          const recoveryText = '\n\n--- Context Recovery ---\nYour previous response was truncated because it reached the output token limit. Continue the task from where you left off. Use a more concise response, and if you need to call tools, issue only the most essential ones with complete arguments.';
          const currentPrompt = turnContext.context.systemPrompt || '';
          if (currentPrompt.length < 4096) {
            return {
              context: {
                ...turnContext.context,
                systemPrompt: currentPrompt + recoveryText,
              },
            };
          }
          this.logger.warn('Skipping context recovery prompt injection: systemPrompt already large', {
            sessionId: id,
            systemPromptLength: currentPrompt.length,
          });
        }
        return undefined;
      },
      getApiKey: (provider: string) => {
        return this.settingsService.getApiKey(provider);
      },
    });

    this.sessions.set(id, agent);
    this.sessionWorkspaceIds.set(id, resolvedWorkspaceId);
    return { id, model, mode };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  private getSkillTools(): AgentTool<any>[] {
    // Skills with sandbox code become first-class agent tools:
    // the model can discover and call them during conversation.
    const executable = this.skills.getExecutableSkills();
    return executable.map(skill => {
      const toolName = ('skill_' + skill.id).replace(/[^a-zA-Z0-9_]/g, '_');
      const description = `[Skill] ${skill.name}. ${skill.description || 'Runs this skill inside an isolated sandbox.'} Call this tool when the user request matches the skill's purpose.`;
      return {
        name: toolName,
        label: skill.name,
        description,
        parameters: (skill.parameters && Object.keys(skill.parameters).length)
          ? skill.parameters
          : {
              type: 'object',
              properties: {
                input: { type: 'object', description: 'Optional input payload passed to the skill' }
              },
              required: []
            },
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        async execute(_toolCallId: string, params: any): Promise<AgentToolResult<any>> {
          try {
            // Default schema wraps args under `input`; unwrap so the skill
            // receives its payload at the top level.
            const payload = (params && typeof params === 'object' && !Array.isArray(params) && 'input' in params)
              ? params.input
              : params;
            const result = await executeSkillTool(skill.id, skill.code, payload);
            if (!result.success) {
              return {
                content: [{ type: 'text', text: 'Error: ' + (result.error || 'Sandbox execution failed') }],
                details: { success: false, logs: result.logs, durationMs: result.durationMs }
              };
            }
            return {
              content: [{ type: 'text', text: JSON.stringify(result.output ?? null) }],
              details: { success: true, logs: result.logs, durationMs: result.durationMs }
            };
          } catch (error) {
            return {
              content: [{ type: 'text', text: 'Error: ' + (error instanceof Error ? error.message : 'Sandbox execution failed') }],
              details: { success: false }
            };
          }
        }
      };
    });
  }

  private getSkillPrompts(): string[] {
    const prompts: string[] = [];
    const enabledSkills = this.skills.listEnabled();
    
    for (const skill of enabledSkills) {
      if (skill.manifest.prompt) {
        prompts.push(skill.manifest.prompt);
      }
    }
    
    return prompts;
  }

  private buildSystemPrompt(modePrompt: string, skillPrompts: string[], modelName?: string, providerName?: string): string {
    const skillPromptSection = skillPrompts.length > 0 
      ? '\n\n--- Active Skills ---\n' + skillPrompts.join('\n\n')
      : '';
    
    const runtimeSection = modelName
      ? `\n\n--- Runtime Model ---\nYou are running on model: ${modelName}. Provider: ${providerName || 'unknown'}. When the user asks what model you are using, answer truthfully with this runtime model identity.`
      : '';
    
    return modePrompt + runtimeSection + skillPromptSection;
  }

  private getSystemPromptForMode(mode: string): string {
    const base = `You are an autonomous software engineer agent running inside WorkForge. Your job is not to chat, but to understand the user's real intent and take concrete actions to complete tasks.

## Core Identity
- You are an agent, not an assistant. You execute tasks, you don't just discuss them.
- You have direct access to the user's workspace through tools.
- You can read files, write files, run commands, and search the web.
- When asked about your model, answer truthfully with the runtime model identity.

## Tool Usage Principles
- For simple queries or greetings, answer directly without calling any tools.
- Before reading or modifying a file, first call list_directory to understand the project structure.
- Only call write_file or edit_file when you know exactly which file needs to change and what the change should be.
- Use bash for running tests, builds, git operations, or any command-line task.
- Use web_search/web_fetch when you need external documentation or current information.
- Minimize unnecessary tool calls: prefer one well-targeted action over many exploratory ones.

## Operating Principles
- Treat every user message as a task to execute, not a question to answer.
- Before acting, infer the real goal: what does the user actually want to change, build, fix, or verify?
- If the request is vague, make a reasonable assumption, state your plan briefly, and start executing.
- Prefer actions over explanations. Show results through code changes, commands, or files.
- If a task is too large, break it into steps and execute them one by one.
- Always ground your decisions in the actual workspace files and project context.

## Workflow
1. Understand the request and the current workspace state.
2. List directory contents if you need to understand the project structure.
3. Read relevant files before making changes.
4. Choose the minimal sufficient action.
5. Execute using the available tools.
6. Verify the outcome by reading files, running commands, or checking outputs.
7. Summarize what changed and whether the task is complete.

## Available Tools
- list_directory: List files and directories in the workspace. Use this FIRST to understand the project structure.
- read_file: Read the contents of a file. Use this to understand existing code before editing.
- write_file: Create or overwrite a file. Use this for new files or complete rewrites.
- edit_file: Edit a file by replacing exact text. Use this for targeted changes.
- bash: Execute shell commands (git, npm, node, tests, etc.). Use this for building, testing, and git operations.
- web_search: Search the web for documentation and solutions.
- web_fetch: Fetch a web page and return its text content.
- get_current_model: Return the current model and provider. Use this when asked about your runtime.

## Tool Selection Rules
- ALWAYS start with list_directory if you don't know the project structure.
- ALWAYS read a file before editing it.
- Use bash for any command-line operation (git, npm, test, build).
- Use edit_file for small changes, write_file for new files or large rewrites.
- Never guess file contents - always read first.

## Safety
- Do not run destructive commands without explicit user approval.
- Do not delete or overwrite important files without confirmation.
- Stay within the workspace boundary unless the user explicitly asks otherwise.`;

    if (mode === 'ptc') {
      return base + `

## PTC Mode
- You may execute TypeScript snippets when it helps with refactoring, data transformation, or batch operations.
- Use execution as a tool, not as a substitute for reasoning.
- Always validate execution results before continuing.`;
    }

    return base;
  }

  private getWorkspacePath(workspaceId: string): string {
    // Get workspace path from workspaceService
    // For now, return a default path based on workspaceId
    return join(process.cwd(), 'workspaces', workspaceId);
  }

   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  private wrapToolWithGovernance(tool: any, sessionId?: string): any {
    // Skill sandbox tools execute inside the sandbox isolation boundary;
    // they are exempt from policy action mapping (which defaults unknown
    // actions to deny) but keep the pre/post execution logging.
    if (typeof tool?.name === 'string' && tool.name.startsWith('skill_')) {
      return tool;
    }
    const originalExecute = tool.execute.bind(tool);
    if (typeof originalExecute !== 'function') return tool;
    
    const toolNameToPolicyAction: Record<string, PolicyAction> = {
      read_file: 'read',
      list_directory: 'read',
      get_current_model: 'read',
      web_search: 'read',
      runTypeScript: 'bash',
      bash: 'bash',
      write_file: 'write',
      edit_file: 'edit'
    };
    
    return {
      ...tool,
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      execute: async (toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: (result: any) => void) => {
        const action = toolNameToPolicyAction[tool.name] || (tool.name as PolicyAction);
        const requestId = sessionId ? this.sessionRequestIds.get(sessionId) : undefined;
        this.logger.info('[Tool] pre-execution', { tool: tool.name, action, sessionId, requestId, args: JSON.stringify(params).slice(0, 200), timestamp: Date.now() });
        
        // Build governance context from available execution info
        const governanceContext: Record<string, unknown> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        const signalContext = signal as any;
        if (typeof signalContext?.getWorkspaceId === 'function') {
          governanceContext.workspaceId = signalContext.getWorkspaceId();
        }
        if (params?.path) {
          governanceContext.filePath = params.path;
        } else if (params?.filePath) {
          governanceContext.filePath = params.filePath;
        }
        
        const decision = this.governanceService?.evaluate(action, Object.keys(governanceContext).length > 0 ? governanceContext : undefined);
        
        if (decision && !decision.allowed) {
          this.logger.warn('[Tool] denied', { tool: tool.name, action, reason: decision.reason });
          return {
            content: [{ type: 'text', text: 'Action denied: ' + (decision.reason || 'Policy violation') }],
            isError: true
          };
        }
        
		const autoApproveReview = process.env.AUTO_APPROVE_BASH === 'true' || process.env.NODE_ENV === 'development';
		if (decision && decision.level === 'review' && !autoApproveReview) {
			// Phase 2: block execution, create an approval request, and return
			// structured approval metadata so the UI can prompt the user.
			const approvalRequest = await this.governanceService.requestApproval(action, {
            toolName: tool.name,
            toolCallId,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
            sessionId: (signal as any)?.getWorkspaceId?.(),
            filePath: governanceContext.filePath,
            args: params,
          });

          this.logger.warn('Review-level tool blocked pending approval', {
            action,
            toolCallId,
            toolName: tool.name,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
            sessionId: (signal as any)?.getWorkspaceId?.(),
            filePath: governanceContext.filePath,
            approvalId: approvalRequest?.id,
          });

          return {
            content: [{ type: 'text', text: 'This action requires approval before execution.' }],
            isError: true,
            requiresApproval: true,
            approvalId: approvalRequest?.id,
            approvalContext: {
              action,
              toolName: tool.name,
              toolCallId,
              filePath: governanceContext.filePath,
            }
          };
        }
        
        if (decision && decision.level === 'approve') {
          // For actions requiring approval, we auto-approve for now in MVP
          // In production, this would pause and wait for user approval via WebSocket/UI
          this.logger.warn('Action requires approval, auto-approving in MVP', { action, toolCallId });
        }
        
        const startTime = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        let result: any;
        try {
          result = await originalExecute(toolCallId, params, signal, onUpdate);
          const duration = Date.now() - startTime;
          this.logger.info('[Tool] post-execution', { 
            tool: tool.name, 
            action, 
            sessionId,
            requestId,
            duration,
            isError: result?.isError,
            contentLength: Array.isArray(result?.content) ? result.content.length : 0
          });
          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          this.logger.error('[Tool] execution failed', { 
            tool: tool.name, 
            action, 
            duration,
            error: error instanceof Error ? error.message : String(error)
          });
          throw error;
        }
      }
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  private getToolsForMode(mode: string, workspaceId: string): AgentTool<any>[] {
    const workspacePath = this.getWorkspacePath(workspaceId);
    
    // Base tools available in all modes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const baseTools: AgentTool<any>[] = [
      ...shellTools({
        timeout: 30000,
        maxBuffer: 1024 * 1024
      }).map(tool => ({
        ...tool,
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        execute: async (toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: (result: AgentToolResult<any>) => void) => {
          return tool.execute(toolCallId, params, signal, onUpdate);
        }
      })),
      ...webTools({
        httpFetch: this.createHttpFetch()
      }).map(tool => ({
        ...tool,
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        execute: async (toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: (result: AgentToolResult<any>) => void) => {
          return tool.execute(toolCallId, params, signal, onUpdate);
        }
      }))
    ];
    
    // PTC mode adds TypeScript execution
    if (mode === 'ptc') {
      return [
        ...baseTools,
        ...ptcTools({
          workspacePath: workspacePath
        }).map(tool => ({
          ...tool,
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
          execute: async (toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: (result: AgentToolResult<any>) => void) => {
            return tool.execute(toolCallId, params, signal, onUpdate);
          }
        }))
      ];
    }
    
    return baseTools;
  }
  
   
   
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  private createStreamFn(): (model: any, context: any, options?: any) => any {
   
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    return async (model: any, context: any, options?: any) => {
      try {
        const userMessageCount = Array.isArray(context.messages)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
          ? context.messages.filter((m: any) => m.role === 'user').length
          : 0;
        const isFirstTurn = userMessageCount <= 1;

        if (isFirstTurn && Array.isArray(context.tools) && context.tools.length > 0) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
          const lastUserMessage = [...context.messages].reverse().find((m: any) => m.role === 'user');
          const userText = typeof lastUserMessage?.content === 'string'
            ? lastUserMessage.content
            : Array.isArray(lastUserMessage?.content)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
              ? lastUserMessage.content.map((c: any) => c.text || '').join(' ')
              : '';

          const hasWriteIntent = /\b(write|create|make|build|generate|edit|update|modify|implement|add|fix|refactor|replace|insert|append|delete|remove)\b/i.test(userText);
          const baseExplorationTools = new Set([
            'list_directory',
            'read_file',
            'bash',
            'web_search',
            'web_fetch',
            'get_current_model',
          ]);
          const writeTools = new Set([
            'write_file',
            'edit_file',
          ]);

          let filtered = context.tools;
          // Skill sandbox tools are always preserved: the model must be able
          // to call enabled skills regardless of the anchor whitelist.
          const isSkillTool = (name: string) => typeof name === 'string' && name.startsWith('skill_');
          if (!hasWriteIntent) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
            filtered = context.tools.filter((tool: any) => baseExplorationTools.has(tool.name) || isSkillTool(tool.name));
          } else {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
            filtered = context.tools.filter((tool: any) => baseExplorationTools.has(tool.name) || writeTools.has(tool.name) || isSkillTool(tool.name));
          }

          if (filtered.length > 0 && filtered.length !== context.tools.length) {
            context.tools = filtered;
            this.logger.info('Anchor strategy applied', {
              model: model?.id,
              userMessageCount,
              originalToolCount: context.tools.length,
              filteredToolCount: filtered.length,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
              tools: filtered.map((tool: any) => tool.name).join(', '),
              hasWriteIntent,
            });
          }
        }

        // Apply tool routing strategy if available
        if (Array.isArray(context.tools) && context.tools.length > 1) {
          try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
            const lastUserMessage = [...context.messages].reverse().find((m: any) => m.role === 'user');
            const userText = typeof lastUserMessage?.content === 'string'
              ? lastUserMessage.content
              : Array.isArray(lastUserMessage?.content)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
                ? lastUserMessage.content.map((c: any) => c.text || '').join(' ')
                : '';
            const reranked = await this.modelRouter.rerankTools(context.tools, {
              userMessage: userText,
              sessionId: options?.requestId,
            });
            if (reranked.length > 0 && reranked.length === context.tools.length) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
              const originalOrder = context.tools.map((t: any) => t.name);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
              const rerankedOrder = reranked.map((t: any) => t.name);
              const changed = originalOrder.join(',') !== rerankedOrder.join(',');
              context.tools = reranked;
              this.logger.info('[ModelRouter] rerankTools', {
                model: model?.id,
                originalOrder,
                rerankedOrder,
                changed,
                topTool: reranked[0]?.name,
              });
            }
          } catch (error) {
            this.logger.warn('Tool routing strategy skipped', {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        // Extract modelId and providerId from Model object
        let modelId = model?.id || 'deepseek-chat';
        let providerId = model?.provider || 'deepseek';

        // 尊重用户显式选择的模型：仅当未显式指定（默认 deepseek-chat）时才自动切换。
        // 否则自动选择器在内部模型列表请求失败（无认证 401）时会把用户选择的模型
        // 替换为 fallback，导致实际请求用错 provider。
        if (modelId === 'deepseek-chat') {
          // Auto-select model based on context and strategy
          try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
            const lastUserMessage = [...context.messages].reverse().find((m: any) => m.role === 'user');
            const userText = typeof lastUserMessage?.content === 'string'
              ? lastUserMessage.content
              : Array.isArray(lastUserMessage?.content)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
                  ? lastUserMessage.content.map((c: any) => c.text || '').join(' ')
                  : '';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
            const hasImages = context.messages?.some((m: any) => {
              const content = m.content;
              if (Array.isArray(content)) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
                return content.some((c: any) => c.type === 'image' || c.type === 'image_url');
              }
              return false;
            });

            const requiresVision = hasImages || /\b(image|picture|photo|screenshot|vision|see|look|analyze.*image)\b/i.test(userText);
            const requiresReasoning = userText.length > 500 || (context.tools?.length || 0) > 3 || /\b(analyze|reason|think|complex|deep|thorough|investigate)\b/i.test(userText);

            const selectorContext: SelectorContext = {
              userMessage: userText,
              toolCount: context.tools?.length || 0,
              historyLength: context.messages?.length || 0,
              requiresVision,
              requiresReasoning,
            };

            const selectedModel = await this.modelSelector.selectModel(selectorContext);
            if (selectedModel && selectedModel.id !== modelId) {
              this.logger.info('Model auto-selected', {
                previousModel: modelId,
                selectedModel: selectedModel.id,
                provider: selectedModel.provider,
                requiresVision,
                requiresReasoning,
              });
              modelId = selectedModel.id;
              providerId = selectedModel.provider;
            }
          } catch (error) {
            this.logger.warn('Model selection skipped', {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        this.logger.info('Streaming request', { modelId, providerId, contextMessages: context?.messages?.length || 0 });

        // Use ModelRuntime for streaming
        return await this.runtime.stream(modelId, providerId, context, options);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('Stream error:', { error: errorMessage, stack: error instanceof Error ? error.stack : '' });
        throw error;
      }
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  private estimateMessageTokens(message: any): number {
    try {
      const text = typeof message.content === 'string' 
        ? message.content 
        : JSON.stringify(message.content || []);
      return Math.ceil(text.length / 4);
    } catch {
      return 0;
    }
  }

   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  private buildSummaryMessage(messages: any[]): any {
    const summaryText = messages.map(m => {
      const role = m.role || 'unknown';
      let content = '';
      try {
        if (typeof m.content === 'string') {
          content = m.content;
        } else if (Array.isArray(m.content)) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
          content = m.content.map((c: any) => c.text || c.type || '').join(' ');
        }
      } catch {
        content = '[unreadable]';
      }
      return `[${role}] ${content.slice(0, 200)}`;
    }).join('\n');

    return {
      role: 'system',
      content: [
        {
          type: 'text',
          text: `[Context Summary]\nEarlier conversation was summarized to fit the context window.\n${summaryText.slice(0, 4000)}`
        }
      ],
      timestamp: Date.now()
    };
  }

   
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  private async transformContextForWindow(messages: any[], model: any): Promise<any[]> {
    if (!Array.isArray(messages) || messages.length <= 2) {
      return messages;
    }

    const modelCap = this.getModelCap(model?.id || 'deepseek-chat');
    const contextWindow = modelCap.contextWindow || 32768;
    const maxContextTokens = Math.floor(contextWindow * 0.85);
    const reserveTokens = 4096;

    let totalTokens = 0;
    for (const m of messages) {
      totalTokens += this.estimateMessageTokens(m);
    }

    if (totalTokens <= maxContextTokens - reserveTokens) {
      return messages;
    }

    this.logger.warn('Context window limit approaching, summarizing old messages', {
      estimatedTokens: totalTokens,
      contextWindow,
      maxContextTokens,
      messageCount: messages.length
    });

    let cut = messages.length - 6;
    // Keep tool-call pairs atomic: never start the kept window on an orphan tool result,
    // otherwise providers like DeepSeek reject the request with a 400.
    while (cut > 0 && messages[cut]?.role === 'toolResult') {
      cut--;
    }
    const keepRecent = messages.slice(cut);
    const oldMessages = messages.slice(0, cut);

    if (oldMessages.length === 0) {
      return messages;
    }

    const summary = this.buildSummaryMessage(oldMessages);
    return [summary, ...keepRecent];
  }

   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  private createHttpFetch(): (url: string, options?: any) => Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    return async (url: string, options?: any) => {
      const response = await fetch(url, options);
      return response;
    };
  }

  private async resolveWorkspaceContext(sessionId: string, text: string, explicitContext?: WorkspaceContext): Promise<WorkspaceContext | undefined> {
    if (explicitContext) return explicitContext;
    const workspaceId = this.sessionWorkspaceIds.get(sessionId) || '';
    if (!workspaceId) return undefined;
    try {
      return await this.contextBuilder.buildWorkspaceContext(workspaceId, text);
    } catch (e) {
      this.logger.warn('Failed to build workspace context', { sessionId, workspaceId, error: e instanceof Error ? e.message : String(e) });
      return undefined;
    }
  }

  async prompt(sessionId: string, text: string, workspaceContext?: WorkspaceContext, timeoutMs: number = 90000, options?: { requestId?: string }): Promise<string> {
    let agent = this.sessions.get(sessionId);
    if (!agent) {
      // 服务器重启后内存 agent 丢失，尝试从数据库恢复
      agent = await this.recoverSession(sessionId);
      if (!agent) {
        throw new Error('Session not found: ' + sessionId);
      }
    }

    const requestId = options?.requestId || `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.sessionRequestIds.set(sessionId, requestId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    (agent as any).requestId = requestId;
    const startTimestamp = Date.now();
    this.logger.info('[Agent] prompt start', { sessionId, requestId, inputLength: text.length });

    const turnCount = (this.sessionTurnCounts.get(sessionId) || 0) + 1;
    this.sessionTurnCounts.set(sessionId, turnCount);

    if (turnCount > this.MAX_TURNS) {
      const error = new Error('Agent turn limit reached: ' + this.MAX_TURNS);
      this.logger.error('Agent prompt aborted: max turns exceeded', { sessionId, turnCount: this.MAX_TURNS });
      try {
        agent.abort();
      } catch {
        // ignore abort failure
      }
      throw error;
    }

    if (turnCount >= Math.floor(this.MAX_TURNS * 0.8)) {
      this.logger.warn('Agent turn count approaching limit', { sessionId, turnCount, maxTurns: this.MAX_TURNS });
    }

    // Per-run turn counter to catch intra-prompt infinite loops.
    this.sessionRunTurnCounts.set(sessionId, 0);
    agent.shouldStopAfterTurn = async (_context) => {
      const currentRunTurn = (this.sessionRunTurnCounts.get(sessionId) || 0) + 1;
      this.sessionRunTurnCounts.set(sessionId, currentRunTurn);
      if (currentRunTurn >= this.MAX_TURNS) {
        this.logger.error('Agent run aborted: max turns exceeded within prompt', {
          sessionId,
          turnCount: currentRunTurn,
          maxTurns: this.MAX_TURNS,
        });
        try {
          agent.abort();
        } catch {
          // ignore abort failure
        }
        return true;
      }
      if (currentRunTurn >= Math.floor(this.MAX_TURNS * 0.8)) {
        this.logger.warn('Agent run turn count approaching limit', {
          sessionId,
          turnCount: currentRunTurn,
          maxTurns: this.MAX_TURNS,
        });
      }
      return false;
    };

    const _state = agent.state;
    const resolvedContext = await this.resolveWorkspaceContext(sessionId, text, workspaceContext);

    let userMessage: AgentMessage;
    if (resolvedContext) {
      userMessage = this.contextBuilder.buildUserMessageWithContext(text, resolvedContext);
    } else {
      userMessage = {
        role: 'user',
        content: [{ type: 'text', text }],
        timestamp: Date.now()
      };
    }

    // Subscribe to events BEFORE calling prompt() so we don't miss any
    let finalResponse = '';
    let output: any;
    
    const unsubscribe = agent.subscribe((event: AgentEvent) => {
      this.logger.debug('Agent event', { sessionId, eventType: event.type });
      
      this.emitStream(sessionId, (cb) => cb.onEvent(event));
      
      this.persistAgentEvent(sessionId, event).catch(() => {
        // persistence failures are non-fatal
      });
      
      // Capture final response from agent_end event
      if (event.type === 'agent_end' && event.messages) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        const lastAssistant = [...event.messages].reverse().find((m: any) => m.role === 'assistant');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        if (lastAssistant && (lastAssistant as any).content) {
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
          const textBlock = (lastAssistant as any).content.find((c: any) => c.type === 'text');
          if (textBlock) {
            finalResponse = textBlock.text;
          }
          // Log error details when stopReason is error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
          if ((lastAssistant as any).stopReason === 'error') {
            this.logger.error('[Agent] execution failed', {
              sessionId,
              requestId,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
              stopReason: (lastAssistant as any).stopReason,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
              errorMessage: (lastAssistant as any).errorMessage,
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
              contentTypes: (lastAssistant as any).content.map((c: any) => c.type),
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
              contentLength: Array.isArray((lastAssistant as any).content) ? (lastAssistant as any).content.length : 0,
            });
          }
        }
      }
    });

    let timedOut = false;
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      const timeoutError = new Error('Agent prompt timed out after ' + timeoutMs + 'ms');
      this.logger.error('Agent prompt timeout', { sessionId, timeoutMs });
      try {
        agent.abort();
      } catch {
        // ignore abort failure
      }
      this.emitStream(sessionId, (cb) => cb.onError(timeoutError));
    }, timeoutMs);

    try {
      // Agent.prompt() returns void - it communicates through events
      this.logger.debug('Calling agent.prompt()', { sessionId });
      await agent.prompt([userMessage]);
      this.logger.debug('agent.prompt() completed', { sessionId, finalResponseLength: finalResponse.length });
      this.logger.debug('Checking agent state after prompt', { sessionId, messageCount: agent.state?.messages?.length || 0 });
      
      // Inspect last assistant message structure
      const postState = agent.state;
      const postMessages = postState?.messages || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const postLastAssistant = [...postMessages].reverse().find((m: any) => m.role === 'assistant');
      if (postLastAssistant) {
        this.logger.debug('Last assistant message inspect', {
          keys: Object.keys(postLastAssistant),
          hasContent: 'content' in postLastAssistant,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
          contentType: typeof (postLastAssistant as any).content,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
          contentValue: JSON.stringify((postLastAssistant as any).content).slice(0, 500),
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
          contentLength: Array.isArray((postLastAssistant as any).content) ? (postLastAssistant as any).content.length : undefined,
        });
      }
      
      if (timedOut) {
        return finalResponse || 'Agent execution timed out.';
      }
      
      // After prompt completes, check agent state for response
      const currentState = agent.state;
      const messages = currentState?.messages || [];
      this.logger.debug('Agent state messages', { sessionId, messageCount: messages.length });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const lastAssistant = [...messages].reverse().find((m: any) => m.role === 'assistant');
      if (lastAssistant && (lastAssistant as any).content) {
        const textBlock = (lastAssistant as any).content.find((c: any) => c.type === 'text');
        if (textBlock) {
          finalResponse = textBlock.text;
        }
      }
      const result = finalResponse || '';
      this.logger.debug('Prompt result', { sessionId, requestId, resultLength: result.length, result: result.substring(0, 100) });
      this.logger.info('[Agent] prompt end', { sessionId, requestId, inputLength: text.length, duration: Date.now() - startTimestamp });
      if (result) {
        this.emitStream(sessionId, (cb) => cb.onComplete(result));
      } else {
        const lastAssistantMsg = [...(agent.state?.messages || [])].reverse().find((m: any) => m.role === 'assistant');
        const errorMsg = (lastAssistantMsg as any)?.errorMessage || 'Agent returned empty response (possible model error)';
        this.emitStream(sessionId, (cb) => cb.onError(new Error(errorMsg)));
      }
      return result;
    } catch (error) {
      if (output) {
        for (const block of output.content) {
          delete (block as { index?: number }).index;
          delete (block as { partialArgs?: string }).partialArgs;
          delete (block as { customInput?: unknown }).customInput;
          delete (block as { streamIndex?: number }).streamIndex;
        }
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Agent prompt failed:', { sessionId, error: errorMessage, stack: error instanceof Error ? error.stack : '' });
      if (timedOut) {
        return finalResponse || 'Agent execution timed out.';
      }
      this.emitStream(sessionId, (cb) => cb.onError(error instanceof Error ? error : new Error(errorMessage)));
      throw error;
    }
}

/**
 * 从数据库恢复会话（服务器重启后内存 agent 丢失时调用）。
 * 重建 Agent 实例并回放历史消息以恢复上下文。
 */
  private async recoverSession(sessionId: string): Promise<Agent | undefined> {
    if (!this.sessionRepository || !this.messageRepository) return undefined;

    const session = await this.sessionRepository.findById(sessionId);
    if (!session) return undefined;

    const messages = await this.messageRepository.findBySession(sessionId);
    if (!messages || messages.length === 0) return undefined;

    // 用原参数重建 agent
    const recovered = await this.createSessionInternal(session.model, (session.mode as 'standard' | 'ptc') || 'standard', session.workspaceId, this.resolveProviderId(session.model));
    const agent = this.sessions.get(recovered.id);
    if (!agent) return undefined;

    // 恢复 turn 计数
    const userMsgCount = messages.filter((m: any) => m.role === 'user').length;
    this.sessionTurnCounts.set(recovered.id, userMsgCount);

    // 回放历史消息到 agent 状态，恢复上下文
    for (const msg of messages) {
      const content = Array.isArray(msg.content)
        ? msg.content.map((block: any) => ({ type: block.type, text: block.text ?? block.thinking, name: block.name, arguments: block.arguments }))
        : [{ type: 'text', text: msg.content }];
      (agent as any).state.messages.push({ role: msg.role, content, timestamp: msg.createdAt ?? Date.now() });
    }

    // 用原 sessionId 替换新建的（保持一致性）
    this.sessions.delete(recovered.id);
    this.sessions.set(sessionId, agent);
    this.sessionWorkspaceIds.set(sessionId, session.workspaceId);
    this.sessionRequestIds.delete(recovered.id);

    this.logger.info('Session recovered from database', { sessionId, messageCount: messages.length });
    return agent;
  }

  private resolveProviderId(model: string): string {
    if (!model) return 'deepseek';
    if (model.includes('gpt')) return 'openai';
    if (model.includes('claude')) return 'anthropic';
    if (model === 'step-3.7-flash') return 'stepfun';
    const settings = this.settingsService.getSettings();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const customProviders = (settings as any).customProviders || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const match = customProviders.find((cp: any) => cp.models?.some((m: any) => m.id === model));
      return match?.id || 'deepseek';
  }

  async stream(sessionId: string, text: string, workspaceContext?: WorkspaceContext): Promise<void> {
    const agent = this.sessions.get(sessionId);
    if (!agent) {
      throw new Error('Session not found: ' + sessionId);
    }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const requestId = (agent as any).requestId || this.sessionRequestIds.get(sessionId);

    const resolvedContext = await this.resolveWorkspaceContext(sessionId, text, workspaceContext);

    let userMessage: AgentMessage;
    if (resolvedContext) {
      userMessage = this.contextBuilder.buildUserMessageWithContext(text, resolvedContext);
    } else {
      userMessage = {
        role: 'user',
        content: [{ type: 'text', text }],
        timestamp: Date.now()
      };
    }

    const streamCallbacks = this.sessionStreams.get(sessionId);
    if (!streamCallbacks || streamCallbacks.size === 0) {
      throw new Error('No stream callback registered for session: ' + sessionId);
    }

    this.logger.info('[Agent] stream start', { sessionId, requestId, inputLength: text.length });

    const unsubscribe = agent.subscribe((event: AgentEvent) => {
      this.emitStream(sessionId, (cb) => cb.onEvent(event));
      this.persistAgentEvent(sessionId, event).catch(() => {
        // persistence failures are non-fatal
      });
    });

    try {
      await agent.prompt([userMessage]);
      this.logger.info('[Agent] stream end', { sessionId, requestId, inputLength: text.length });
    } finally {
      unsubscribe();
    }
  }

  onStream(sessionId: string, callback: StreamCallback): () => void {
    if (!this.sessionStreams.has(sessionId)) {
      this.sessionStreams.set(sessionId, new Set());
    }
    this.sessionStreams.get(sessionId)!.add(callback);
    return () => {
      const callbacks = this.sessionStreams.get(sessionId);
      if (!callbacks) return;
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.sessionStreams.delete(sessionId);
      }
    };
  }

  // Alias for backward compatibility with server
  onStreamEvent(sessionId: string, callback: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    onEvent: (event: any) => void;
    onComplete: (response: string) => void;
    onError: (error: Error) => void;
  }): () => void {
    return this.onStream(sessionId, {
      onEvent: callback.onEvent,
      onComplete: callback.onComplete,
      onError: callback.onError
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  setMessageRepository(messageRepository: any): void {
    this.messageRepository = messageRepository;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  setSessionRepository(sessionRepository: any): void {
    this.sessionRepository = sessionRepository;
  }

  async stopSession(sessionId: string): Promise<void> {
    const agent = this.sessions.get(sessionId);
    if (agent) {
      this.sessions.delete(sessionId);
      this.sessionStreams.delete(sessionId);
      this.sessionWorkspaceIds.delete(sessionId);
      this.sessionTurnCounts.delete(sessionId);
      this.sessionRunTurnCounts.delete(sessionId);
      this.messagePersistenceStacks.delete(sessionId);
    }
  }

  async abortSession(sessionId: string): Promise<void> {
    const agent = this.sessions.get(sessionId);
    if (agent) {
      try {
        agent.abort();
      } catch {
        // ignore abort failure
      }
    }
  }

  private generateMessageId(sessionId: string): string {
    return sessionId + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  }

  private getMessagePersistenceStack(sessionId: string): string[] {
    if (!this.messagePersistenceStacks.has(sessionId)) {
      this.messagePersistenceStacks.set(sessionId, []);
    }
    return this.messagePersistenceStacks.get(sessionId)!;
  }

  private pushMessagePersistenceId(sessionId: string, id: string): void {
    const stack = this.getMessagePersistenceStack(sessionId);
    stack.push(id);
  }

  private popMessagePersistenceId(sessionId: string): string | undefined {
    const stack = this.getMessagePersistenceStack(sessionId);
    return stack.pop();
  }

  private peekMessagePersistenceId(sessionId: string): string | undefined {
    const stack = this.getMessagePersistenceStack(sessionId);
    return stack.length > 0 ? stack[stack.length - 1] : undefined;
  }

  private async persistAgentEvent(sessionId: string, event: AgentEvent): Promise<void> {
    if (!this.messageRepository) return;

    try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const message = (event as any).message;
      if (!message) {
        return;
      }

      this.logger.debug('Persisting agent event', {
        sessionId,
        eventType: event.type,
        messageRole: message.role,
        contentLength: Array.isArray(message.content) ? message.content.length : typeof message.content,
        contentPreview: JSON.stringify(message.content).slice(0, 200)
      });

      switch (event.type) {
        case 'message_start': {
          const messageId = this.generateMessageId(sessionId);
          this.pushMessagePersistenceId(sessionId, messageId);
          const role = message.role === 'toolResult' ? 'toolResult' : message.role;
          await this.messageRepository.create({
            id: messageId,
            sessionId,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
            role: role as any,
            content: JSON.stringify(message.content),
            createdAt: new Date().toISOString(),
            metadata: { messageId }
          });
          break;
        }
        case 'message_update': {
          // Skip intermediate streaming updates to reduce DB load.
          // The final content is persisted on `message_end`.
          break;
        }
        case 'message_end': {
          const existingId = this.popMessagePersistenceId(sessionId);
          if (existingId) {
            const contentJson = JSON.stringify(message.content);
            await this.messageRepository.updateContent(existingId, contentJson);
          } else {
            this.logger.warn('message_end without active message', {
              sessionId,
              messageRole: message.role,
              contentLength: Array.isArray(message.content) ? message.content.length : typeof message.content
            });
          }
          break;
        }
        default:
          break;
      }
    } catch (error) {
      this.logger.warn('Failed to persist agent event', {
        sessionId,
        eventType: event.type,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}