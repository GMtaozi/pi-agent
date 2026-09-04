import { runInSandbox } from './vm-worker-sandbox.js';
import type { SandboxContext, SandboxResult } from './sandbox-types.js';
import { SANDBOX_DEFAULTS, skillSandboxRoot, isPathInsideBase } from './sandbox-config.js';

export type { SandboxContext, SandboxResult };
export { SANDBOX_DEFAULTS, skillSandboxRoot, isPathInsideBase };
export { runInSandbox };

/** 技能工具执行入口：使用平台级默认限制执行技能提交的工具代码。 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
export async function executeSkillTool(skillId: string, code: string, input?: any): Promise<SandboxResult> {
  return runInSandbox({
    skillId,
    code,
    input,
    timeoutMs: SANDBOX_DEFAULTS.timeoutMs,
    memoryLimitMb: SANDBOX_DEFAULTS.memoryLimitMb,
  });
}
