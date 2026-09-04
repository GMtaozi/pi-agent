import { BaseTool, type BaseToolOptions } from './base-tool.js';
import { Logger } from '@workforge/logging';
import { readFileSync, existsSync } from 'fs';
import { createDecipheriv, scryptSync } from 'crypto';
import { join } from 'path';

export interface AnalyzeImageResult {
  description: string;
  objects?: string[];
  text?: string;
  model: string;
}

export class AnalyzeImageTool extends BaseTool {
  name = 'analyze_image';
  description = 'Analyze an image to understand its content, extract text (OCR), or answer questions about it';
  parameters = {
    type: 'object',
    properties: {
      imagePath: { type: 'string', description: 'Path to the image file in workspace' },
      prompt: { type: 'string', description: 'Question or instruction for image analysis' },
      model: { type: 'string', description: 'Vision model to use', enum: ['gpt-4o', 'gpt-4o-mini'] }
    },
    required: ['imagePath', 'prompt']
  };
  label = 'Analyze Image';

  constructor(options: BaseToolOptions) {
    super(options);
    this.logger = new Logger({ service: 'tool:analyze_image', level: 'info' });
  }

   
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  async execute(toolCallId: string, params: any, _signal?: AbortSignal, _onUpdate?: (partial: any) => void): Promise<any> {
    const { imagePath, prompt, model = 'gpt-4o' } = params;
    const startTime = Date.now();

    this.logger.info('Executing analyze_image', { toolCallId, imagePath, prompt, model });

    try {
      // Validate the requested path before doing anything else so path
      // traversal is rejected regardless of API key availability.
      const fullPath = this.options.workspaceService.validatePath(this.options.workspaceId, imagePath);
      const absolutePath = fullPath;

      const apiKey = this.getApiKey('openai');
      if (!apiKey) {
        throw new Error('OpenAI API key not configured. Please add your API key in Settings.');
      }

      if (!existsSync(absolutePath)) {
        throw new Error('Image file not found: ' + imagePath);
      }

      const imageBuffer = readFileSync(absolutePath);
      const base64Image = imageBuffer.toString('base64');

      let mimeType = 'image/jpeg';
      if (absolutePath.endsWith('.png')) mimeType = 'image/png';
      else if (absolutePath.endsWith('.webp')) mimeType = 'image/webp';
      else if (absolutePath.endsWith('.gif')) mimeType = 'image/gif';

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                {
                  type: 'image_url',
                  image_url: {
                    url: 'data:' + mimeType + ';base64,' + base64Image
                  }
                }
              ]
            }
          ],
          max_tokens: 1000
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error('OpenAI API error: ' + response.status + ' - ' + error);
      }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const data = await response.json() as any;
      const description = data.choices?.[0]?.message?.content || 'No description generated';

      const duration = Date.now() - startTime;
      this.logger.info('Image analyzed successfully', { toolCallId, descriptionLength: description.length, duration });
      this.options.onToolCall?.('analyze_image', duration, true);

      return {
        content: [{ type: 'text', text: description }],
        details: { description, model } as AnalyzeImageResult
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Image analysis failed', { toolCallId, error: error instanceof Error ? error.message : String(error) }, error instanceof Error ? error : undefined);
      this.options.onToolCall?.('analyze_image', duration, false);

      return {
        content: [{ type: 'text', text: 'Error analyzing image: ' + (error instanceof Error ? error.message : String(error)) }],
        details: { error: error instanceof Error ? error.message : String(error) },
        isError: true
      };
    }
  }

  private getApiKey(provider: string): string | undefined {
    try {
      const settingsPath = join(process.env.HOME || process.env.USERPROFILE || '.', '.workforge', 'config.json.enc');
      if (!existsSync(settingsPath)) return undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const encryptedPayload = JSON.parse(readFileSync(settingsPath, 'utf8')) as any;
      const machineId = process.platform + '-' + process.arch + '-' + (process.env.COMPUTERNAME || process.env.HOSTNAME || 'unknown');
      const masterKey = scryptSync('workforge-' + machineId, 'salt', 32);
      const decipher = createDecipheriv('aes-256-gcm', masterKey, Buffer.from(encryptedPayload.iv, 'hex'));
      decipher.setAuthTag(Buffer.from(encryptedPayload.authTag, 'hex'));
      let decrypted = decipher.update(encryptedPayload.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      const settings = JSON.parse(decrypted);
      return settings.apiKeys?.[provider];
    } catch {
      return undefined;
    }
  }
}