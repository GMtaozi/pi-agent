import { BaseTool, type BaseToolOptions } from './base-tool.js';
import { Logger } from '@workforge/logging';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { createDecipheriv, scryptSync } from 'crypto';
import { join, dirname } from 'path';

export interface GenerateAudioResult {
  path: string;
  size: number;
  duration: number;
  model: string;
}

export class GenerateAudioTool extends BaseTool {
  name = 'generate_audio';
  description = 'Generate speech audio from text using AI (TTS)';
  parameters = {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The text to convert to speech' },
      voice: { type: 'string', description: 'Voice ID or name', enum: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] },
      model: { type: 'string', description: 'TTS model to use', enum: ['tts-1', 'tts-1-hd'] },
      outputPath: { type: 'string', description: 'Optional output path relative to workspace' }
    },
    required: ['text']
  };
  label = 'Generate Audio';

  constructor(options: BaseToolOptions) {
    super(options);
    this.logger = new Logger({ service: 'tool:generate_audio', level: 'info' });
  }

   
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  async execute(toolCallId: string, params: any, _signal?: AbortSignal, _onUpdate?: (partial: any) => void): Promise<any> {
    const { text, voice = 'alloy', model = 'tts-1', outputPath } = params;
    const startTime = Date.now();

    this.logger.info('Executing generate_audio', { toolCallId, textLength: text.length, voice, model });

    try {
      // Validate the output path up front so path traversal is rejected before
      // any (costly) API call or file write.
      const filename = outputPath || ('generated-' + Date.now() + '.mp3');
      const relativePath = join('media', filename);
      const fullPath = this.options.workspaceService.validatePath(this.options.workspaceId, relativePath);
      const dir = dirname(fullPath);

      const apiKey = this.getApiKey('openai');
      if (!apiKey) {
        throw new Error('OpenAI API key not configured. Please add your API key in Settings.');
      }

      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify({
          model,
          input: text,
          voice,
          response_format: 'mp3'
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error('OpenAI API error: ' + response.status + ' - ' + error);
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(fullPath, buffer);

      try {
        await this.options.workspaceService.writeFile(this.options.workspaceId, relativePath, '');
      } catch {
        // Ignore
      }

      const duration = Date.now() - startTime;
      this.logger.info('Audio generated successfully', { toolCallId, path: relativePath, size: buffer.length, duration });
      this.options.onToolCall?.('generate_audio', duration, true);

      return {
        content: [{ type: 'text', text: 'Successfully generated audio: ' + relativePath }],
        details: { path: relativePath, size: buffer.length, duration, model } as GenerateAudioResult
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Audio generation failed', { toolCallId, error: error instanceof Error ? error.message : String(error) }, error instanceof Error ? error : undefined);
      this.options.onToolCall?.('generate_audio', duration, false);

      return {
        content: [{ type: 'text', text: 'Error generating audio: ' + (error instanceof Error ? error.message : String(error)) }],
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