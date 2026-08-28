
    export interface AgentEngineOptions {
      retries?: number;
      timeout?: number;
      settingsService?: any;
      workspaceService?: any;
      runtimeConfig?: any;
      tools?: any[];
      systemPrompt?: string;
      skills?: any;
    }
    export interface SessionInfo {
      id: string;
      model: string;
      workspaceId: string;
      createdAt: string;
    }
    export interface RuntimeConfig {
      model: string;
      temperature?: number;
      maxTokens?: number;
    }
    export class AgentEngine {
      constructor(options: AgentEngineOptions);
      prompt(sessionId: string, text: string, workspaceContext?: any): Promise<string>;
    }
  