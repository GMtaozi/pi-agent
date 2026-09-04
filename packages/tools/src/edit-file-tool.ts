import { BaseTool, type BaseToolOptions } from './base-tool.js';
import { Logger } from '@workforge/logging';

export interface EditFileResult {
  path: string;
  oldText: string;
  newText: string;
}

export class EditFileTool extends BaseTool {
  name = 'edit_file';
  description = 'Edit a file by replacing old text with new text';
  parameters = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The path to the file to edit' },
      oldText: { type: 'string', description: 'The exact text to replace' },
      newText: { type: 'string', description: 'The new text to insert' }
    },
    required: ['path', 'oldText', 'newText']
  };
  label = 'Edit File';

  constructor(options: BaseToolOptions) {
    super(options);
    this.logger = new Logger({ service: 'tool:edit_file', level: 'info' });
  }

   
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  async execute(toolCallId: string, params: any, _signal?: AbortSignal, _onUpdate?: (partial: any) => void): Promise<any> {
    const { path, oldText, newText } = params;
    const startTime = Date.now();
    
    this.logger.info('Executing edit_file', { toolCallId, path });
    
    try {
      const currentContent = await this.options.workspaceService.readFile(this.options.workspaceId, path);
      
      if (!currentContent.includes(oldText)) {
        this.logger.warn('Edit file failed - text not found', { toolCallId, path });
        this.options.onToolCall?.('edit_file', Date.now() - startTime, false);
        
        return {
          content: [{ type: 'text', text: 'Error: The specified text was not found in the file' }],
          details: { path, error: 'Text not found' },
          isError: true
        };
      }
      
      const newContent = currentContent.replace(oldText, newText);
      await this.options.workspaceService.writeFile(this.options.workspaceId, path, newContent);
      
      this.logger.info('Edit file success', { toolCallId, path });
      this.options.onToolCall?.('edit_file', Date.now() - startTime, true);
      
      return {
        content: [{ type: 'text', text: 'Successfully edited ' + path }],
        details: { path, oldText, newText } as EditFileResult
      };
    } catch (error) {
      this.logger.error('Edit file failed', { toolCallId, path, error: error instanceof Error ? error.message : String(error) }, error instanceof Error ? error : undefined);
      this.options.onToolCall?.('edit_file', Date.now() - startTime, false);
      
      return {
        content: [{ type: 'text', text: 'Error editing file: ' + (error instanceof Error ? error.message : String(error)) }],
        details: { path, error: error instanceof Error ? error.message : String(error) },
        isError: true
      };
    }
  }
}