import { ReadFileTool } from './read-file-tool.js';
import { WriteFileTool } from './write-file-tool.js';
import { EditFileTool } from './edit-file-tool.js';
import { GenerateImageTool } from './generate-image-tool.js';
import { GenerateVideoTool } from './generate-video-tool.js';
import { GenerateAudioTool } from './generate-audio-tool.js';
import { TranscribeAudioTool } from './transcribe-audio-tool.js';
import { AnalyzeImageTool } from './analyze-image-tool.js';
import { existsSync, readFileSync } from 'fs';
import { createDecipheriv, scryptSync } from 'crypto';
import { join } from 'path';
import { WorkspaceService } from '@workforge/workspace';
import type { AgentTool } from '@earendil-works/pi-agent-core/src/types.js';

function hasOpenAIApiKey(): boolean {
  try {
    const settingsPath = join(process.env.HOME || process.env.USERPROFILE || '.', '.workforge', 'config.json.enc');
    if (!existsSync(settingsPath)) return false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const encryptedPayload = JSON.parse(readFileSync(settingsPath, 'utf8')) as any;
    const machineId = process.platform + '-' + process.arch + '-' + (process.env.COMPUTERNAME || process.env.HOSTNAME || 'unknown');
    const masterKey = scryptSync('workforge-' + machineId, 'salt', 32);
    const decipher = createDecipheriv('aes-256-gcm', masterKey, Buffer.from(encryptedPayload.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(encryptedPayload.authTag, 'hex'));
    let decrypted = decipher.update(encryptedPayload.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    const settings = JSON.parse(decrypted);
    return !!settings.apiKeys?.openai;
  } catch {
    return false;
  }
}

export function createWorkspaceTools(workspaceService: WorkspaceService, workspaceId: string, onToolCall?: (toolName: string, duration: number, success: boolean) => void): AgentTool[] {
  const options = { workspaceService, workspaceId, onToolCall };
  const tools = [
    new ReadFileTool(options),
    new WriteFileTool(options),
    new EditFileTool(options),
    new GenerateImageTool(options),
    new GenerateVideoTool(options),
    new GenerateAudioTool(options),
    new TranscribeAudioTool(options),
    new AnalyzeImageTool(options),
  ];

  // Filter tools based on available API keys
  return tools.filter(tool => {
    if (['generate_image', 'analyze_image', 'generate_audio', 'transcribe_audio', 'generate_video'].includes(tool.name)) {
      return hasOpenAIApiKey();
    }
    return true;
  });
}