import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';
import { runTypeScript } from './ptc-worker.js';

export interface PTCToolContext {
  workspacePath?: string;
}

// Forbidden patterns for TypeScript execution
const FORBIDDEN_PATTERNS = [
  /require\s*\(/,
  /import\s+.*from\s+['"]/,
  /process\.env/,
  /process\.exit/,
  /process\.kill/,
  /child_process/,
  /fs\./,
  /path\./,
  /os\./,
  /net\./,
  /http\./,
  /https\./,
  /url\./,
  /dns\./,
  /tls\./,
  /crypto\./,
  /setTimeout/,
  /setInterval/,
  /setImmediate/,
  /queueMicrotask/,
  /process\.nextTick/,
  /__dirname/,
  /__filename/,
  /module\./,
  /exports\./,
  /global\./,
  /window\./,
  /document\./,
  /navigator\./,
  /localStorage/,
  /sessionStorage/,
  /indexedDB/,
  /WebAssembly/,
  /Atomics/,
  /FinalizationRegistry/,
  /Worker\s*\(/,
  /new\s+Worker/,
  /fetch\s*\(/,
  /XMLHttpRequest/,
  /WebSocket/,
  /SharedArrayBuffer/,
  /atob/,
  /blob/,
  /File/,
  /FormData/,
  /Headers/,
  /Request/,
  /Response/
];

function validateTypeScript(code: string): { valid: boolean; reason?: string } {
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) {
      return { valid: false, reason: 'Forbidden pattern detected: ' + pattern.source };
    }
  }
  return { valid: true };
}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
export const ptcTools = (context: PTCToolContext = {}): AgentTool<any>[] => {
  const workspacePath = context.workspacePath || process.cwd();

  return [
    {
      name: 'runTypeScript',
      label: 'Run TypeScript',
      description: 'Execute TypeScript code in a sandboxed environment. Returns the console output and any errors. Useful for data processing, calculations, and quick prototyping.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'The TypeScript code to execute' },
          description: { type: 'string', description: 'Brief description of what the code does' }
        },
        required: ['code']
      },
   
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      async execute(toolCallId: string, params: any, _signal?: AbortSignal, _onUpdate?: (result: AgentToolResult<any>) => void): Promise<AgentToolResult<any>> {
        try {
          // Validate code
          const validation = validateTypeScript(params.code);
          if (!validation.valid) {
            return {
              content: [{ type: 'text', text: 'Error: ' + (validation.reason || 'Code validation failed') }],
              details: { success: false, error: validation.reason }
            };
          }
          
          // Execute in worker thread
          const result = await runTypeScript(params.code, workspacePath);
          
          if (result.success) {
            return {
              content: [{ type: 'text', text: result.output || 'Code executed successfully with no output' }],
              details: {
                success: true,
                output: result.output,
                executionTime: result.executionTime
              }
            };
          } else {
            return {
              content: [{ type: 'text', text: 'Error: ' + (result.error || 'Execution failed') }],
              details: {
                success: false,
                error: result.error,
                output: result.output
              }
            };
          }
        } catch (error) {
          return {
            content: [{ type: 'text', text: 'Error: ' + (error instanceof Error ? error.message : 'Failed to execute TypeScript') }],
            details: {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to execute TypeScript'
            }
          };
        }
      }
    }
  ];
};