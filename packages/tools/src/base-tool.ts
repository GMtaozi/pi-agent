import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core/src/types.js';
import { WorkspaceService } from '@workforge/workspace';
import { Logger } from '@workforge/logging';

export interface BaseToolOptions {
  workspaceService: WorkspaceService;
  workspaceId: string;
  onToolCall?: (toolName: string, duration: number, success: boolean) => void;
}

export abstract class BaseTool implements AgentTool {
  protected logger!: Logger;
  abstract name: string;
  abstract description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  abstract parameters: any;
  abstract label: string;
  
  constructor(protected options: BaseToolOptions) {}
  
   
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  abstract execute(toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: (partial: any) => void): Promise<AgentToolResult<any>>;
}