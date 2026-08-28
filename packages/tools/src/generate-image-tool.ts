import { BaseTool, type BaseToolOptions } from './base-tool.js';
import { Logger } from '@workforge/logging';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { createDecipheriv, scryptSync } from 'crypto';
import { join, dirname } from 'path';

export interface GenerateImageResult {
  path: string;
  size: number;
  model: string;
}

export class GenerateImageTool extends BaseTool {
  name = 'generate_image';
  description = 'Generate an image from a text prompt using AI';
  parameters = {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'The text prompt describing the image to generate' },
      size: { type: 'string', description: 'Image size: 1024x1024, 1792x1024, 1024x1792', enum: ['1024x1024', '1792x1024', '1024x1792'] },
      style: { type: 'string', description: 'Image style: vivid or natural', enum: ['vivid', 'natural'] },
      outputPath: { type: 'string', description: 'Optional output path relative to workspace' }
    },
    required: ['prompt']
  };
  label = 'Generate Image';

  constructor(options: BaseToolOptions) {
    super(options);
    this.logger = new Logger({ service: 'tool:generate_image', level: 'info' });
  }

   
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  async execute(toolCallId: string, params: any, _signal?: AbortSignal, _onUpdate?: (partial: any) => void): Promise<any> {
    const { prompt, size = '1024x1024', style = 'vivid', outputPath } = params;
    const startTime = Date.now();

    this.logger.info('Executing generate_image', { toolCallId, prompt, size, style });

    try {
      // Validate the output path up front so path traversal is rejected before
      // any (costly) API call or file write.
      const filename = outputPath || ('generated-' + Date.now() + '.png');
      const relativePath = join('media', filename);
      const fullPath = this.options.workspaceService.validatePath(this.options.workspaceId, relativePath);
      const dir = dirname(fullPath);

      const apiKey = this.getApiKey('openai');
      if (!apiKey) {
        throw new Error('OpenAI API key not configured. Please add your API key in Settings.');
      }

      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt,
          n: 1,
          size,
          style,
          response_format: 'b64_json'
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error('OpenAI API error: ' + response.status + ' - ' + error);
      }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const data = await response.json() as any;
      const b64Data = data.data?.[0]?.b64_json;

      if (!b64Data) {
        throw new Error('No image data returned from API');
      }

      const buffer = Buffer.from(b64Data, 'base64');

      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(fullPath, buffer);

      // Notify workspace service of change
      try {
        await this.options.workspaceService.writeFile(this.options.workspaceId, relativePath, '');
      } catch {
        // Ignore if workspace service doesn't support binary files
      }

      const duration = Date.now() - startTime;
      this.logger.info('Image generated successfully', { toolCallId, path: relativePath, size: buffer.length, duration });
      this.options.onToolCall?.('generate_image', duration, true);

      return {
        content: [{ type: 'text', text: 'Successfully generated image: ' + relativePath }],
        details: { path: relativePath, size: buffer.length, model: 'dall-e-3' } as GenerateImageResult
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Image generation failed', { toolCallId, error: error instanceof Error ? error.message : String(error) }, error instanceof Error ? error : undefined);
      this.options.onToolCall?.('generate_image', duration, false);

      return {
        content: [{ type: 'text', text: 'Error generating image: ' + (error instanceof Error ? error.message : String(error)) }],
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