import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';
import type { ExecutionToolContext } from '@earendil-works/pi-agent-core/src/harness/tools/tool-context';

export interface FileToolContext extends ExecutionToolContext {
  workspaceService: {
    readFile: (workspaceId: string, path: string) => Promise<string>;
    writeFile: (workspaceId: string, path: string, content: string) => Promise<void>;
    listFiles: (workspaceId: string, dirPath: string) => Promise<Array<{ name: string; path: string; isDirectory: boolean }>>;
  };
  getWorkspaceId: () => string;
}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
export const fileTools: AgentTool<any>[] = [
  {
    name: 'read_file',
    label: 'Read File',
    description: 'Read a file from the workspace. Returns the file content as text.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the file within the workspace' }
      },
      required: ['path']
    },
   
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    async execute(toolCallId: string, params: any, _signal?: AbortSignal, _onUpdate?: (result: AgentToolResult<any>) => void): Promise<AgentToolResult<any>> {
      try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        const context = _signal as any;
        const workspaceId = context?.getWorkspaceId?.() || 'default';
        const content = await context.workspaceService.readFile(workspaceId, params.path);
        return {
          content: [{ type: 'text', text: content }],
          details: { success: true, content }
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: 'Error: ' + (error instanceof Error ? error.message : 'Failed to read file') }],
          details: { success: false, error: error instanceof Error ? error.message : 'Failed to read file' }
        };
      }
    }
  },
  {
    name: 'write_file',
    label: 'Write File',
    description: 'Write content to a file in the workspace. Creates the file if it does not exist.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the file within the workspace' },
        content: { type: 'string', description: 'Content to write to the file' }
      },
      required: ['path', 'content']
    },
   
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    async execute(toolCallId: string, params: any, _signal?: AbortSignal, _onUpdate?: (result: AgentToolResult<any>) => void): Promise<AgentToolResult<any>> {
      try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        const context = _signal as any;
        const workspaceId = context?.getWorkspaceId?.() || 'default';
        await context.workspaceService.writeFile(workspaceId, params.path, params.content);
        return {
          content: [{ type: 'text', text: 'File written: ' + params.path }],
          details: { success: true, message: 'File written: ' + params.path }
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: 'Error: ' + (error instanceof Error ? error.message : 'Failed to write file') }],
          details: { success: false, error: error instanceof Error ? error.message : 'Failed to write file' }
        };
      }
    }
  },
  {
    name: 'edit_file',
    label: 'Edit File',
    description: 'Edit a file by replacing a specific string with new content. Returns success if the old string was found and replaced.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the file within the workspace' },
        old_string: { type: 'string', description: 'The exact text to replace' },
        new_string: { type: 'string', description: 'The replacement text' }
      },
      required: ['path', 'old_string', 'new_string']
    },
   
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    async execute(toolCallId: string, params: any, _signal?: AbortSignal, _onUpdate?: (result: AgentToolResult<any>) => void): Promise<AgentToolResult<any>> {
      try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        const context = _signal as any;
        const workspaceId = context?.getWorkspaceId?.() || 'default';
        const content = await context.workspaceService.readFile(workspaceId, params.path);
        
        if (!content.includes(params.old_string)) {
          return {
            content: [{ type: 'text', text: 'Error: The specified string was not found in the file' }],
            details: { success: false, error: 'The specified string was not found in the file' }
          };
        }
        
        const newContent = content.replace(params.old_string, params.new_string);
        await context.workspaceService.writeFile(workspaceId, params.path, newContent);
        return {
          content: [{ type: 'text', text: 'File edited: ' + params.path }],
          details: { success: true, message: 'File edited: ' + params.path }
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: 'Error: ' + (error instanceof Error ? error.message : 'Failed to edit file') }],
          details: { success: false, error: error instanceof Error ? error.message : 'Failed to edit file' }
        };
      }
    }
  },
  {
    name: 'list_directory',
    label: 'List Directory',
    description: 'List files and directories in a workspace path.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative directory path within the workspace (empty for root)' }
      },
      required: []
    },
   
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    async execute(toolCallId: string, params: any, _signal?: AbortSignal, _onUpdate?: (result: AgentToolResult<any>) => void): Promise<AgentToolResult<any>> {
      try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        const context = _signal as any;
        const workspaceId = context?.getWorkspaceId?.() || 'default';
        const files = await context.workspaceService.listFiles(workspaceId, params.path || '');
        return {
          content: [{ type: 'text', text: JSON.stringify(files) }],
          details: { success: true, files }
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: 'Error: ' + (error instanceof Error ? error.message : 'Failed to list directory') }],
          details: { success: false, error: error instanceof Error ? error.message : 'Failed to list directory' }
        };
      }
    }
  }
];