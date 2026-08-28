import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';

// Restricted command whitelist. Only read-only / inspection utilities are
// permitted; interpreters (python, node) and privileged tooling (docker,
// kubectl, git, npm, ...) are intentionally excluded to avoid escape vectors.
const ALLOWED_COMMANDS = [
  'ls', 'cat', 'grep', 'find', 'head', 'tail', 'wc', 'echo'
];

// Shell control operators / substitution that indicate command chaining or
// injection attempts. Commands are executed without a shell (execFile), so these
// cannot be interpreted — but we still reject them so clearly malicious input is
// refused up front rather than passed to a binary as literal arguments.
const SHELL_OPERATOR_PATTERN = /[;&|`]|&&|\|\||\$\(|<\(|>|[\r\n]/;

// find(1) can spawn other programs via -exec/-execdir or delete files via
// -delete; disallow those escape hatches even though find itself is allowed.
const FORBIDDEN_FIND_ARGS = ['-exec', '-execdir', '-delete'];

function splitCommand(command: string): string[] {
  const tokens: string[] = [];
  const re = /'([^']*)'|"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(command)) !== null) {
    if (m[1] !== undefined) tokens.push(m[1]);
    else if (m[2] !== undefined) tokens.push(m[2]);
    else if (m[3] !== undefined) tokens.push(m[3]);
  }
  return tokens;
}

function isCommandAllowed(command: string, allowed: string[]): { allowed: boolean; reason?: string } {
  const trimmed = command.trim();

  if (SHELL_OPERATOR_PATTERN.test(trimmed)) {
    return { allowed: false, reason: 'Shell operators are not allowed in commands' };
  }

  const tokens = splitCommand(trimmed);
  const baseCommand = tokens[0];

  if (!baseCommand) {
    return { allowed: false, reason: 'Empty command' };
  }

  if (!allowed.includes(baseCommand)) {
    return { allowed: false, reason: 'Command not allowed: ' + baseCommand };
  }

  if (baseCommand === 'find' && tokens.slice(1).some(arg => FORBIDDEN_FIND_ARGS.includes(arg))) {
    return { allowed: false, reason: 'find does not permit -exec/-execdir/-delete' };
  }

  return { allowed: true };
}

export interface ShellToolContext {
  allowedCommands?: string[];
  blockedPatterns?: RegExp[];
  timeout?: number;
  maxBuffer?: number;
}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
export const shellTools = (context: ShellToolContext = {}): AgentTool<any>[] => {
  const allowedCommands = context.allowedCommands || ALLOWED_COMMANDS;
  const timeout = context.timeout || 30000;
  const maxBuffer = context.maxBuffer || 1024 * 1024;

  return [
    {
      name: 'bash',
      label: 'Bash',
      description: 'Execute a sandboxed shell command in the workspace. Only a restricted set of read-only commands (ls, cat, grep, find, head, tail, wc, echo) is permitted; commands run without a shell and without interpreters.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute' },
          cwd: { type: 'string', description: 'Working directory for the command (relative to workspace)' },
          timeout: { type: 'number', description: 'Timeout in milliseconds (max 120000)' }
        },
        required: ['command']
      },
   
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      async execute(toolCallId: string, params: any, _signal?: AbortSignal, _onUpdate?: (result: AgentToolResult<any>) => void): Promise<AgentToolResult<any>> {
        const commandTimeout = Math.min(params.timeout || timeout, 120000);

        // Validate command (whitelist + no shell operators / find escapes)
        const validation = isCommandAllowed(params.command, allowedCommands);
        if (!validation.allowed) {
          return {
            content: [{ type: 'text', text: 'Error: ' + (validation.reason || 'Command not allowed') }],
            details: { success: false, error: validation.reason, exitCode: -1 }
          };
        }

        const tokens = splitCommand(params.command.trim());
        const cmd = tokens[0];
        const args = tokens.slice(1);
        const cwd = params.cwd || process.cwd();

        try {
          const { execFile } = await import('child_process');

          return new Promise((resolve) => {
            let settled = false;

            const timer = setTimeout(() => {
              if (settled) return;
              settled = true;
              child.kill('SIGTERM');
              resolve({
                content: [{ type: 'text', text: 'Error: Command timed out after ' + commandTimeout + 'ms' }],
                details: { success: false, error: 'Command timed out', exitCode: 124, timedOut: true }
              });
            }, commandTimeout);

            const child = execFile(cmd, args, { cwd, timeout: commandTimeout, maxBuffer }, (error, stdout, stderr) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);

              const output = (stdout || '') + (stderr ? '\n' + stderr : '');
              const success = !error;
              let exitCode = 0;
              if (error) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
                const anyErr = error as any;
                if (anyErr.code === 'ENOENT') exitCode = 127;
                else if (anyErr.killed) exitCode = 124;
                else exitCode = anyErr.code || 1;
              }

              resolve({
                content: [{ type: 'text', text: output || 'Command executed with no output' }],
                details: {
                  success,
                  output,
                  exitCode,
                  error: success ? undefined : (stderr || error?.message || 'Command failed with exit code ' + exitCode)
                }
              });
            });


          });
        } catch (error) {
          return {
            content: [{ type: 'text', text: 'Error: ' + (error instanceof Error ? error.message : 'Failed to execute command') }],
            details: { success: false, error: error instanceof Error ? error.message : 'Failed to execute command', exitCode: -1 }
          };
        }
      }
    }
  ];
};
