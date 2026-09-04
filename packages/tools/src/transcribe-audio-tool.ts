import FormData from 'form-data';
import { BaseTool, type BaseToolOptions } from './base-tool.js';
import { Logger } from '@workforge/logging';
import { readFileSync, existsSync } from 'fs';
import { createDecipheriv, scryptSync } from 'crypto';
import { join } from 'path';

export interface TranscribeAudioResult {
  text: string;
  language?: string;
  duration: number;
  model: string;
}

export class TranscribeAudioTool extends BaseTool {
  name = 'transcribe_audio';
  description = 'Transcribe speech audio to text using AI';
  parameters = {
    type: 'object',
    properties: {
      audioPath: { type: 'string', description: 'Path to the audio file in workspace' },
      model: { type: 'string', description: 'Transcription model', enum: ['whisper-1'] },
      language: { type: 'string', description: 'Language code (e.g. en, zh, ja)' }
    },
    required: ['audioPath']
  };
  label = 'Transcribe Audio';

  constructor(options: BaseToolOptions) {
    super(options);
    this.logger = new Logger({ service: 'tool:transcribe_audio', level: 'info' });
  }

   
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  async execute(toolCallId: string, params: any, _signal?: AbortSignal, _onUpdate?: (partial: any) => void): Promise<any> {
    const { audioPath, model = 'whisper-1', language } = params;
    const startTime = Date.now();

    this.logger.info('Executing transcribe_audio', { toolCallId, audioPath, model });

    try {
      // Validate the requested path before doing anything else so path
      // traversal is rejected regardless of API key availability.
      const fullPath = this.options.workspaceService.validatePath(this.options.workspaceId, audioPath);
      const absolutePath = fullPath;

      const apiKey = this.getApiKey('openai');
      if (!apiKey) {
        throw new Error('OpenAI API key not configured. Please add your API key in Settings.');
      }

      if (!existsSync(absolutePath)) {
        throw new Error('Audio file not found: ' + audioPath);
      }

      const audioBuffer = readFileSync(absolutePath);

      const form = new FormData();
      form.append('file', audioBuffer, { filename: audioPath.split('/').pop() || 'audio.mp3' });
      form.append('model', model);
      if (language) {
        form.append('language', language);
      }

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          ...form.getHeaders()
        },
        body: form as unknown as BodyInit
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error('OpenAI API error: ' + response.status + ' - ' + error);
      }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const data = await response.json() as any;
      const text = data.text;

      if (!text) {
        throw new Error('No transcription returned from API');
      }

      const duration = Date.now() - startTime;
      this.logger.info('Audio transcribed successfully', { toolCallId, textLength: text.length, duration });
      this.options.onToolCall?.('transcribe_audio', duration, true);

      return {
        content: [{ type: 'text', text: 'Transcription: ' + text }],
        details: { text, language: data.language, duration, model } as TranscribeAudioResult
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Audio transcription failed', { toolCallId, error: error instanceof Error ? error.message : String(error) }, error instanceof Error ? error : undefined);
      this.options.onToolCall?.('transcribe_audio', duration, false);

      return {
        content: [{ type: 'text', text: 'Error transcribing audio: ' + (error instanceof Error ? error.message : String(error)) }],
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