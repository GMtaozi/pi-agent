import { BaseTool, type BaseToolOptions } from './base-tool.js';
import { Logger } from '@workforge/logging';

export interface WriteFileResult {
  path: string;
  size: number;
}

export class WriteFileTool extends BaseTool {
  name = 'write_file';
  description = 'Write content to a file in the workspace';
  parameters = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The path to the file to write' },
      content: { type: 'string', description: 'The content to write to the file' }
    },
    required: ['path', 'content']
  };
  label = 'Write File';

  constructor(options: BaseToolOptions) {
    super(options);
    this.logger = new Logger({ service: 'tool:write_file', level: 'info' });
  }

   
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  async execute(toolCallId: string, params: any, _signal?: AbortSignal, _onUpdate?: (partial: any) => void): Promise<any> {
    const { path, content } = params;
    const startTime = Date.now();
    
    this.logger.info('Executing write_file', { toolCallId, path, size: content.length });
    
    try {
      await this.options.workspaceService.writeFile(this.options.workspaceId, path, content);
      this.logger.info('Write file success', { toolCallId, path, size: content.length });
      this.options.onToolCall?.('write_file', Date.now() - startTime, true);
      
      return {
        content: [{ type: 'text', text: 'Successfully wrote ' + content.length + ' bytes to ' + path }],
        details: { path, size: content.length } as WriteFileResult
      };
    } catch (error) {
      this.logger.error('Write file failed', { toolCallId, path, error: error instanceof Error ? error.message : String(error) }, error instanceof Error ? error : undefined);
      this.options.onToolCall?.('write_file', Date.now() - startTime, false);
      
      return {
        content: [{ type: 'text', text: 'Error writing file: ' + (error instanceof Error ? error.message : String(error)) }],
        details: { path, error: error instanceof Error ? error.message : String(error) },
        isError: true
      };
    }
  }
}