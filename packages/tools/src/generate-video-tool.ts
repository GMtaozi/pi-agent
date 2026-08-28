import { BaseTool, type BaseToolOptions } from './base-tool.js';
import { Logger } from '@workforge/logging';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { createDecipheriv, scryptSync } from 'crypto';
import { join, dirname } from 'path';

export interface GenerateVideoResult {
  path: string;
  size: number;
  duration: number;
  model: string;
}

export class GenerateVideoTool extends BaseTool {
  name = 'generate_video';
  description = 'Generate a video from a text prompt using AI';
  parameters = {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'The text prompt describing the video to generate' },
      duration: { type: 'number', description: 'Video duration in seconds', enum: [4, 8, 16] },
      resolution: { type: 'string', description: 'Video resolution', enum: ['720p', '1080p'] },
      outputPath: { type: 'string', description: 'Optional output path relative to workspace' }
    },
    required: ['prompt']
  };
  label = 'Generate Video';

  constructor(options: BaseToolOptions) {
    super(options);
    this.logger = new Logger({ service: 'tool:generate_video', level: 'info' });
  }

   
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  async execute(toolCallId: string, params: any, _signal?: AbortSignal, _onUpdate?: (partial: any) => void): Promise<any> {
    const { prompt, duration = 4, resolution = '720p', outputPath } = params;
    const startTime = Date.now();

    this.logger.info('Executing generate_video', { toolCallId, prompt, duration, resolution });

    try {
      // Validate the output path up front so path traversal is rejected before
      // any (costly) API call or file write.
      const filename = outputPath || ('generated-' + Date.now() + '.mp4');
      const relativePath = join('media', filename);
      const fullPath = this.options.workspaceService.validatePath(this.options.workspaceId, relativePath);
      const dir = dirname(fullPath);

      const apiKey = this.getApiKey('openai');
      if (!apiKey) {
        throw new Error('OpenAI API key not configured. Please add your API key in Settings.');
      }

      const response = await fetch('https://api.openai.com/v1/videos/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify({
          model: 'sora',
          prompt,
          duration,
          resolution
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error('OpenAI API error: ' + response.status + ' - ' + error);
      }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const data = await response.json() as any;
      const videoUrl = data.data?.[0]?.url;

      if (!videoUrl) {
        throw new Error('No video URL returned from API');
      }

      const videoResponse = await fetch(videoUrl);
      if (!videoResponse.ok) {
        throw new Error('Failed to download video');
      }

      const buffer = Buffer.from(await videoResponse.arrayBuffer());

      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(fullPath, buffer);

      try {
        await this.options.workspaceService.writeFile(this.options.workspaceId, relativePath, '');
      } catch {
        // Ignore
      }

      const actualDuration = Date.now() - startTime;
      this.logger.info('Video generated successfully', { toolCallId, path: relativePath, size: buffer.length, duration: actualDuration });
      this.options.onToolCall?.('generate_video', actualDuration, true);

      return {
        content: [{ type: 'text', text: 'Successfully generated video: ' + relativePath }],
        details: { path: relativePath, size: buffer.length, duration: actualDuration, model: 'sora' } as GenerateVideoResult
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Video generation failed', { toolCallId, error: error instanceof Error ? error.message : String(error) }, error instanceof Error ? error : undefined);
      this.options.onToolCall?.('generate_video', duration, false);

      return {
        content: [{ type: 'text', text: 'Error generating video: ' + (error instanceof Error ? error.message : String(error)) }],
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