import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { WorkspaceService, FileReferenceParser } from '@workforge/workspace';
import type {  } from '@earendil-works/pi-ai/src/types.ts';

export interface FileContext {
  path: string;
  content: string;
  size: number;
}

export interface WorkspaceContext {
  workspaceId: string;
  files: Array<{ path: string; name: string; size?: number }>;
  referencedFiles: FileContext[];
}

export class ContextBuilder {
  private workspaceService: WorkspaceService;
  constructor(workspaceService: WorkspaceService) {
    this.workspaceService = workspaceService;
  }

  async buildWorkspaceContext(
    workspaceId: string,
    userMessage: string,
    maxFiles: number = 20,
    maxFileSize: number = 50000
  ): Promise<WorkspaceContext> {
    // Get file list
    const files = await this.workspaceService.listFiles(workspaceId);
    const fileList = files.map(f => ({
      path: f.path,
      name: f.name,
      size: f.size
    })).slice(0, maxFiles);

    // Parse file references from user message
    const parsed = FileReferenceParser.parse(userMessage);
    const referencedFiles: FileContext[] = [];

    // Read content of referenced files
    for (const ref of parsed.fileRefs) {
      try {
        const content = await this.workspaceService.readFile(workspaceId, ref.path);
        if (content.length <= maxFileSize) {
          referencedFiles.push({
            path: ref.path,
            content,
            size: content.length
          });
        }
      } catch (e) {
        // File not found or inaccessible, skip
        console.warn('Failed to read referenced file:', ref.path, e);
      }
    }

    return {
      workspaceId,
      files: fileList,
      referencedFiles
    };
  }

  buildSystemPrompt(workspaceContext: WorkspaceContext): string {
    const lines: string[] = [];

    lines.push('You are an AI assistant working in a software development workspace.');
    lines.push('');
    lines.push('## Workspace Files');
    lines.push('The workspace contains the following files:');
    lines.push('');

    if (workspaceContext.files.length === 0) {
      lines.push('(empty)');
    } else {
      for (const file of workspaceContext.files) {
        lines.push('- ' + file.path + (file.size ? ' (' + file.size + ' bytes)' : ''));
      }
    }

    lines.push('');
    lines.push('## Referenced Files');
    lines.push('The user has referenced the following files in their message:');
    lines.push('');

    if (workspaceContext.referencedFiles.length === 0) {
      lines.push('(none)');
    } else {
      for (const file of workspaceContext.referencedFiles) {
        lines.push('### ' + file.path);
        lines.push('```');
        lines.push(file.content);
        lines.push('```');
        lines.push('');
      }
    }

    lines.push('');
    lines.push('When the user references a file by name or path, you can read, edit, or write to it.');
    lines.push('Use the available tools to modify files in the workspace.');

    return lines.join('\n');
  }

  buildUserMessageWithContext(
    userMessage: string,
    workspaceContext: WorkspaceContext
  ): AgentMessage {
    const referencedCount = workspaceContext.referencedFiles.length;

    let content = userMessage;

    if (referencedCount > 0) {
      content += '\n\n## Referenced Files\n';
      for (const file of workspaceContext.referencedFiles) {
        content += `### ${file.path}\n\`\`\`\n${file.content}\n\`\`\`\n\n`;
      }
    }

    return {
      role: 'user',
      content: [{ type: 'text', text: content }],
      timestamp: Date.now()
    };
  }
}