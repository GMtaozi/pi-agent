export interface SandboxContext {
  skillId: string;
  /** 用户提交的工具实现：一个接收 input 的函数表达式字符串，如 "function(input){ return input.x }" */
  code: string;
  /** 传给工具函数的输入参数 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  input?: any;
  timeoutMs?: number;
  memoryLimitMb?: number;
}

export interface SandboxResult {
  success: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  output?: any;
  logs?: string[];
  error?: string;
  durationMs: number;
}
