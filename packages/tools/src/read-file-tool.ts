import { BaseTool, type BaseToolOptions } from './base-tool.js';
import { Logger } from '@workforge/logging';

export interface ReadFileResult {
  path: string;
  content: string;
  size: number;
}

export class ReadFileTool extends BaseTool {
  name = 'read_file';
  description = 'Read the contents of a file in the workspace';
  parameters = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The path to the file to read' }
    },
    required: ['path']
  };
  label = 'Read File';

  constructor(options: BaseToolOptions) {
    super(options);
    this.logger = new Logger({ service: 'tool:read_file', level: 'info' });
  }

   
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  async execute(toolCallId: string, params: any, _signal?: AbortSignal, _onUpdate?: (partial: any) => void): Promise<any> {
    const path = params.path;
    const startTime = Date.now();
    
    this.logger.info('Executing read_file', { toolCallId, path });
    
    try {
      const content = await this.options.workspaceService.readFile(this.options.workspaceId, path);
      this.logger.debug('Read file success', { toolCallId, path, size: content.length });
      this.options.onToolCall?.('read_file', Date.now() - startTime, true);
      
      return {
        content: [{ type: 'text', text: content }],
        details: { path, size: content.length } as ReadFileResult
      };
    } catch (error) {
      this.logger.error('Read file failed', { toolCallId, path, error: error instanceof Error ? error.message : String(error) }, error instanceof Error ? error : undefined);
      this.options.onToolCall?.('read_file', Date.now() - startTime, false);
      
      return {
        content: [{ type: 'text', text: 'Error reading file: ' + (error instanceof Error ? error.message : String(error)) }],
        details: { path, error: error instanceof Error ? error.message : String(error) },
        isError: true
      };
    }
  }
}